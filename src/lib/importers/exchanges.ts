// Import CSV multi-plateformes : détection automatique pour 18 plateformes majeures
// (Binance, Kraken, Coinbase, Bybit, OKX, Bitget, KuCoin, MEXC, Gate, Bitpanda, Bitvavo,
// HTX, Bitfinex, Bitstamp, Gemini, BingX, Pionex, WhiteBIT) + lecteur CSV universel pour
// toutes les autres plateformes centralisées et DEX du catalogue (50 CEX + 50 DEX).
// Produit des Transaction Boussole standard avec identifiants déterministes (anti-doublon à la réimportation).

import type { CoinRef, Transaction } from '../../types';
import { parseCsv, parseNumber } from '../csv';
import { isFiatSymbol, SYMBOL_OVERRIDES } from './cryptocom';

export type ExchangeKind =
  | 'binance'
  | 'kraken'
  | 'coinbase'
  | 'bybit'
  | 'okx'
  | 'bitget'
  | 'kucoin'
  | 'mexc'
  | 'gate'
  | 'bitpanda'
  | 'bitvavo'
  | 'htx'
  | 'bitfinex'
  | 'bitstamp'
  | 'gemini'
  | 'bingx'
  | 'pionex'
  | 'whitebit'
  | 'generic';

export const EXCHANGE_LABELS: Record<ExchangeKind, string> = {
  binance: 'Binance',
  kraken: 'Kraken',
  coinbase: 'Coinbase',
  bybit: 'Bybit',
  okx: 'OKX',
  bitget: 'Bitget',
  kucoin: 'KuCoin',
  mexc: 'MEXC',
  gate: 'Gate',
  bitpanda: 'Bitpanda',
  bitvavo: 'Bitvavo',
  htx: 'HTX (ex-Huobi)',
  bitfinex: 'Bitfinex',
  bitstamp: 'Bitstamp',
  gemini: 'Gemini',
  bingx: 'BingX',
  pionex: 'Pionex',
  whitebit: 'WhiteBIT',
  generic: 'CSV universel',
};

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

const DATE_ALIASES = [
  'dateutc', 'utctime', 'timestamp', 'datetime', 'timeutc', 'tradecreatedat', 'createdat', 'date', 'time', 'filledtime', 'exectime', 'orderdate',
];
const PAIR_ALIASES = [
  'pair', 'market', 'spotpairs', 'tradingpair', 'instrument', 'instid', 'pairs', 'symbol', 'marketpair', 'tradingpairs',
];
const ASSET_ALIASES = ['asset', 'coin', 'currency', 'token', 'baseasset', 'crypto'];
const SIDE_ALIASES = [
  'side', 'direction', 'transactiontype', 'tradetype', 'type', 'operation', 'action', 'buysell', 'subtype',
];
const QTY_ALIASES = [
  'executed', 'quantitytransacted', 'amountasset', 'filledquantity', 'filledamount', 'execqty', 'filled',
  'size', 'quantity', 'amount', 'qty', 'volume', 'dealqty',
];
const PRICE_ALIASES = [
  'price', 'orderprice', 'filledprice', 'execprice', 'averageprice', 'avgprice', 'spotpriceattransaction',
  'priceattransaction', 'assetmarketprice', 'quoteprice', 'rate', 'unitprice', 'dealprice',
];
const FEE_ALIASES = ['fee', 'fees', 'feesandorspread', 'feeamount', 'commission', 'tradingfee', 'feeusd'];

