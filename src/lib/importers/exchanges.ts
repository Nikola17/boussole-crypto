// Import CSV multi-plateformes : Binance, Kraken et Coinbase (détection automatique par en-têtes).
// Produit des Transaction Boussole standard avec identifiants déterministes (anti-doublon à la réimportation).

import type { CoinRef, Transaction } from '../../types';
import { parseCsv, parseNumber } from '../csv';
import { isFiatSymbol, SYMBOL_OVERRIDES } from './cryptocom';

export type ExchangeKind = 'binance' | 'kraken' | 'coinbase';

export interface ParsedExchangeCsv {
  ok: boolean;
  exchange?: ExchangeKind;
  error?: string;
  rows: {
    line: number;
    date: string;
    time?: string;
    type: 'buy' | 'sell' | 'deposit' | 'withdraw' | 'reward';
    symbol: string;
    quantity: number;
    unitPrice: number;
    currency: 'EUR' | 'USD';
    fee: number;
    fromFiat: boolean;
    toFiat: boolean;
    note: string;
  }[];
  symbols: string[];
  skipped: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Détecte la plateforme d'un fichier CSV à partir de sa ligne d'en-tête. */
export function detectExchangeCsv(text: string): ExchangeKind | null {
  const firstLines = text.split(/\r?\n/).slice(0, 8);
  for (const line of firstLines) {
    const cols = line.split(/[,;]/).map(norm);
    const has = (k: string) => cols.includes(k);
    // Binance Spot Trade History : Date(UTC), Pair/Market, Side/Type, Price, Executed/Amount, Total, Fee
    if ((has('dateutc') || has('utctime')) && (has('pair') || has('market') || has('operation'))) return 'binance';
    // Kraken Ledgers / Trades : txid, refid, time, type, asset, amount, fee
    if (has('txid') && has('time') && (has('asset') || has('pair'))) return 'kraken';
    // Coinbase Transaction History : Timestamp, Transaction Type, Asset, Quantity Transacted
    if (has('timestamp') && has('transactiontype') && has('asset') && has('quantitytransacted')) return 'coinbase';
  }
  return null;
}

function splitPair(pair: string): [string, string] | null {
  const p = pair.toUpperCase().replace(/[^A-Z0-9/_-]/g, '');
  if (p.includes('/') || p.includes('-') || p.includes('_')) {
    const parts = p.split(/[/_-]/).filter(Boolean);
    if (parts.length === 2) return [parts[0], parts[1]];
  }
  const quotes = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'EUR', 'USD', 'BTC', 'ETH', 'BNB'];
  for (const q of quotes) {
    if (p.endsWith(q) && p.length > q.length) return [p.slice(0, -q.length), q];
  }
  return null;
}

const KRAKEN_ASSET_MAP: Record<string, string> = {
  XXBT: 'BTC', XBT: 'BTC', XETH: 'ETH', ZEUR: 'EUR', ZUSD: 'USD', XXRP: 'XRP', XLTC: 'LTC', XXLM: 'XLM', XDG: 'DOGE',
};
const cleanKrakenAsset = (a: string) => {
  const up = a.toUpperCase().replace(/\.(S|M|F)$/, '');
  return KRAKEN_ASSET_MAP[up] ?? up;
};

function parseIsoDay(raw: string): { date: string; time?: string } | null {
  const s = raw.trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}:\d{2}))?/);
  if (m) return { date: m[1], time: m[2] ? `${m[1]}T${m[2]}Z` : undefined };
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  const iso = new Date(ms).toISOString();
  return { date: iso.slice(0, 10), time: iso };
}

