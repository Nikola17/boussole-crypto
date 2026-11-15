import { describe, expect, it } from 'vitest';
import { DEFAULT_TRUST_RULES, trustVerdict } from './trust';
import type { DayPoint } from './metrics';
import type { Fill } from './types';

const days = (n: number, value: (i: number) => number, flow: (i: number) => number = () => 0): DayPoint[] =>
  Array.from({ length: n }, (_, i) => ({ day: new Date(Date.UTC(2026, 0, 1) + i * 86400_000).toISOString().slice(0, 10), valueUsd: value(i), cashUsd: 0, flowUsd: flow(i) }));
/** n trades clos : gain de +2 R (prix 100 → 120, stop 90) ou perte de −1 R (100 → 90), selon le motif. */
const trades = (n: number, win: (k: number) => boolean): Fill[] => Array.from({ length: n }, (_, k) => {
  const coinId = `c${k}`;
  const base = { coinId, symbol: coinId, name: coinId, kind: 'market' as const, feeUsd: 0, reason: '' };
  return [
    { ...base, side: 'buy' as const, quantity: 1, marketUsd: 100, priceUsd: 100, at: `2026-01-${String(1 + (k % 27)).padStart(2, '0')}`, stop: 90 },
    { ...base, side: 'sell' as const, quantity: 1, marketUsd: win(k) ? 120 : 90, priceUsd: win(k) ? 120 : 90, at: `2026-02-${String(1 + (k % 27)).padStart(2, '0')}` },
  ];
}).flat();
const up = (n: number) => days(n, (i) => 1000 * (1 + 0.001 * i + 0.002 * Math.sin(i)));

describe('verdict de confiance', () => {
  it('en observation : textes exacts', () => {
    const v = trustVerdict({ kind: 'trades', seed: 'p1', live: up(27), fills: trades(9, () => true), reference: null, bench: null });
    expect(v.level).toBe('observation');
    expect(v.headline).toBe('En observation : jour 27 sur 90, 9 trades sur 30. Ne copie pas encore.');
    expect(v.copyPct).toBeNull();
  });
  it('insuffisant : résultat négatif après la période d’observation', () => {
    const v = trustVerdict({ kind: 'trades', seed: 'p1', live: days(100, (i) => 1000 - i), fills: trades(40, (k) => k % 4 === 0), reference: null, bench: null });
    expect(v.level).toBe('insuffisant');
  });
  it('encourageant puis fiable', () => {
    const noisy = trustVerdict({ kind: 'trades', seed: 'p1', live: up(100), fills: trades(32, (k) => k % 3 === 0), reference: null, bench: { p10: -5 } });
    expect(noisy.level).toBe('encourageant');
    expect(noisy.headline).toBe('Résultats positifs, mais ce peut encore être de la chance.');
    expect(noisy.copyPct).toBe(5);
    const solid = trustVerdict({ kind: 'trades', seed: 'p1', live: up(100), fills: trades(40, (k) => k % 4 !== 3), reference: null, bench: { p10: -5 } });
    expect(solid.level).toBe('fiable');
    expect(solid.headline).toBe('Fiable jusqu’ici. Le verdict se recalcule chaque jour.');
    expect(solid.copyPct).toBe(15);
    expect(trustVerdict({ kind: 'trades', seed: 'p1', live: up(100), fills: trades(40, (k) => k % 4 !== 3), reference: null, bench: { p10: -5 } })).toEqual(solid);
  });
  it('confiance retirée quand un portefeuille encourageant dépasse la baisse maximale', () => {
    const previous = trustVerdict({ kind: 'trades', seed: 'p1', live: up(100), fills: trades(32, (k) => k % 3 === 0), reference: null, bench: { p10: -5 } });
    const crash = days(110, (i) => (i < 100 ? 1000 * (1 + 0.001 * i) : 700));
    const v = trustVerdict({ kind: 'trades', seed: 'p1', live: crash, fills: trades(32, (k) => k % 3 === 0), reference: null, bench: { p10: -5 }, previous, today: '2026-04-20' });
    expect(v.level).toBe('retirée');
    expect(v.headline).toBe('Confiance retirée le 20/04 : baisse maximale dépassée.');
  });
  it('stratégie à échéances : comparée au DCA Bitcoin simple', () => {
    const flows = (i: number) => (i % 3 === 0 ? 25 : 0);
    const mine = days(100, (i) => 25 * Math.floor(i / 3 + 1) * (1 + 0.003 * i), flows);
    const ref = days(100, (i) => 25 * Math.floor(i / 3 + 1) * (1 + 0.001 * i), flows);
    const v = trustVerdict({ kind: 'deposits', seed: 'p2', live: mine, fills: [], reference: ref, bench: { p10: -50 } });
    expect(v.criteria.find((c) => c.id === 'C3')?.ok).toBe(true);
    expect(['encourageant', 'fiable']).toContain(v.level);
    const worse = trustVerdict({ kind: 'deposits', seed: 'p2', live: ref, fills: [], reference: mine, bench: null });
    expect(worse.level).toBe('insuffisant');
    expect(worse.headline).toBe('Ne fait pas mieux que le DCA Bitcoin simple. À ne pas copier.');
  });
  it('règles par défaut', () => {
    expect(DEFAULT_TRUST_RULES).toEqual({ minDays: 90, minTrades: 30, minDeposits: 20, maxDrawdownPct: 25, maxExtraDrawdownPts: 5, bootstrapDraws: 2000, minWindowWinPct: 60, withdrawGapPts: 10, copyPct: 5, copyPctTrusted: 15 });
  });
});
