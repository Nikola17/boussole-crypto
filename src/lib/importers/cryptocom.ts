// Import de l'historique de l'application Crypto.com (export CSV : Accueil → Comptes → Historique → Exporter).
// Colonnes attendues : Timestamp (UTC), Transaction Description, Currency, Amount, To Currency, To Amount,
// Native Currency, Native Amount, Native Amount (in USD), Transaction Kind, Transaction Hash.
// Les colonnes sont repérées par leur nom ; toute « nature » d'opération inconnue est proposée à l'utilisateur
// (rien n'est deviné en silence).

import type { CoinRef, Transaction } from '../../types';
import { parseCsv, parseNumber } from '../csv';

export type ImportClass = 'ignore' | 'buy' | 'sell' | 'swap' | 'reward' | 'deposit' | 'withdraw';

export const CLASS_LABEL: Record<ImportClass, string> = {
  ignore: 'Ignorer',
  buy: 'Achat (monnaie classique → crypto)',
  sell: 'Vente (crypto → monnaie classique)',
  swap: 'Échange crypto → crypto',
  reward: 'Récompense',
  deposit: 'Entrée de crypto',
  withdraw: 'Sortie de crypto',
};

/** Natures d'opération connues de l'application (en minuscules). */
const KNOWN_KINDS: Record<string, ImportClass> = {
  crypto_purchase: 'buy',
  viban_purchase: 'buy',
  van_purchase_crypto: 'buy',
  recurring_buy_order: 'buy',
  crypto_exchange: 'swap',
  dust_conversion_debited: 'swap',
  dust_conversion_credited: 'swap',
  crypto_viban_exchange: 'sell',
  crypto_deposit: 'deposit',
  crypto_withdrawal: 'withdraw',
  crypto_earn_interest_paid: 'reward',
  mco_stake_reward: 'reward',
  staking_reward: 'reward',
  referral_bonus: 'reward',
  referral_gift: 'reward',
  referral_card_cashback: 'reward',
  reimbursement: 'reward',
  rewards_platform_deposit_credited: 'reward',
  admin_wallet_credited: 'reward',
  // Mouvements internes (Earn, blocage, Supercharger) et flux en monnaie classique : sans effet sur les quantités.
  crypto_earn_program_created: 'ignore',
  crypto_earn_program_withdrawn: 'ignore',
  lockup_lock: 'ignore',
  lockup_upgrade: 'ignore',
  supercharger_deposit: 'ignore',
  supercharger_withdrawal: 'ignore',
  viban_deposit: 'ignore',
  viban_withdrawal: 'ignore',
  card_top_up: 'ignore',
};

/** Proposition pour une nature inconnue (l'utilisateur confirme ou change). */
export function suggestClass(kind: string): ImportClass {
  const k = kind.toLowerCase();
  if (/reward|interest|cashback|bonus|airdrop|gift|referral/.test(k)) return 'reward';
  if (/purchase|buy/.test(k)) return 'buy';
  if (/withdraw/.test(k)) return 'withdraw';
  if (/deposit/.test(k)) return 'deposit';
  return 'ignore';
}

export function defaultClassFor(kind: string): ImportClass {
  return kind in KNOWN_KINDS ? KNOWN_KINDS[kind] : suggestClass(kind);
}

