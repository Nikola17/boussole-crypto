import { describe, expect, it } from 'vitest';
import { eurPerUsdOn, FALLBACK_EUR_PER_USD, sanitizeFx } from './fx';

describe('taux de change EUR/USD', () => {
  it('un seul repli pour toute l’application', () => {
    expect(FALLBACK_EUR_PER_USD).toBeGreaterThan(0.8);
    expect(FALLBACK_EUR_PER_USD).toBeLessThan(0.95);
    expect(sanitizeFx(undefined)).toBe(FALLBACK_EUR_PER_USD);
    expect(sanitizeFx(NaN)).toBe(FALLBACK_EUR_PER_USD);
    expect(sanitizeFx(0)).toBe(FALLBACK_EUR_PER_USD);
    expect(sanitizeFx(12)).toBe(FALLBACK_EUR_PER_USD);
    expect(sanitizeFx(0.9)).toBe(0.9);
  });

  const closes = new Map([['2026-08-01', 1.25], ['2026-08-04', 1.0]]); // dollars pour 1 euro

  it('une opération passée reçoit le taux de son jour (euros pour 1 dollar)', () => {
    expect(eurPerUsdOn('2026-08-01', closes, 0.87)).toBeCloseTo(0.8);
    expect(eurPerUsdOn('2026-08-04', closes, 0.87)).toBeCloseTo(1);
  });

  it('un jour sans cotation (week-end) reprend le dernier cours connu des 7 jours précédents', () => {
    expect(eurPerUsdOn('2026-08-03', closes, 0.87)).toBeCloseTo(0.8);
  });

  it('pas d’historique, ou jour trop lointain : le taux actuel', () => {
    expect(eurPerUsdOn('2026-08-01', null, 0.87)).toBe(0.87);
    expect(eurPerUsdOn('2026-08-01', new Map(), 0.87)).toBe(0.87);
    expect(eurPerUsdOn('2026-09-30', closes, 0.87)).toBe(0.87);
  });
});

describe('DCA toutes les deux semaines : le changement d’heure ne décale plus l’échéance', () => {
  it('du 5 janvier au passage à l’heure d’été (29 mars 2026), puis après', async () => {
    process.env.TZ = 'Europe/Paris';
    const { isScheduledDay, nextOccurrences, periodKey } = await import('./dca');
    const plan = { frequency: 'biweekly' as const, startDate: '2026-01-05', dayOfWeek: 1 }; // un lundi sur deux depuis le 5 janvier
    const day = (m: number, d: number) => new Date(2026, m - 1, d);
    // semaines 0, 2, 4… : 5 janv., 19 janv., … ; le 30 mars est la semaine 12 (déjà après le passage à l'heure d'été)
    expect(isScheduledDay(plan, day(1, 5))).toBe(true);
    expect(isScheduledDay(plan, day(1, 12))).toBe(false);
    expect(isScheduledDay(plan, day(3, 16))).toBe(true); // semaine 10, avant le changement d'heure
    expect(isScheduledDay(plan, day(3, 30))).toBe(true); // semaine 12 : avant le correctif, l'application la comptait 11
    expect(isScheduledDay(plan, day(4, 6))).toBe(false); // semaine 13
    expect(isScheduledDay(plan, day(4, 13))).toBe(true); // semaine 14
    expect(nextOccurrences(plan, day(3, 17), 3).map((d) => d.getDate())).toEqual([30, 13, 27]);
    expect(periodKey(plan, day(3, 30))).toBe('b-6');
    expect(periodKey(plan, day(4, 5))).toBe('b-6'); // le dimanche 5 avril appartient encore à la période du 30 mars
  });
});
