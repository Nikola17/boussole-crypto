// Discipline du mois : régularité, maîtrise des achats, journal tenu. Aucun point ne s'invente.

import { describe, expect, it } from 'vitest';
import { disciplineMonth, isSameMonth, monthKeyOf } from './discipline';
import type { HotNote } from '../types';

const note = (id: string, date: string): HotNote => ({ id, date, action: 'wait', note: 'j\\u2019ai attendu', createdAt: date });

describe('disciplineMonth', () => {
  const month = '2026-11';
  const base = {
    scheduledDays: ['2026-11-03', '2026-11-06', '2026-11-10', '2026-11-13'],
    handledDays: ['2026-11-03', '2026-11-06', '2026-11-10', '2026-11-13'],
    buys: [
      { date: '2026-11-03', symbol: 'btc' },
      { date: '2026-11-06', symbol: 'eth' },
      { date: '2026-11-10', symbol: 'sui' },
      { date: '2026-11-13', symbol: 'eth' },
    ],
    sells: [],
    notes: [note('n1', '2026-11-12'), note('n2', '2026-11-14'), note('n3', '2026-11-20'), note('n4', '2026-11-25')],
  };

  it('mois parfait : 100, tout est nommé', () => {
    const r = disciplineMonth(base, month);
    expect(r.score).toBe(100);
    expect(r.missedCount).toBe(0);
    expect(r.impulseBuys).toHaveLength(0);
    expect(r.items.every((i) => i.tone !== 'warn')).toBe(true);
  });

  it('échéance manquée : la régularité paie (une manquée sur quatre coupe le score, sans humiliation)', () => {
    const r = disciplineMonth({ ...base, handledDays: ['2026-11-03', '2026-11-06', '2026-11-10'] }, month);
    expect(r.missedCount).toBe(1);
    expect(r.score).toBeLessThan(100);
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.items.some((i) => i.tone === 'warn')).toBe(true);
  });

  it('une impulsion coûte 6 points, cinq vident la marge, jamais sous 0', () => {
    const r1 = disciplineMonth({ ...base, buys: [...base.buys, { date: '2026-11-19', symbol: 'doge' }] }, month);
    expect(r1.score).toBe(94);
    const r5 = disciplineMonth({ ...base, buys: [...base.buys, ...[0, 1, 2, 3, 4].map((k) => ({ date: `2026-11-2${k}`, symbol: `x${k}` }))] }, month);
    expect(r5.score).toBe(70); // 100 - 30 de maîtrise ; journal et régularité restent acquis
    const r8 = disciplineMonth({ ...base, buys: [...base.buys, ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ date: `2026-11-2${k}`, symbol: `x${k}` }))] }, month);
    expect(r8.score).toBe(70); // jamais négatif : journal et régularité restent acquis
  });

  it('les achats des autres mois ne comptent pas ; le mois clé se lit seule', () => {
    const r = disciplineMonth({ ...base, buys: [...base.buys, { date: '2026-10-19', symbol: 'old' }, { date: '2026-12-01', symbol: 'next' }] }, month);
    expect(r.impulseBuys).toHaveLength(0);
  });

  it('sans échéance programmée : pas de faux zéro, un conseil', () => {
    const r = disciplineMonth({ scheduledDays: [], handledDays: [], buys: [], sells: [], notes: [] }, month);
    expect(r.items[0].tone).toBe('info');
    expect(isSameMonth('2026-11-03', month)).toBe(true);
    expect(isSameMonth('2026-12-03', month)).toBe(false);
    expect(monthKeyOf('2026-11-30')).toBe(month);
  });
});
