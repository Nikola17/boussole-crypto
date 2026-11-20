import { describe, expect, it } from 'vitest';
import { alphaBetaVsRef, calmarRatio, exposurePct, sharpeRatio, sortinoRatio, ulcerIndex, type DayPoint } from './metrics';

function mkSeries(vals: number[], cash = 0): DayPoint[] {
  return vals.map((v, i) => ({
    day: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
    valueUsd: v,
    cashUsd: cash,
    flowUsd: 0,
  }));
}

describe('métriques quantitatives institutionnelles', () => {
  it('calcule Sharpe, Sortino, Calmar, Ulcer Index, Exposure et Alpha/Beta', () => {
    const s = mkSeries([100, 102, 101, 104, 106, 105, 108, 111, 110, 114, 117, 116, 120, 124, 123, 128], 10);
    const ref = mkSeries([100, 101, 100.5, 102, 103, 102.5, 104, 105, 104.5, 106, 107, 106.5, 108, 109, 108.5, 110], 0);
    expect(sharpeRatio(s)!).toBeGreaterThan(2);
    expect(sortinoRatio(s)!).toBeGreaterThan(sharpeRatio(s)!);
    expect(calmarRatio(s)!).toBeGreaterThan(10);
    expect(ulcerIndex(s)!).toBeGreaterThan(0);
    expect(ulcerIndex(s)!).toBeLessThan(2);
    expect(exposurePct(s)).toBeCloseTo(100, 4);
    const ab = alphaBetaVsRef(s, ref)!;
    expect(ab.beta).toBeGreaterThan(0.5);
    expect(ab.alphaAnnPct).toBeGreaterThan(0);
  });
});