/** Parse un export CSV Binance, Kraken ou Coinbase. */
export function parseExchangeCsv(text: string): ParsedExchangeCsv {
  const exchange = detectExchangeCsv(text);
  if (!exchange) return { ok: false, error: 'Format CSV non reconnu (attendu : Crypto.com, Binance, Kraken ou Coinbase).', rows: [], symbols: [], skipped: 0 };

  // Coinbase peut avoir 3 lignes de préambule avant "Timestamp,Transaction Type,..."
  let cleaned = text;
  if (exchange === 'coinbase') {
    const lines = text.split(/\r?\n/);
    const idx = lines.findIndex((l) => norm(l).includes('timestamp') && norm(l).includes('transactiontype'));
    if (idx > 0) cleaned = lines.slice(idx).join('\n');
  }

  const parsed = parseCsv(cleaned);
  if (!parsed.headers.length || !parsed.rows.length) return { ok: false, error: 'Fichier CSV vide.', rows: [], symbols: [], skipped: 0 };
  const headerByNorm = new Map(parsed.headers.map((h) => [norm(h), h]));
  const pick = (row: Record<string, string>, aliases: string[]) => {
    for (const a of aliases) {
      const key = headerByNorm.get(a);
      if (key != null && row[key] != null) return row[key];
    }
    return '';
  };
  const rows: ParsedExchangeCsv['rows'] = [];
  const syms = new Set<string>();
  let skipped = 0;

  if (exchange === 'binance') {
    for (let r = 0; r < parsed.rows.length; r++) {
      const row = parsed.rows[r];
      const dt = parseIsoDay(pick(row, ['dateutc', 'utctime', 'time']));
      const pair = splitPair(pick(row, ['pair', 'market']));
      const sideRaw = pick(row, ['side', 'type']).toLowerCase();
      const qty = Math.abs(parseNumber(pick(row, ['executed', 'amount', 'quantity'])));
      const price = Math.abs(parseNumber(pick(row, ['price', 'orderprice'])));
      const fee = Math.abs(parseNumber(pick(row, ['fee']))) || 0;
      if (!dt || !pair || !(qty > 0) || !(price > 0) || (!/buy/.test(sideRaw) && !/sell/.test(sideRaw))) { skipped++; continue; }
      const [base, quote] = pair;
      if (isFiatSymbol(base)) { skipped++; continue; }
      const isBuy = /buy/.test(sideRaw);
      const fiatQuote = quote === 'EUR' || quote === 'USD';
      syms.add(base);
      rows.push({
        line: r + 2, date: dt.date, time: dt.time, type: isBuy ? 'buy' : 'sell', symbol: base,
        quantity: qty, unitPrice: price, currency: quote === 'EUR' ? 'EUR' : 'USD', fee,
        fromFiat: isBuy && fiatQuote, toFiat: !isBuy && fiatQuote,
        note: `Import Binance (${base}/${quote})`,
      });
    }
  } else if (exchange === 'kraken') {
    for (let r = 0; r < parsed.rows.length; r++) {
      const row = parsed.rows[r];
      const dt = parseIsoDay(pick(row, ['time']));
      const asset = cleanKrakenAsset(pick(row, ['asset']));
      const amt = parseNumber(pick(row, ['amount']));
      const fee = Math.abs(parseNumber(pick(row, ['fee']))) || 0;
      const kind = pick(row, ['type']).toLowerCase();
      if (!dt || !asset || isFiatSymbol(asset) || !Number.isFinite(amt) || amt === 0) { skipped++; continue; }
      let type: ParsedExchangeCsv['rows'][number]['type'] | null = null;
      if (kind === 'deposit') type = 'deposit';
      else if (kind === 'withdrawal') type = 'withdraw';
      else if (kind === 'staking' || kind === 'earn') type = 'reward';
      else if (kind === 'trade' || kind === 'buy' || kind === 'sell') type = amt > 0 ? 'buy' : 'sell';
      if (!type) { skipped++; continue; }
      syms.add(asset);
      rows.push({
        line: r + 2, date: dt.date, time: dt.time, type, symbol: asset,
        quantity: Math.abs(amt), unitPrice: 0, currency: 'EUR', fee,
        fromFiat: false, toFiat: false, note: `Import Kraken (${kind})`,
      });
    }
  } else {
    // Coinbase
    for (let r = 0; r < parsed.rows.length; r++) {
      const row = parsed.rows[r];
      const dt = parseIsoDay(pick(row, ['timestamp']));
      const asset = pick(row, ['asset']).trim().toUpperCase();
      const qty = Math.abs(parseNumber(pick(row, ['quantitytransacted'])));
      const price = Math.abs(parseNumber(pick(row, ['spotpriceattransaction', 'priceattransaction']))) || 0;
      const fee = Math.abs(parseNumber(pick(row, ['feesandorspread', 'fees']))) || 0;
      const cur = (pick(row, ['spotpricecurrency', 'pricecurrency']) || 'EUR').toUpperCase() === 'USD' ? 'USD' : 'EUR';
      const rawType = pick(row, ['transactiontype']);
      const kind = rawType.toLowerCase();
      if (!dt || !asset || isFiatSymbol(asset) || !(qty > 0)) { skipped++; continue; }
      let type: ParsedExchangeCsv['rows'][number]['type'] | null = null;
      if (/buy|advance trade buy/.test(kind)) type = 'buy';
      else if (/sell|advance trade sell/.test(kind)) type = 'sell';
      else if (/reward|staking|learning|interest/.test(kind)) type = 'reward';
      else if (/receive|deposit/.test(kind)) type = 'deposit';
      else if (/send|withdraw/.test(kind)) type = 'withdraw';
      if (!type) { skipped++; continue; }
      syms.add(asset);
      rows.push({
        line: r + 2, date: dt.date, time: dt.time, type, symbol: asset,
        quantity: qty, unitPrice: price, currency: cur, fee,
        fromFiat: type === 'buy', toFiat: type === 'sell',
        note: `Import Coinbase (${rawType})`,
      });
    }
  }

  return { ok: true, exchange, rows, symbols: [...syms].sort(), skipped };
}

/** Construit les Transaction Boussole prêtes à être importées (sans doublons). */
export function buildExchangeTransactions(
  parsed: ParsedExchangeCsv,
  opts: { accountId: string; symbols: Record<string, CoinRef | null>; fxEurPerUsd: number },
): Transaction[] {
  if (!parsed.ok || !parsed.exchange) return [];
  const out: Transaction[] = [];
  for (const r of parsed.rows) {
    const ref = opts.symbols[r.symbol] ?? {
      coinId: SYMBOL_OVERRIDES[r.symbol] ?? r.symbol.toLowerCase(),
      symbol: r.symbol.toLowerCase(),
      name: r.symbol,
    };
    out.push({
      id: `${parsed.exchange}-${r.date}-${r.type}-${r.symbol}-${r.quantity}-${r.line}`,
      coinId: ref.coinId,
      symbol: ref.symbol,
      name: ref.name,
      image: ref.image,
      date: r.date,
      time: r.time,
      type: r.type,
      quantity: r.quantity,
      price: r.unitPrice,
      currency: r.currency,
      fee: r.fee,
      fxEurPerUsd: opts.fxEurPerUsd,
      fromFiat: r.fromFiat,
      toFiat: r.toFiat,
      source: 'manual',
      accountId: opts.accountId,
      note: r.note,
    });
  }
  return out;
}
