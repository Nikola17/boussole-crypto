import { describe, expect, it } from 'vitest';
import { weeklyReview, type WeeklyInput } from './weekly';

const base: WeeklyInput = {
  scheduled: ['2026-11-03', '2026-11-06'],
  executions: [{ periodKey: '2026-11-03', investedUsd: 25, reserveDeltaUsd: 0 }, { periodKey: '2026-11-06', investedUsd: 18.75, reserveDeltaUsd: 6.25 }],
  budgetUsd: 25, reserveUsd: 20, lines: 10, maxLines: 12, tinyLines: 0, discoveryLines: 3, maxDiscoveryLines: 5, vsBtcPct: null, temperature: 31,
};

describe('bilan de la semaine', () => {
  it('une semaine complète : toutes les échéances traitées, montants investis', () => {
    const r = weeklyReview(base);
    expect(r).toMatchObject({ scheduled: 2, done: 2, missed: 0, skipped: 0 });
    expect(r.investedUsd).toBeCloseTo(43.75);
    expect(r.items[0].tone).toBe('ok');
    expect(r.items[0].text).toContain('2 échéances sur 2');
  });

  it('une échéance manquée est signalée, une échéance sautée volontairement ne l\'est pas', () => {
    const missed = weeklyReview({ ...base, executions: [base.executions[0]] });
    expect(missed.missed).toBe(1);
    expect(missed.items[0].tone).toBe('warn');
    const skipped = weeklyReview({ ...base, executions: [base.executions[0], { periodKey: '2026-11-06', skipped: true, investedUsd: 0, reserveDeltaUsd: 25 }] });
    expect(skipped.missed).toBe(0);
    expect(skipped.skipped).toBe(1);
    expect(skipped.items[0].tone).toBe('ok');
  });

  it('signale l\'éparpillement et les lignes sous le minimum', () => {
    expect(weeklyReview({ ...base, lines: 14 }).items.some((x) => x.tone === 'warn' && x.text.includes('14 lignes'))).toBe(true);
    expect(weeklyReview({ ...base, tinyLines: 3 }).items.some((x) => x.text.includes('3 lignes sous le poids minimal'))).toBe(true);
    expect(weeklyReview({ ...base, discoveryLines: 7 }).items.some((x) => x.text.includes('7 lignes « découverte »'))).toBe(true);
  });

  it('écart avec Bitcoin, dans les deux sens, et semaine sans échéance', () => {
    expect(weeklyReview({ ...base, vsBtcPct: 4.2 }).items.some((x) => x.text.includes('devance Bitcoin seul de 4,2 %'))).toBe(true);
    expect(weeklyReview({ ...base, vsBtcPct: -3 }).items.some((x) => x.text.includes('Bitcoin seul ferait 3 % mieux'))).toBe(true);
    expect(weeklyReview({ ...base, scheduled: [], executions: [] }).items[0].tone).toBe('info');
  });
});
