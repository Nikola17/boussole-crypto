// Historique journalier complet d'une paire Binance (depuis 2017), gardé dans IndexedDB et complété par la fin :
// le banc d'essai de l'application (« Rejouer sur une crypto ») et les courbes papier s'en servent hors ligne.

import { useQuery } from '@tanstack/react-query';
import { getDailyHistory } from './binance';
import { closedCandles, type Candle } from '../lib/indicators';
import { idbGet, idbPut } from '../lib/idb';

const START = Date.UTC(2017, 7, 17);

/** Fusion par date (secondes) : triée, sans doublon, la bougie la plus récente remplace l'ancienne. */
export function appendHistory(old: Candle[], fresh: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const c of old) byTime.set(c.time, c);
  for (const c of fresh) byTime.set(c.time, c);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/** Bougies journalières closes d'un symbole Binance (ex. « BTCUSDT »). */
export async function loadDailyHistory(symbol: string, nowMs = Date.now()): Promise<Candle[]> {
  const key = `hist:${symbol}:1d`;
  const cached = await idbGet<Candle[]>(key);
  let candles = cached ?? [];
  const last = candles[candles.length - 1];
  if (!last) candles = await getDailyHistory(symbol, START);
  else if (nowMs / 1000 - last.time > 86400) candles = appendHistory(candles, await getDailyHistory(symbol, last.time * 1000));
  if (candles !== cached) await idbPut(key, candles);
  return closedCandles(candles, nowMs);
}

export function useDailyHistory(symbol: string | null) {
  return useQuery({
    queryKey: ['daily-history', symbol],
    enabled: !!symbol,
    staleTime: 12 * 3600_000,
    queryFn: () => loadDailyHistory(symbol!),
  });
}
