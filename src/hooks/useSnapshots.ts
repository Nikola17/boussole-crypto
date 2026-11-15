// Relevé quotidien du vrai portefeuille : écrit au premier chargement complet de la journée (un relevé partiel,
// pendant qu'un wallet n'a pas répondu, est remplacé plus tard par un complet ; jamais l'inverse).

import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { usePortfolio } from './usePortfolio';
import { useToday } from './useClock';
import { chooseSnapshot } from '../lib/history/snapshots';
import { isoDay } from '../lib/format';

export function useSnapshots(): void {
  const pf = usePortfolio();
  const today = useToday();
  const value = pf.holdings.reduce((s, h) => s + h.valueUsd, 0);
  const ready = !pf.loading && pf.holdings.length > 0 && value > 0;
  const complete = ready && !pf.walletsIncomplete && pf.holdings.every((h) => h.valueUsd > 0 || h.quantity === 0);
  useEffect(() => {
    if (!ready) return;
    const day = isoDay(today);
    const byBucket: Record<string, number> = {};
    for (const h of pf.holdings) byBucket[h.bucket] = Math.round(((byBucket[h.bucket] ?? 0) + h.valueUsd) * 100) / 100;
    const st = useStore.getState();
    const next = chooseSnapshot(st.portfolioSnapshots.find((x) => x.id === day), { id: day, day, valueUsd: Math.round(value * 100) / 100, byBucket, complete });
    if (next) st.upsertPortfolioSnapshot(next);
  }, [ready, complete, today, value, pf.holdings]);
}
