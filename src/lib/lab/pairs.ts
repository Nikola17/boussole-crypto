// Paires Binance des cryptos du papier et bougies 1 heure sur une période : partagé par l'application et le serveur.

import { binanceSymbolFor, getKlines } from '../../api/binance';
import type { Candle } from '../indicators';

const HOUR = 3600_000;

/** Paire Binance d'une crypto : contrôlée par le prix quand il est connu, sinon par le seul symbole. */
export function pairOf(coin: { coinId: string; symbol: string }, prices: Map<string, number>, priceUsd: number | null): string | null {
  if (coin.coinId === 'bitcoin') return 'BTCUSDT';
  if (coin.coinId === 'ethereum') return 'ETHUSDT';
  if (priceUsd) return binanceSymbolFor({ id: coin.coinId, symbol: coin.symbol, priceUsd }, prices);
  const sym = `${coin.symbol.toUpperCase()}USDT`;
  return prices.has(sym) ? sym : null;
}

/** Bougies 1 heure d'une paire de `fromMs` à `toMs` (12 pages de 1000 heures au plus). */
export async function hourlyBetween(symbol: string, fromMs: number, toMs = Infinity): Promise<Candle[]> {
  const out: Candle[] = [];
  let cursor = Math.floor(fromMs / HOUR) * HOUR;
  for (let page = 0; page < 12 && cursor < toMs; page++) {
    const chunk = await getKlines(symbol, '1h', 1000, cursor);
    if (!chunk.length) break;
    out.push(...chunk);
    cursor = (chunk[chunk.length - 1].time + 3600) * 1000;
    if (chunk.length < 1000) break;
  }
  return out.filter((c) => c.time * 1000 < toMs);
}
