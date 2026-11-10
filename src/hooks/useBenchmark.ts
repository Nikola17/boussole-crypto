// Comparaison « tout en Bitcoin » (portefeuille entier et poche découverte), partagée par la carte et le bilan hebdomadaire.

import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useBtcHistory, useMarkets } from './useMarket';
import { usePortfolio } from './usePortfolio';
import { btcBenchmark, compare, discoveryFlows, fiatFlows, priceByDay, type Comparison } from '../lib/benchmark';

const CORE = new Set(['bitcoin', 'ethereum']);

export function useBenchmark(): { all: Comparison | null; disc: Comparison | null; rate: number; currency: 'EUR' | 'USD'; error: Error | null; retry: () => void } {
  const txs = useStore((s) => s.transactions);
  const pf = usePortfolio();
  const btc = useBtcHistory();
  const markets = useMarkets();
  const now = markets.data?.find((m) => m.id === 'bitcoin')?.current_price ?? btc.data?.[btc.data.length - 1]?.close ?? 0;
  const prices = useMemo(() => (btc.data ? priceByDay(btc.data) : null), [btc.data]);

  const res = useMemo(() => {
    if (!prices || !(now > 0) || !(pf.rate > 0)) return { all: null, disc: null };
    const withCost = pf.holdings.filter((h) => h.valueWithCost != null && h.costQty);
    const flows = fiatFlows(txs);
    const dflows = discoveryFlows(txs, CORE);
    const allActual = withCost.reduce((s, h) => s + (h.valueWithCost ?? 0), 0) / pf.rate;
    const discActual = withCost.filter((h) => h.coinId && !CORE.has(h.coinId) && h.bucket !== 'stable').reduce((s, h) => s + (h.valueWithCost ?? 0), 0) / pf.rate;
    return {
      all: flows.length ? compare(allActual, btcBenchmark(flows, prices, now)) : null,
      disc: dflows.length ? compare(discActual, btcBenchmark(dflows, prices, now)) : null,
    };
  }, [prices, now, pf.holdings, pf.rate, txs]);
  // L'historique de Bitcoin manque : la carte le dit (avant, elle disparaissait sans explication).
  return { ...res, rate: pf.rate, currency: pf.currency, error: (btc.error as Error | null) ?? null, retry: () => void btc.refetch() };
}
