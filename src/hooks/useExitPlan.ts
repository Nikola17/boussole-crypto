// Plan de sortie : pour chaque ligne, paliers (altcoins) ou allègement en euphorie (Bitcoin, Ethereum).

import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useCycle } from './useMarket';
import { usePortfolio } from './usePortfolio';
import { DEFAULT_LADDER, euphoriaStep, exitLadder, pendingRungs, type Rung } from '../lib/exit';
import { isTinyLine, trimStatus, type TrimStatus } from '../lib/rules';
import { rulesOf } from '../lib/profile';

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
  /** Paliers personnalisés (sinon ×2, ×3, ×5 à 25 % chacun). */
  hasCustomPlan: boolean;
  rungs: Rung[];
  /** Ligne trop petite pour des paliers : à regrouper vers Bitcoin (voir « Consolider »). */
  tiny: boolean;
  /** Cœur uniquement : tranche autorisée ou délai en cours depuis la dernière vente. */
  trim: TrimStatus | null;
}

export function useExitPlan() {
  const pf = usePortfolio();
  const cycle = useCycle();
  const exitSteps = useStore((s) => s.exitSteps);
  const done = useStore((s) => s.exitDone);
  const coreTrims = useStore((s) => s.coreTrims);
  const profile = useStore((s) => s.profile);
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
    const totalUsd = pf.holdings.reduce((s, h) => s + h.valueUsd, 0);
    const minLinePct = rulesOf(profile).minLinePct;
    const now = new Date();
    const coins: ExitCoin[] = [...agg.entries()].map(([coinId, a]) => {
      const core = a.bucket === 'btc' || a.bucket === 'eth';
      const custom = exitSteps[coinId]?.length ? exitSteps[coinId] : null;
      const avgCostUsd = a.costQty > 0 ? a.costUsd / a.costQty : 0;
      const rungs = core ? [] : exitLadder({ avgCostUsd, priceUsd: a.priceUsd ?? 0, quantity: a.qty, steps: custom ?? DEFAULT_LADDER, doneMultiples: done[coinId] ?? [] });
      const tiny = !core && !custom && isTinyLine(a.valueUsd, totalUsd, minLinePct);
      return { coinId, symbol: a.symbol, name: a.name, image: a.image, quantity: a.qty, valueUsd: a.valueUsd, priceUsd: a.priceUsd, avgCostUsd, core, hasCustomPlan: !!custom, rungs, tiny, trim: core ? trimStatus(coreTrims[coinId], now) : null };
    }).sort((x, y) => y.valueUsd - x.valueUsd);
    const pending = coins.filter((c) => !c.tiny).flatMap((c) => pendingRungs(c.rungs).map((r) => ({ coin: c, rung: r })));
    return { coins, pending, euphoria: euphoriaStep(temperature), temperature, rate: pf.rate, currency: pf.currency, fx: pf.fx, totalValue: pf.totals.value };
  }, [pf.holdings, pf.rate, pf.currency, pf.fx, pf.totals.value, exitSteps, done, temperature, coreTrims, profile]);
}