/** Détecte la plateforme d'un fichier CSV à partir de ses lignes d'en-tête (hors Crypto.com géré séparément). */
export function detectExchangeCsv(text: string): ExchangeKind | null {
  const firstLines = text.split(/\r?\n/).slice(0, 10);
  // Ne jamais capturer un export Crypto.com natif (laissé au parseur dédié avec classification des natures).
  for (const line of firstLines) {
    const cols = line.split(/[,;]/).map(norm);
    if (cols.includes('timestamputc') && cols.includes('transactionkind')) return null;
  }

  for (const line of firstLines) {
    const cols = line.split(/[,;]/).map(norm);
    const has = (k: string) => cols.includes(k);
    const hasAny = (list: string[]) => list.some(has);

    // 1. Formats dédiés haute précision
    if (has('timestamp') && has('transactiontype') && has('asset') && has('quantitytransacted')) return 'coinbase';
    if (has('txid') && has('time') && (has('asset') || has('pair'))) return 'kraken';
    if (has('transactionid') && has('transactiontype') && has('amountasset') && has('asset')) return 'bitpanda';
    if (has('timezone') && has('date') && has('type') && has('currency') && has('receivedpaidcurrency')) return 'bitvavo';
    if (has('tradecreatedat') && has('symbol') && has('side') && has('size')) return 'kucoin';
    if ((has('spotpairs') || (has('symbol') && has('filledprice'))) && (has('direction') || has('side')) && (has('filledquantity') || has('execqty'))) return 'bybit';
    if ((has('instid') || has('instrument')) && (has('tradetype') || has('subtype') || has('side')) && hasAny(['filledprice', 'price', 'amount'])) return 'okx';
    if (has('tradingpair') && (has('direction') || has('side')) && hasAny(['averageprice', 'filled', 'price'])) return 'bitget';
    if (has('pairs') && has('side') && hasAny(['filledprice', 'averageprice', 'executed'])) return 'mexc';
    if (has('no') && has('pair') && has('price') && has('amount') && has('total')) return 'gate';
    if (has('feecurrency') && has('pair') && has('amount') && has('price') && has('date')) return 'bitfinex';
    if (has('datetime') && has('account') && has('amount') && has('value') && has('rate')) return 'bitstamp';
    if (has('specification') && has('liquidityindicator') && has('symbol') && has('date')) return 'gemini';
    if ((has('dateutc') || has('utctime')) && (has('pair') || has('market') || has('operation'))) return 'binance';
    if (has('dealtime') && has('pair') && has('side')) return 'bingx';
    if (has('botid') && has('pair') && has('side')) return 'pionex';
    if (has('market') && has('dealprice') && has('dealqty')) return 'whitebit';
    if (has('time') && has('pair') && has('type') && has('price') && has('amount') && has('total')) return 'htx';
  }

  // 2. Fallback universel : si l'en-tête possède au moins une colonne date + une colonne paire/actif + une colonne quantité
  for (const line of firstLines) {
    const cols = line.split(/[,;]/).map(norm);
    const hasAny = (list: string[]) => list.some((k) => cols.includes(k));
    if (hasAny(DATE_ALIASES) && (hasAny(PAIR_ALIASES) || hasAny(ASSET_ALIASES)) && hasAny(QTY_ALIASES)) {
      return 'generic';
    }
  }
  return null;
}

