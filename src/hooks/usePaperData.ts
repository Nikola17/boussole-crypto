// Données de marché du papier : prix du moment des cryptos détenues, et clôtures journalières pour les courbes.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMarkets, usePrices } from './useMarket';
import { getAllPrices } from '../api/binance';
import { loadDailyHistory } from '../api/history';
import { pairOf } from './usePaperSettle';

/** Prix (USD) des cryptos demandées : marché du top 250, complété par CoinGecko pour les autres. */
export function usePaperPrices(coinIds: string[]): Map<string, number> {
  const markets = useMarkets();
  const outside = useMemo(() => coinIds.filter((id) => !(markets.data ?? []).some((m) => m.id === id)), [coinIds, markets.data]);
  const extra = usePrices(outside);
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const row of markets.data ?? []) m.set(row.id, row.current_price);
    for (const [id, p] of Object.entries(extra.data ?? {})) if (p?.usd) m.set(id, p.usd);
    return m;
  }, [markets.data, extra.data]);
}

/** Clôtures journalières (jour → prix) des cryptos demandées, depuis l'historique Binance gardé en cache. */
export function usePaperCloses(coins: { coinId: string; symbol: string }[]) {
  const markets = useMarkets();
  const key = coins.map((c) => c.coinId).sort().join(',');
  return useQuery({
    queryKey: ['paper-closes', key],
    enabled: !!markets.data,
    staleTime: 6 * 3600_000,
    queryFn: async () => {
      const prices = await getAllPrices().catch(() => new Map<string, number>());
      const out = new Map<string, Map<string, number>>();
      for (const c of coins) {
        const price = markets.data?.find((m) => m.id === c.coinId)?.current_price ?? null;
        const sym = c.coinId === 'bitcoin' ? 'BTCUSDT' : pairOf(c, prices, price);
        if (!sym) continue;
        const candles = await loadDailyHistory(sym).catch(() => []);
        out.set(c.coinId, new Map(candles.map((k) => [new Date(k.time * 1000).toISOString().slice(0, 10), k.close])));
      }
      return out;
    },
  });
}
