// Univers de mesure du banc d'essai : les cryptos dont la paire USDT existe ou a existé sur Binance,
// paires retirées comprises (pour ne pas mesurer que les survivantes). Une série interrompue plus de 5 jours
// devient deux actifs (l'ancienne LUNA et la nouvelle), et une migration 1 pour 1 (MATIC→POL) est chaînée.
// Faute de capitalisation historique gratuite, le classement à une date se fait par volume en dollars.

import type { Candle } from '../indicators';
import { isGold, isStable, isWrappedOrStaked } from '../portfolio';
import { median } from './stats';

/** Annexe B de la fiche (vérifiée le 14/11/2026) ; KAS et XDC n'ont pas de paire USDT. */
export const UNIVERSE_SYMBOLS: readonly string[] = [
  'BTC', 'ETH', 'BNB', 'XRP', 'ADA', 'SOL', 'DOGE', 'TRX', 'LINK', 'DOT', 'LTC', 'BCH', 'AVAX', 'MATIC', 'POL', 'UNI', 'ATOM', 'XLM',
  'ETC', 'FIL', 'ICP', 'VET', 'THETA', 'EOS', 'AAVE', 'ALGO', 'XTZ', 'NEO', 'IOTA', 'DASH', 'ZEC', 'XMR', 'NEAR', 'FTM', 'S', 'SAND',
  'MANA', 'AXS', 'EGLD', 'HBAR', 'APT', 'ARB', 'OP', 'SUI', 'SHIB', 'PEPE', 'TON', 'LUNA', 'LUNC', 'FTT', 'WAVES', 'XEM', 'OMG', 'MKR',
  'COMP', 'SNX', 'CRV', 'GRT', 'CHZ', 'RUNE', 'CAKE', 'INJ', 'RNDR', 'RENDER', 'FET', 'TIA', 'SEI', 'TAO', 'ENA', 'HYPE', 'ONDO', 'JUP',
  'WIF', 'BONK', 'KSM', 'ENJ', 'QTUM', 'ZIL', 'ONT', 'BAT', 'ICX', 'IOST', 'KAVA', 'STX', 'IMX', 'LDO', 'QNT', 'FLOW', 'GALA', 'ROSE',
  'CELO', 'ONE', 'HNT', 'WLD', 'PYTH', 'JTO', 'STRK', 'ZK', 'EIGEN', 'TRUMP', 'PENGU', 'VIRTUAL',
];

/** Migrations 1 pour 1 : la nouvelle série prolonge l'ancienne. */
export const CHAINS: { from: string; to: string }[] = [{ from: 'MATIC', to: 'POL' }, { from: 'RNDR', to: 'RENDER' }, { from: 'FTM', to: 'S' }];

/** Les seuls identifiants CoinGecko que les stratégies nomment en dur. */
export const ID_MAP: Record<string, string> = { bitcoin: 'BTC', ethereum: 'ETH' };
export const toSymbol = (coinId: string): string => ID_MAP[coinId] ?? coinId;
export const toCoinId = (symbol: string): string => Object.entries(ID_MAP).find(([, s]) => s === symbol)?.[0] ?? symbol;

export const dayOf = (timeSec: number): string => new Date(timeSec * 1000).toISOString().slice(0, 10);

export interface Asset {
  id: string;
  candles: Candle[];
  /** Jour (AAAA-MM-JJ) → index de la bougie. */
  dayIndex: Map<string, number>;
}

export function makeAsset(id: string, candles: Candle[]): Asset {
  return { id, candles, dayIndex: new Map(candles.map((c, i) => [dayOf(c.time), i])) };
}

/** Coupe une série là où plus de `maxGapDays` jours manquent ; identifiants #1, #2… seulement s'il y a coupure. */
export function splitOnGaps(symbol: string, candles: Candle[], maxGapDays = 5): { id: string; candles: Candle[] }[] {
  const parts: Candle[][] = [];
  let cur: Candle[] = [];
  for (const c of candles) {
    const prev = cur[cur.length - 1];
    if (prev && Math.round((c.time - prev.time) / 86400) - 1 > maxGapDays) { parts.push(cur); cur = []; }
    cur.push(c);
  }
  if (cur.length) parts.push(cur);
  return parts.length <= 1 ? [{ id: symbol, candles }] : parts.map((p, i) => ({ id: `${symbol}#${i + 1}`, candles: p }));
}

/** Prolonge `a` par `b` (bougies postérieures), ou null si le prix saute de plus de `maxJumpPct` à la jonction. */
export function chainSeries(a: Candle[], b: Candle[], maxJumpPct = 10): Candle[] | null {
  const last = a[a.length - 1];
  const next = b.find((c) => !last || c.time > last.time);
  if (!last || !next) return null;
  if (Math.abs(next.open / last.close - 1) * 100 > maxJumpPct) return null;
  return [...a, ...b.filter((c) => c.time > last.time)];
}

/** Les actifs du banc d'essai : chaînages, coupures, exclusions (stablecoins, jetons « wrapped », or). */
export function buildAssets(raw: Map<string, Candle[]>): { assets: Asset[]; notes: string[] } {
  const notes: string[] = [];
  const series = new Map(raw);
  for (const { from, to } of CHAINS) {
    const a = series.get(from);
    const b = series.get(to);
    if (!a?.length || !b?.length) continue;
    const chained = chainSeries(a, b);
    if (chained) {
      series.delete(from);
      series.set(to, chained);
      notes.push(`${from} et ${to} chaînées (migration 1 pour 1).`);
    } else notes.push(`${from} et ${to} gardées séparées : écart de prix supérieur à 10 % à la jonction.`);
  }
  const assets: Asset[] = [];
  for (const [symbol, candles] of series) {
    if (!candles.length) continue;
    const id = symbol.toLowerCase();
    if (isStable(symbol, id) || isWrappedOrStaked(symbol, symbol, id) || isGold(symbol)) { notes.push(`${symbol} exclue (stablecoin, jeton « wrapped » ou or).`); continue; }
    const parts = splitOnGaps(symbol, candles);
    if (parts.length > 1) notes.push(`${symbol} coupée en ${parts.length} actifs (interruption de plus de 5 jours).`);
    for (const p of parts) assets.push(makeAsset(p.id, p.candles));
  }
  return { assets, notes };
}

/** Les `top` actifs cotés ce jour-là avec au moins `minBars` bougies, classés par médiane du volume des 30 derniers jours. */
export function universeAt(assets: Asset[], day: string, opts: { top: number; minBars?: number }): Asset[] {
  const minBars = opts.minBars ?? 200;
  return assets
    .map((a) => ({ a, i: a.dayIndex.get(day) }))
    .filter((x): x is { a: Asset; i: number } => x.i != null && x.i + 1 >= minBars)
    .map(({ a, i }) => ({ a, v: median(a.candles.slice(Math.max(0, i - 29), i + 1).map((c) => c.volume)) }))
    .sort((x, y) => y.v - x.v || x.a.id.localeCompare(y.a.id))
    .slice(0, opts.top)
    .map((x) => x.a);
}
