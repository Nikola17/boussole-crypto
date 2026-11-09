// Plan de sortie : pour chaque ligne, paliers (altcoins) ou allègement en euphorie (Bitcoin, Ethereum).

import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useCycle } from './useMarket';
import { usePortfolio } from './usePortfolio';
import { DEFAULT_LADDER, euphoriaStep, exitLadder, pendingRungs, type Rung } from '../lib/exit';

export interface ExitCoin {
  coinId: string;
  symbol: string;
  name: string;
  image?: string;
  quantity: number;
  valueUsd: number;
  priceUsd: number | null;
  avgCostUsd: number;
  core: boolean;
  hasThesis: boolean;
  rungs: Rung[];
}

export function useExitPlan() {
  const pf = usePortfolio();
  const cycle = useCycle();
  const theses = useStore((s) => s.theses);
  const done = useStore((s) => s.exitDone);
  const temperature = cycle.data?.temperature ?? null;

  return useMemo(() => {
    const agg = new Map<string, { symbol: string; name: string; image?: string; bucket: string; qty: number; valueUsd: number; priceUsd: number | null; costUsd: number; costQty: number }>();
    for (const h of pf.holdings) {
      if (!h.coinId || h.bucket === 'stable') continue;
      const a = agg.get(h.coinId) ?? { symbol: h.symbol, name: h.name, image: h.image, bucket: h.bucket, qty: 0, valueUsd: 0, priceUsd: h.priceUsd, costUsd: 0, costQty: 0 };
      a.qty += h.quantity;
      a.valueUsd += h.valueUsd;
      a.priceUsd = h.priceUsd ?? a.priceUsd;
      if (h.cost != null && h.costQty) { a.costUsd += h.cost / pf.rate; a.costQty += h.costQty; }
      agg.set(h.coinId, a);
    }
    const coins: ExitCoin[] = [...agg.entries()].map(([coinId, a]) => {
      const core = a.bucket === 'btc' || a.bucket === 'eth';
      const thesis = theses.find((t) => t.coinId === coinId);
      const avgCostUsd = a.costQty > 0 ? a.costUsd / a.costQty : 0;
      const rungs = core ? [] : exitLadder({ avgCostUsd, priceUsd: a.priceUsd ?? 0, quantity: a.qty, steps: thesis?.sellPlan?.length ? thesis.sellPlan : DEFAULT_LADDER, doneMultiples: done[coinId] ?? [] });
      return { coinId, symbol: a.symbol, name: a.name, image: a.image, quantity: a.qty, valueUsd: a.valueUsd, priceUsd: a.priceUsd, avgCostUsd, core, hasThesis: !!thesis, rungs };
    }).sort((x, y) => y.valueUsd - x.valueUsd);
    const pending = coins.flatMap((c) => pendingRungs(c.rungs).map((r) => ({ coin: c, rung: r })));
    return { coins, pending, euphoria: euphoriaStep(temperature), temperature, rate: pf.rate, currency: pf.currency, fx: pf.fx, totalValue: pf.totals.value };
  }, [pf.holdings, pf.rate, pf.currency, pf.fx, pf.totals.value, theses, done, temperature]);
}
