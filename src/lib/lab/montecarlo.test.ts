import { describe, expect, it } from 'vitest';
import { runMonteCarlo } from './montecarlo';
import type { ClosedTrade } from './metrics';

const tr = (pnlPct: number, i: number): ClosedTrade => ({
  coinId: 'btc', openedAt: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`, closedAt: '2025-02-01',
  costUsd: 100, proceedsUsd: 100 + pnlPct, pnlUsd: pnlPct, pnlPct, r: pnlPct / 5, feesUsd: 0.1,
});

describe('simulation Monte Carlo', () => {
  it('déterministe et cohérente sur une distribution gagnante', () => {
    const trades = [12, -4, 15, -5, 10, 8, -3, 18, -4, 9, 11, -5, 14, -4, 7].map(tr);
    const a = runMonteCarlo(trades, { draws: 500, seed: 's1' })!;
    const b = runMonteCarlo(trades, { draws: 500, seed: 's1' })!;
    expect(a).toEqual(b);
    expect(a.p50Pct).toBeGreaterThan(0);
    expect(a.probPositivePct).toBeGreaterThan(70);
    expect(a.p95Pct).toBeGreaterThanOrEqual(a.p50Pct);
    expect(a.p50Pct).toBeGreaterThanOrEqual(a.p5Pct);
    expect(a.mddP99Pct).toBeLessThanOrEqual(a.mddP95Pct);
    expect(a.mddP95Pct).toBeLessThanOrEqual(a.mddP50Pct);
  });

  it('renvoie null sous 5 trades', () => {
    expect(runMonteCarlo([tr(5, 1), tr(-2, 2)])).toBeNull();
  });
});