const FIAT = new Set(['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'SGD', 'HKD', 'JPY', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'TRY', 'BRL', 'AED', 'NZD']);
export const isFiatSymbol = (s: string) => FIAT.has(s.toUpperCase());

/** Tickers dont l'identifiant CoinGecko n'est pas celui du plus gros jeton portant ce ticker. */
export const SYMBOL_OVERRIDES: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', USDC: 'usd-coin', USDT: 'tether', CRO: 'crypto-com-chain', SOL: 'solana',
  XRP: 'ripple', BNB: 'binancecoin', DOGE: 'dogecoin', ADA: 'cardano', AVAX: 'avalanche-2', LINK: 'chainlink',
  DOT: 'polkadot', MATIC: 'matic-network', POL: 'polygon-ecosystem-token', LTC: 'litecoin', SUI: 'sui', HYPE: 'hyperliquid',
  NEAR: 'near', TAO: 'bittensor', APT: 'aptos', UNI: 'uniswap', LDO: 'lido-dao', ENA: 'ethena', AAVE: 'aave',
  PENDLE: 'pendle', ONDO: 'ondo-finance', RENDER: 'render-token', SKY: 'sky', PROVE: 'succinct',
};

export interface RawRow {
  line: number;
  time: string; // ISO UTC
  /** Faux quand le fichier ne donne que la date (ex. historique reconstitué d'un PDF) : l'heure n'est alors pas conservée. */
  hasTime: boolean;
  date: string; // AAAA-MM-JJ
  description: string;
  currency: string;
  amount: number;
  toCurrency: string;
  toAmount: number;
  nativeCurrency: string;
  nativeAmount: number;
  nativeUsd: number;
  kind: string;
  hash: string;
}

export interface KindSummary {
  kind: string;
  count: number;
  known: boolean;
  defaultClass: ImportClass;
  sample: string;
}

export interface ParsedCryptoCom {
  ok: boolean;
  error?: string;
  headers: string[];
  rows: RawRow[];
  kinds: KindSummary[];
  /** Cryptos rencontrées (hors monnaies classiques). */
  symbols: string[];
  invalidRows: number;
  range?: { from: string; to: string };
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES: Record<string, string[]> = {
  time: ['timestamputc', 'timestamp', 'datetime', 'date'],
  description: ['transactiondescription', 'description'],
  currency: ['currency'],
  amount: ['amount'],
  toCurrency: ['tocurrency'],
  toAmount: ['toamount'],
  nativeCurrency: ['nativecurrency'],
  nativeAmount: ['nativeamount'],
  nativeUsd: ['nativeamountinusd'],
  kind: ['transactionkind', 'kind'],
  hash: ['transactionhash', 'hash'],
};

function parseTime(s: string): { iso: string; date: string; hasTime: boolean } | null {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', se = '00'] = m;
  return { iso: `${y}-${mo}-${d}T${h}:${mi}:${se}Z`, date: `${y}-${mo}-${d}`, hasTime: m[4] !== undefined };
}

export function parseCryptoComCsv(text: string): ParsedCryptoCom {
  const table = parseCsv(text);
  const empty = { headers: table.headers, rows: [] as RawRow[], kinds: [] as KindSummary[], symbols: [] as string[], invalidRows: 0 };
  if (!table.headers.length) return { ok: false, error: 'Fichier vide.', ...empty };
  const byNorm = new Map(table.headers.map((h) => [norm(h), h]));
  const col: Record<string, string | undefined> = {};
  for (const [key, names] of Object.entries(ALIASES)) col[key] = names.map((n) => byNorm.get(n)).find(Boolean);
  const missing = ['time', 'currency', 'amount', 'kind'].filter((k) => !col[k]);
  if (missing.length) {
    return { ok: false, error: `Colonnes introuvables (${missing.join(', ')}). Colonnes lues : ${table.headers.join(' | ')}`, ...empty };
  }
  const get = (r: Record<string, string>, k: string) => (col[k] ? r[col[k] as string] ?? '' : '');

  const rows: RawRow[] = [];
  let invalid = 0;
  table.rows.forEach((r, i) => {
    const t = parseTime(get(r, 'time'));
    const amount = parseNumber(get(r, 'amount'));
    const currency = get(r, 'currency').toUpperCase();
    if (!t || !Number.isFinite(amount) || !currency) { invalid++; return; }
    const toAmount = parseNumber(get(r, 'toAmount'));
    rows.push({
      line: i + 2,
      time: t.iso,
      hasTime: t.hasTime,
      date: t.date,
      description: get(r, 'description'),
      currency,
      amount,
      toCurrency: get(r, 'toCurrency').toUpperCase(),
      toAmount: Number.isFinite(toAmount) ? toAmount : 0,
      nativeCurrency: get(r, 'nativeCurrency').toUpperCase(),
      nativeAmount: parseNumber(get(r, 'nativeAmount')),
      nativeUsd: parseNumber(get(r, 'nativeUsd')),
      kind: get(r, 'kind').toLowerCase(),
      hash: get(r, 'hash'),
    });
  });

  const kinds = new Map<string, KindSummary>();
  const symbols = new Set<string>();
  for (const r of rows) {
    const k = kinds.get(r.kind) ?? { kind: r.kind, count: 0, known: r.kind in KNOWN_KINDS, defaultClass: defaultClassFor(r.kind), sample: r.description };
    k.count++;
    kinds.set(r.kind, k);
    for (const s of [r.currency, r.toCurrency]) if (s && !isFiatSymbol(s)) symbols.add(s);
  }
  const sorted = [...rows].sort((a, b) => a.time.localeCompare(b.time));
  return {
    ok: rows.length > 0,
    error: rows.length ? undefined : 'Aucune ligne exploitable dans ce fichier.',
    headers: table.headers,
    rows: sorted,
    kinds: [...kinds.values()].sort((a, b) => Number(a.known) - Number(b.known) || b.count - a.count),
    symbols: [...symbols].sort(),
    invalidRows: invalid,
    range: sorted.length ? { from: sorted[0].date, to: sorted[sorted.length - 1].date } : undefined,
  };
}

/** Associe les tickers aux cryptos CoinGecko : table d'exceptions, sinon la crypto la mieux classée portant ce ticker. */
export function resolveSymbols(
  symbols: string[],
  markets: { id: string; symbol: string; name: string; image?: string; market_cap_rank: number | null }[],
): { resolved: Record<string, CoinRef>; unresolved: string[] } {
  const byId = new Map(markets.map((m) => [m.id, m]));
  const resolved: Record<string, CoinRef> = {};
  const unresolved: string[] = [];
  for (const s of symbols) {
    const up = s.toUpperCase();
    const forced = SYMBOL_OVERRIDES[up] ? byId.get(SYMBOL_OVERRIDES[up]) : undefined;
    const candidates = markets.filter((m) => m.symbol.toUpperCase() === up).sort((a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9));
    const pick = forced ?? candidates[0];
    if (pick) resolved[up] = { coinId: pick.id, symbol: pick.symbol, name: pick.name, image: pick.image };
    else if (SYMBOL_OVERRIDES[up]) resolved[up] = { coinId: SYMBOL_OVERRIDES[up], symbol: up.toLowerCase(), name: up };
    else unresolved.push(up);
  }
  return { resolved, unresolved };
}

export interface BuildOptions {
  accountId?: string;
  classByKind: Record<string, ImportClass>;
  symbols: Record<string, CoinRef | null | undefined>;
  /** Entrées de crypto : « external » (achat/dépôt) ou identifiant du compte d'origine (simple transfert). */
  depositFrom: string;
  /** Sorties de crypto : « external » ou identifiant du compte de destination (transfert). */
  withdrawTo: string;
  fxEurPerUsd: number;
}

export interface BuildResult {
  txs: Transaction[];
  skipped: { reason: string; count: number }[];
}

/** Identifiant stable : réimporter le même fichier ne crée aucun doublon. */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

interface Side { sym: string; qty: number }

function sidesOf(r: RawRow): { out?: Side; in?: Side } {
  if (r.toCurrency && r.toAmount) return { out: { sym: r.currency, qty: Math.abs(r.amount) }, in: { sym: r.toCurrency, qty: Math.abs(r.toAmount) } };
  if (r.amount > 0) return { in: { sym: r.currency, qty: r.amount } };
  if (r.amount < 0) return { out: { sym: r.currency, qty: -r.amount } };
  return {};
}

interface Value { price: number; currency: 'EUR' | 'USD'; fx: number }

/** Valeur d'une opération dans la devise du compte, avec le taux de change du jour quand l'export le permet. */
function valueOf(r: RawRow, qty: number, fiatSide: Side | undefined, fx: number): Value | null {
  if (qty <= 0) return null;
  let total = NaN;
  let currency: 'EUR' | 'USD' = 'EUR';
  if (fiatSide && (fiatSide.sym === 'EUR' || fiatSide.sym === 'USD')) {
    total = fiatSide.qty;
    currency = fiatSide.sym;
  } else if (r.nativeCurrency === 'EUR' || r.nativeCurrency === 'USD') {
    total = Math.abs(r.nativeAmount);
    currency = r.nativeCurrency;
  } else if (Number.isFinite(r.nativeUsd)) {
    total = Math.abs(r.nativeUsd);
    currency = 'USD';
  }
  if (!Number.isFinite(total)) return null;
  let rate = fx;
  if (r.nativeCurrency === 'EUR' && r.nativeUsd && r.nativeAmount) rate = Math.abs(r.nativeAmount / r.nativeUsd);
  return { price: total / qty, currency, fx: rate > 0.3 && rate < 3 ? rate : fx };
}

export function buildCryptoComTransactions(parsed: ParsedCryptoCom, opts: BuildOptions): BuildResult {
  const txs: Transaction[] = [];
  const skipped = new Map<string, number>();
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  const seen = new Map<string, number>();
  const zero: Value = { price: 0, currency: 'EUR', fx: opts.fxEurPerUsd };

  for (const r of parsed.rows) {
    const cls = opts.classByKind[r.kind] ?? defaultClassFor(r.kind);
    if (cls === 'ignore') { skip('Opérations ignorées (internes, monnaie classique…)'); continue; }
    const base = cyrb53([r.time, r.kind, r.currency, r.amount, r.toCurrency, r.toAmount, r.hash].join('|'));
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const idBase = `cdc-${base}${n > 1 ? `-${n}` : ''}`;
    const { out, in: inn } = sidesOf(r);
    const note = `Crypto.com · ${r.kind}${r.description ? ` · ${r.description}` : ''}`;

    const make = (id: string, side: Side, type: Transaction['type'], v: Value, extra: Partial<Transaction> = {}) => {
      const coin = isFiatSymbol(side.sym) ? null : opts.symbols[side.sym.toUpperCase()];
      if (!coin) { skip(`Crypto non reconnue : ${side.sym}`); return; }
      txs.push({
        id, ...coin, date: r.date, time: r.hasTime ? r.time : undefined, type, quantity: side.qty, price: v.price, currency: v.currency, fee: 0,
        fxEurPerUsd: v.fx, source: 'import', accountId: opts.accountId, note, ...extra,
      });
    };

    if (cls === 'buy') {
      if (!inn || isFiatSymbol(inn.sym)) { skip('Achat sans crypto reçue'); continue; }
      const v = valueOf(r, inn.qty, out && isFiatSymbol(out.sym) ? out : undefined, opts.fxEurPerUsd);
      if (!v) { skip('Prix introuvable'); continue; }
      make(idBase, inn, 'buy', v, { fromFiat: out ? isFiatSymbol(out.sym) : true });
    } else if (cls === 'sell') {
      if (!out || isFiatSymbol(out.sym)) { skip('Vente sans crypto envoyée'); continue; }
      const v = valueOf(r, out.qty, inn && isFiatSymbol(inn.sym) ? inn : undefined, opts.fxEurPerUsd);
      if (!v) { skip('Prix introuvable'); continue; }
      make(idBase, out, 'sell', v, { toFiat: inn ? isFiatSymbol(inn.sym) : true });
    } else if (cls === 'swap') {
      // Un échange crypto → crypto est neutre : une vente et un achat valorisés au même montant.
      if (!out && !inn) { skip('Échange vide'); continue; }
      if (out && !isFiatSymbol(out.sym)) {
        const v = valueOf(r, out.qty, undefined, opts.fxEurPerUsd);
        if (v) make(`${idBase}-o`, out, 'sell', v, { toFiat: false }); else skip('Prix introuvable');
      }
      if (inn && !isFiatSymbol(inn.sym)) {
        const v = valueOf(r, inn.qty, undefined, opts.fxEurPerUsd);
        if (v) make(`${idBase}-i`, inn, 'buy', v, { fromFiat: false }); else skip('Prix introuvable');
      }
    } else if (cls === 'reward') {
      if (!inn || isFiatSymbol(inn.sym)) { skip('Récompense sans crypto reçue'); continue; }
      make(idBase, inn, 'reward', valueOf(r, inn.qty, undefined, opts.fxEurPerUsd) ?? zero);
    } else if (cls === 'deposit') {
      if (!inn || isFiatSymbol(inn.sym)) { skip('Entrée sans crypto'); continue; }
      const v = valueOf(r, inn.qty, undefined, opts.fxEurPerUsd) ?? zero;
      if (opts.depositFrom && opts.depositFrom !== 'external') make(idBase, inn, 'transfer', v, { accountId: opts.depositFrom, toAccountId: opts.accountId });
      else make(idBase, inn, 'deposit', v, { fromFiat: false });
    } else if (cls === 'withdraw') {
      if (!out || isFiatSymbol(out.sym)) { skip('Sortie sans crypto'); continue; }
      const v = valueOf(r, out.qty, undefined, opts.fxEurPerUsd) ?? zero;
      if (opts.withdrawTo && opts.withdrawTo !== 'external') make(idBase, out, 'transfer', v, { accountId: opts.accountId, toAccountId: opts.withdrawTo });
      else make(idBase, out, 'withdraw', v);
    }
  }
  return { txs, skipped: [...skipped.entries()].map(([reason, count]) => ({ reason, count })) };
}
