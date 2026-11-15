import { describe, expect, it } from 'vitest';
import { fillForward, picksDue, pickPerformance, PICK_CARD_MIN_WEEKS, recordWeek, weeklyPicks } from './pickTracking';
import type { PickSnapshot } from '../types';

const gems = Array.from({ length: 12 }, (_, i) => ({ coinId: `g${i}`, symbol: `g${i}`, score: 90 - i, priceUsd: 1 }));
const basket = [{ coinId: 'b1', symbol: 'b1', priceUsd: 2 }, { coinId: 'g0', symbol: 'g0', priceUsd: 1 }];

describe('pépites suivies en avant', () => {
  it('10 meilleures pépites + découvertes du panier, sans doublon', () => {
    const s = weeklyPicks('2026-W46', '2026-11-09', gems, basket, 100);
    expect(s.id).toBe('2026-W46');
    expect(s.picks.filter((p) => p.source === 'gems').map((p) => p.coinId)).toEqual(gems.slice(0, 10).map((g) => g.coinId));
    expect(s.picks.filter((p) => p.source === 'basket').map((p) => p.coinId)).toEqual(['b1']);
    expect(s.btcUsd).toBe(100);
  });
  it('deux relevés la même semaine : un seul gardé', () => {
    const a = weeklyPicks('2026-W46', '2026-11-09', gems, [], 100);
    const b = weeklyPicks('2026-W46', '2026-11-12', gems.slice(5), [], 120);
    const once = recordWeek([], a);
    expect(recordWeek(once, b)).toBe(once);
    expect(recordWeek(once, b)).toHaveLength(1);
  });
  it('prix relevés à 30 et 90 jours (dans les 7 jours qui suivent), performance contre Bitcoin', () => {
    const s = weeklyPicks('2026-W33', '2026-08-10', [{ coinId: 'a', symbol: 'a', score: 80, priceUsd: 1 }, { coinId: 'b', symbol: 'b', score: 70, priceUsd: 1 }], [], 100);
    expect(picksDue([s], '2026-09-08')).toBe(false);
    expect(picksDue([s], '2026-09-09')).toBe(true);
    const px30: Record<string, number> = { a: 1.5, b: 0.9 };
    const at30 = fillForward([s], '2026-09-10', (id) => px30[id] ?? null, 110);
    expect(at30[0].picks.map((p) => p.p30)).toEqual([1.5, 0.9]);
    expect(at30[0].btc30).toBe(110);
    const at90 = fillForward(at30, '2026-11-08', () => 2, 150);
    expect(at90[0].btc90).toBe(150);
    const perf = pickPerformance(at90, '2026-11-15');
    expect(perf.at30!.avgPct).toBeCloseTo(20, 6); // (+50 % − 10 %) / 2
    expect(perf.at30!.vsBtcPts).toBeCloseTo(10, 6); // Bitcoin +10 %
    expect(perf.at90!.avgPct).toBeCloseTo(100, 6);
    expect(perf.at90!.vsBtcPts).toBeCloseTo(50, 6);
    expect(perf.weeks).toBe(13);
  });
  it('fenêtre manquée : prix inconnu, la crypto n’est pas comptée ; carte masquée sous 8 semaines', () => {
    const s = weeklyPicks('2026-W33', '2026-08-10', [{ coinId: 'a', symbol: 'a', score: 80, priceUsd: 1 }], [], 100);
    const late = fillForward([s], '2026-09-20', () => 5, 200);
    expect(late[0].picks[0].p30).toBe(0);
    expect(pickPerformance(late, '2026-09-20').at30).toBeNull();
    expect(PICK_CARD_MIN_WEEKS).toBe(8);
    expect(pickPerformance([s], '2026-09-20').weeks).toBe(5);
    const none: PickSnapshot[] = [];
    expect(pickPerformance(none, '2026-09-20')).toEqual({ weeks: 0, at30: null, at90: null, unknown30: 0, unknown90: 0 });
  });
});
