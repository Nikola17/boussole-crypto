// Binance — données de marché publiques (bougies) : sans clé, sans compte.

import type { Candle } from '../lib/indicators';
import { getJson } from './http';

const BASE = 'https://data-api.binance.vision/api/v3';

export type Interval = '1h' | '4h' | '1d' | '1w';

type RawKline = [number, string, string, string, string, string, number, string, number, string, string, string];

function toCandle(k: RawKline): Candle {
  return { time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[7] };
}

// Cache mémoire : les mêmes bougies servent au cockpit, aux signaux, au scanner et aux fiches.
const klineCache = new Map<string, { at: number; data: Promise<Candle[]> }>();
const KLINE_TTL: Record<Interval, number> = { '1h': 2 * 60_000, '4h': 5 * 60_000, '1d': 10 * 60_000, '1w': 30 * 60_000 };

export async function getKlines(symbol: string, interval: Interval = '1d', limit = 500, startTime?: number): Promise<Candle[]> {
  const key = `${symbol}|${interval}|${startTime ?? ''}`;
  const hit = klineCache.get(key);
  if (hit && Date.now() - hit.at < KLINE_TTL[interval]) {
    const cached = await hit.data;
    if (cached.length >= Math.min(limit, 1000) || startTime) return cached.slice(-limit);
  }
  const u = new URL(`${BASE}/klines`);
  u.searchParams.set('symbol', symbol);
  u.searchParams.set('interval', interval);
  u.searchParams.set('limit', String(Math.min(limit, 1000)));
  if (startTime) u.searchParams.set('startTime', String(startTime));
  const data = getJson<RawKline[]>(u.toString(), { timeoutMs: 20000 }).then((raw) => raw.map(toCandle));
  klineCache.set(key, { at: Date.now(), data });
  try {
    return await data;
  } catch (e) {
    klineCache.delete(key);
    throw e;
  }
}

/** Historique journalier complet depuis `startMs` (pagination par tranches de 1000 bougies). */
export async function getDailyHistory(symbol: string, startMs: number): Promise<Candle[]> {
  const out: Candle[] = [];
  let cursor = startMs;
  for (let i = 0; i < 12; i++) {
    const chunk = await getKlines(symbol, '1d', 1000, cursor);
    if (!chunk.length) break;
    out.push(...chunk);
    if (chunk.length < 1000) break;
    cursor = (chunk[chunk.length - 1].time + 86400) * 1000;
  }
  // Retire la bougie du jour si elle est incomplète ? On la garde : elle reflète le prix actuel.
  return out;
}

/** Cours moyen (ouverture/clôture) de la bougie d'une minute : sert à mesurer l'écart de prix payé sur une plateforme. */
export async function getMinutePrice(symbol: string, timeMs: number): Promise<number | null> {
  const u = new URL(`${BASE}/klines`);
  u.searchParams.set('symbol', symbol);
  u.searchParams.set('interval', '1m');
  u.searchParams.set('startTime', String(Math.floor(timeMs / 60000) * 60000));
  u.searchParams.set('limit', '1');
  const raw = await getJson<RawKline[]>(u.toString(), { timeoutMs: 15000 });
  const k = raw[0];
  return k ? (+k[1] + +k[4]) / 2 : null;
}

let priceCache: { at: number; map: Map<string, number> } | null = null;

/** Prix de toutes les paires (pour savoir quelles cryptos ont une paire USDT). */
export async function getAllPrices(): Promise<Map<string, number>> {
  if (priceCache && Date.now() - priceCache.at < 5 * 60_000) return priceCache.map;
  const raw = await getJson<{ symbol: string; price: string }[]>(`${BASE}/ticker/price`, { timeoutMs: 20000 });
  const map = new Map<string, number>();
  for (const r of raw) map.set(r.symbol, +r.price);
  priceCache = { at: Date.now(), map };
  return map;
}

const SYMBOL_OVERRIDES: Record<string, string> = {
  'binance-peg-ethereum': 'ETHUSDT',
};

/**
 * Trouve la paire USDT Binance d'une crypto CoinGecko et vérifie que le prix correspond
 * (évite les homonymes : deux tokens différents avec le même ticker).
 */
export function binanceSymbolFor(coin: { id: string; symbol: string; priceUsd: number }, prices: Map<string, number>): string | null {
  const sym = SYMBOL_OVERRIDES[coin.id] ?? `${coin.symbol.toUpperCase()}USDT`;
  const p = prices.get(sym);
  if (!p || !coin.priceUsd) return null;
  const diff = Math.abs(p - coin.priceUsd) / coin.priceUsd;
  return diff < 0.05 ? sym : null;
}

/** Dernier taux de financement du contrat perpétuel BTC (sentiment des traders à levier). */
export async function getBtcFunding(): Promise<number | null> {
  try {
    const r = await getJson<{ lastFundingRate: string }>('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT', { timeoutMs: 10000, retries: 0 });
    const v = Number(r.lastFundingRate);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