function splitPair(pair: string): [string, string] | null {
  const p = pair.toUpperCase().replace(/[^A-Z0-9/_:-]/g, '');
  if (p.includes('/') || p.includes('-') || p.includes('_') || p.includes(':')) {
    const parts = p.split(/[/_:-]/).filter(Boolean);
    if (parts.length === 2) return [parts[0], parts[1]];
  }
  const quotes = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'EUR', 'USD', 'GBP', 'JPY', 'KRW', 'TRY', 'BRL', 'AUD', 'INR', 'IDR', 'THB', 'PHP', 'BTC', 'ETH', 'BNB'];
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
  const s = raw.trim().replace(/^"(.*)"$/, '$1');
  if (!s) return null;
  // Epoch ms ou secondes
  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    const ms = s.length === 10 ? n * 1000 : n;
    const iso = new Date(ms).toISOString();
    return { date: iso.slice(0, 10), time: iso };
  }
  const m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T ](\d{2}:\d{2}:\d{2}))?/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}Z` : undefined };
  // Format européen DD/MM/YYYY ou DD.MM.YYYY
  const eu = s.match(/^(\d{2})[/.](\d{2})[/.](\d{4})(?:[T ](\d{2}:\d{2}:\d{2}))?/);
  if (eu) return { date: `${eu[3]}-${eu[2]}-${eu[1]}`, time: eu[4] ? `${eu[3]}-${eu[2]}-${eu[1]}T${eu[4]}Z` : undefined };
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  const iso = new Date(ms).toISOString();
  return { date: iso.slice(0, 10), time: iso };
}

function classifySide(raw: string, signedQty?: number): ParsedExchangeCsv['rows'][number]['type'] | null {
  const k = raw.trim().toLowerCase();
  if (/buy|achat|bid|long/.test(k)) return 'buy';
  if (/sell|vente|ask|short/.test(k)) return 'sell';
  if (/reward|staking|earn|interest|airdrop|bonus|rebate|distribution|dividend/.test(k)) return 'reward';
  if (/deposit|receive|transfer.?in|in\b/.test(k)) return 'deposit';
  if (/withdraw|send|transfer.?out|out\b/.test(k)) return 'withdraw';
  if (k === 'trade' || k === 'spot' || k === 'market' || k === 'limit' || k === '') {
    if (signedQty != null && signedQty !== 0) return signedQty > 0 ? 'buy' : 'sell';
  }
  return null;
}

/** Parse un export CSV d'une plateforme centralisée ou d'un DEX (formats dédiés + fallback universel). */
export function parseExchangeCsv(text: string): ParsedExchangeCsv {
  const exchange = detectExchangeCsv(text);
  if (!exchange) {
    return {
      ok: false,
      error: 'Format CSV non reconnu. Vérifie que le fichier contient au moins des colonnes Date, Paire/Crypto et Quantité.',
      rows: [],
      symbols: [],
      skipped: 0,
    };
  }

  // Certains exports (Coinbase, Bitpanda, KuCoin…) ont des lignes de préambule avant les en-têtes.
  let cleaned = text;
  const lines = text.split(/\r?\n/);
  if (exchange === 'coinbase') {
    const idx = lines.findIndex((l) => norm(l).includes('timestamp') && norm(l).includes('transactiontype'));
    if (idx > 0) cleaned = lines.slice(idx).join('\n');
  } else if (exchange === 'bitpanda') {
    const idx = lines.findIndex((l) => norm(l).includes('transactionid') && norm(l).includes('amountasset'));
    if (idx > 0) cleaned = lines.slice(idx).join('\n');
  } else {
    // Saute un éventuel préambule avant la vraie ligne d'en-tête
    const idx = lines.slice(0, 8).findIndex((l) => {
      const cols = l.split(/[,;]/).map(norm);
      return DATE_ALIASES.some((a) => cols.includes(a)) && (PAIR_ALIASES.some((a) => cols.includes(a)) || ASSET_ALIASES.some((a) => cols.includes(a)));
    });
    if (idx > 0) cleaned = lines.slice(idx).join('\n');
  }

  const parsed = parseCsv(cleaned);
  if (!parsed.headers.length || !parsed.rows.length) {
    return { ok: false, error: 'Fichier CSV vide.', rows: [], symbols: [], skipped: 0 };
  }
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
  const label = EXCHANGE_LABELS[exchange];

  if (exchange === 'kraken') {
    for (let r = 0; r < parsed.rows.length; r++) {
      const row = parsed.rows[r];
      const dt = parseIsoDay(pick(row, ['time']));
      const asset = cleanKrakenAsset(pick(row, ['asset']));
      const amt = parseNumber(pick(row, ['amount']));
      const fee = Math.abs(parseNumber(pick(row, ['fee']))) || 0;
      const kind = pick(row, ['type']).toLowerCase();
      if (!dt || !asset || isFiatSymbol(asset) || !Number.isFinite(amt) || amt === 0) { skipped++; continue; }
      const type = classifySide(kind, amt);
      if (!type) { skipped++; continue; }
      syms.add(asset);
      rows.push({
        line: r + 2, date: dt.date, time: dt.time, type, symbol: asset,
        quantity: Math.abs(amt), unitPrice: 0, currency: 'EUR', fee,
        fromFiat: false, toFiat: false, note: `Import Kraken (${kind})`,
      });
    }
  } else if (exchange === 'coinbase') {
    for (let r = 0; r < parsed.rows.length; r++) {
      const row = parsed.rows[r];
      const dt = parseIsoDay(pick(row, ['timestamp']));
      const asset = pick(row, ['asset']).trim().toUpperCase();
      const qty = Math.abs(parseNumber(pick(row, ['quantitytransacted'])));
      const price = Math.abs(parseNumber(pick(row, ['spotpriceattransaction', 'priceattransaction']))) || 0;
      const fee = Math.abs(parseNumber(pick(row, ['feesandorspread', 'fees']))) || 0;
      const cur = (pick(row, ['spotpricecurrency', 'pricecurrency']) || 'EUR').toUpperCase() === 'USD' ? 'USD' : 'EUR';
      const rawType = pick(row, ['transactiontype']);
      const type = classifySide(rawType);
      if (!dt || !asset || isFiatSymbol(asset) || !(qty > 0) || !type) { skipped++; continue; }
      syms.add(asset);
      rows.push({
        line: r + 2, date: dt.date, time: dt.time, type, symbol: asset,
        quantity: qty, unitPrice: price, currency: cur, fee,
        fromFiat: type === 'buy', toFiat: type === 'sell',
        note: `Import Coinbase (${rawType})`,
      });
    }
  } else if (exchange === 'bitpanda') {
    for (let r = 0; r < parsed.rows.length; r++) {
      const row = parsed.rows[r];
      const dt = parseIsoDay(pick(row, ['timestamp', 'date']));
      const asset = pick(row, ['asset']).trim().toUpperCase();
      const qty = Math.abs(parseNumber(pick(row, ['amountasset'])));
      const price = Math.abs(parseNumber(pick(row, ['assetmarketprice']))) || 0;
      const fee = Math.abs(parseNumber(pick(row, ['fee']))) || 0;
      const fiat = (pick(row, ['fiat']) || 'EUR').trim().toUpperCase();
      const rawType = pick(row, ['transactiontype']);
      const type = classifySide(rawType);
      if (!dt || !asset || isFiatSymbol(asset) || !(qty > 0) || !type) { skipped++; continue; }
      const cur: 'EUR' | 'USD' = fiat === 'USD' ? 'USD' : 'EUR';
      syms.add(asset);
      rows.push({
        line: r + 2, date: dt.date, time: dt.time, type, symbol: asset,
        quantity: qty, unitPrice: price, currency: cur, fee,
        fromFiat: type === 'buy' && (fiat === 'EUR' || fiat === 'USD'),
        toFiat: type === 'sell' && (fiat === 'EUR' || fiat === 'USD'),
        note: `Import Bitpanda (${rawType})`,
      });
    }
  } else if (exchange === 'bitvavo') {
    for (let r = 0; r < parsed.rows.length; r++) {
      const row = parsed.rows[r];
      const d = pick(row, ['date']);
      const t = pick(row, ['time']);
      const dt = parseIsoDay(t ? `${d} ${t}` : d);
      const asset = pick(row, ['currency']).trim().toUpperCase();
      const signedAmt = parseNumber(pick(row, ['amount']));
      const qty = Math.abs(signedAmt);
      const price = Math.abs(parseNumber(pick(row, ['quoteprice', 'price']))) || 0;
      const fee = Math.abs(parseNumber(pick(row, ['feeamount', 'fee']))) || 0;
      const quote = (pick(row, ['quotecurrency', 'receivedpaidcurrency']) || 'EUR').trim().toUpperCase();
      const rawType = pick(row, ['type']);
      const type = classifySide(rawType, signedAmt);
      if (!dt || !asset || isFiatSymbol(asset) || !(qty > 0) || !type) { skipped++; continue; }
      const cur: 'EUR' | 'USD' = quote === 'USD' || quote === 'USDT' || quote === 'USDC' ? 'USD' : 'EUR';
      syms.add(asset);
      rows.push({
        line: r + 2, date: dt.date, time: dt.time, type, symbol: asset,
        quantity: qty, unitPrice: price, currency: cur, fee,
        fromFiat: type === 'buy' && (quote === 'EUR' || quote === 'USD'),
        toFiat: type === 'sell' && (quote === 'EUR' || quote === 'USD'),
        note: `Import Bitvavo (${rawType})`,
      });
    }
  } else {
    // Binance, Bybit, OKX, Bitget, KuCoin, MEXC, Gate, HTX, Bitfinex, Bitstamp, Gemini, BingX, Pionex, WhiteBIT & CSV universel
    for (let r = 0; r < parsed.rows.length; r++) {
      const row = parsed.rows[r];
      const dRaw = pick(row, DATE_ALIASES);
      const tExtra = pick(row, ['timeutc', 'time']);
      const dt = parseIsoDay(dRaw && tExtra && !dRaw.includes(':') && tExtra.includes(':') ? `${dRaw} ${tExtra}` : dRaw);
      const pairRaw = pick(row, PAIR_ALIASES);
      const assetRaw = pick(row, ASSET_ALIASES).trim().toUpperCase();
      const pair = pairRaw ? splitPair(pairRaw) : null;
      const base = (pair ? pair[0] : assetRaw || pairRaw.trim().toUpperCase()).replace(/[^A-Z0-9]/g, '');
      const quote = pair ? pair[1] : (pick(row, ['quotecurrency', 'fiat', 'pricecurrency', 'currency']) || 'USD').trim().toUpperCase();
      const signedQty = parseNumber(pick(row, QTY_ALIASES));
      const qty = Math.abs(signedQty);
      const price = Math.abs(parseNumber(pick(row, PRICE_ALIASES))) || 0;
      const fee = Math.abs(parseNumber(pick(row, FEE_ALIASES))) || 0;
      const sideRaw = pick(row, SIDE_ALIASES);
      const type = classifySide(sideRaw, signedQty);
      if (!dt || !base || isFiatSymbol(base) || !(qty > 0) || !type) { skipped++; continue; }
      if ((type === 'buy' || type === 'sell') && exchange === 'binance' && !(price > 0)) { skipped++; continue; }
      const fiatQuote = quote === 'EUR' || quote === 'USD';
      const currency: 'EUR' | 'USD' = quote === 'EUR' ? 'EUR' : 'USD';
      syms.add(base);
      rows.push({
        line: r + 2,
        date: dt.date,
        time: dt.time,
        type,
        symbol: base,
        quantity: qty,
        unitPrice: price,
        currency,
        fee,
        fromFiat: type === 'buy' && fiatQuote,
        toFiat: type === 'sell' && fiatQuote,
        note: `Import ${label}${pair ? ` (${base}/${quote})` : ''}`,
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
