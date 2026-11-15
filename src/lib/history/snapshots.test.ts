import { describe, expect, it } from 'vitest';
import { chooseSnapshot, mergeEquity } from './snapshots';
import type { PortfolioSnapshot } from '../../types';
import type { DayPoint } from '../lab/metrics';

const snap = (day: string, valueUsd: number, complete = true): PortfolioSnapshot => ({ id: day, day, valueUsd, byBucket: { btc: valueUsd }, complete });

describe('relevés quotidiens du portefeuille', () => {
  it('un relevé complet remplace un partiel, jamais l’inverse', () => {
    expect(chooseSnapshot(undefined, snap('d', 100, false))).toEqual(snap('d', 100, false));
    expect(chooseSnapshot(snap('d', 90, false), snap('d', 100))).toEqual(snap('d', 100));
    expect(chooseSnapshot(snap('d', 100), snap('d', 80, false))).toBeNull();
    expect(chooseSnapshot(snap('d', 100), snap('d', 101))).toBeNull(); // un relevé complet par jour suffit
  });
  it('la courbe suit les relevés à partir du premier', () => {
    const rebuilt: DayPoint[] = ['2026-01-01', '2026-01-02', '2026-01-03'].map((day, i) => ({ day, valueUsd: 100 + i, cashUsd: 0, flowUsd: 0 }));
    const r = mergeEquity(rebuilt, [snap('2026-01-02', 150), snap('2026-01-03', 160, false)]);
    expect(r.firstSnapshotDay).toBe('2026-01-02');
    expect(r.series.map((p) => p.valueUsd)).toEqual([100, 150, 102]); // un relevé partiel ne remplace rien
  });
});
