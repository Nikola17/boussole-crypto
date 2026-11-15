// Relevés quotidiens du vrai portefeuille : une valeur par jour, écrite par l'application au premier chargement
// complet. Ils prennent le relais de la courbe reconstituée d'après le journal (qui ne voit pas les soldes lus sur la blockchain).

import type { PortfolioSnapshot } from '../../types';
import type { DayPoint } from '../lab/metrics';

/** Le relevé à écrire (null : rien à écrire). Un relevé complet remplace un partiel, jamais l'inverse ; un complet par jour suffit. */
export function chooseSnapshot(existing: PortfolioSnapshot | undefined, next: PortfolioSnapshot): PortfolioSnapshot | null {
  if (!existing) return next;
  if (existing.complete) return null;
  return next.complete ? next : null;
}

/** Courbe reconstituée, remplacée par les relevés complets à partir du premier. */
export function mergeEquity(reconstructed: DayPoint[], snapshots: PortfolioSnapshot[]): { series: DayPoint[]; firstSnapshotDay: string | null } {
  const complete = new Map(snapshots.filter((s) => s.complete).map((s) => [s.day, s]));
  const firstSnapshotDay = [...complete.keys()].sort()[0] ?? null;
  const series = reconstructed.map((p) => {
    const s = complete.get(p.day);
    return s ? { ...p, valueUsd: s.valueUsd } : p;
  });
  return { series, firstSnapshotDay };
}
