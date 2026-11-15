import { describe, expect, it } from 'vitest';
import { autoState, effectiveCursor, mergeDayLogs, sameDayLog } from './autoState';
import { mergeBundles } from '../sync/merge';
import type { PaperDayLog, PaperFill, PaperPortfolio } from '../../types';

const pf: PaperPortfolio = { id: 'p1', name: 'A', kind: 'auto', startingUsd: 0, createdAt: '2026-11-01T00:00:00.000Z', costs: { preset: 'exchange', feePct: 0.1, spreadPct: 0.05 }, cursorDay: '2026-11-03' };
const fill = (side: 'buy' | 'sell', quantity: number, priceUsd: number, feeUsd: number, over: Partial<PaperFill> = {}): PaperFill => ({ coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', side, kind: 'market', quantity, marketUsd: priceUsd, priceUsd, feeUsd, at: 'x', reason: 'r', ...over });
const log = (day: string, over: Partial<PaperDayLog> = {}): PaperDayLog => ({ id: `p1:${day}`, portfolioId: 'p1', day, decidedOn: day, rules: 'dca-btc@1', depositUsd: 0, fills: [], skipped: [], by: 'pc', ...over });

describe('état d’un autopilote', () => {
  const logs = [
    log('2026-11-02', { depositUsd: 100 }),
    log('2026-11-03', { fills: [fill('buy', 1, 50, 0.05, { tag: 'dca', stop: 40 })] }),
    log('2026-11-05', { fills: [fill('sell', 0.5, 60, 0.03, { tag: 'trim' })] }),
  ];
  it('cash, positions et dernières exécutions rejoués depuis les journaux', () => {
    const s = autoState(pf, [logs[2], logs[0], logs[1]]);
    expect(s.cashUsd).toBeCloseTo(100 - 50.05 + 30 - 0.03, 9);
    expect(s.positions.bitcoin.quantity).toBeCloseTo(0.5, 9);
    expect(s.positions.bitcoin.costUsd).toBeCloseTo(50.05 / 2, 9);
    expect(s.positions.bitcoin.openedOn).toBe('2026-11-03');
    expect(s.positions.bitcoin.stop).toBe(40);
    expect(s.lastFill.trim).toBe('2026-11-05');
    expect(s.lastFill['dca|bitcoin']).toBe('2026-11-03');
  });
  it('plus haut et plus bas depuis le sommet, aux clôtures', () => {
    const closes: Record<string, number> = { '2026-11-03': 80, '2026-11-05': 40 };
    const s = autoState(pf, logs, (_c, day) => closes[day] ?? null);
    expect(s.peakEquityUsd).toBeCloseTo(100 - 50.05 + 80, 9);
    expect(s.minSincePeakUsd).toBeCloseTo(100 - 50.05 + 30 - 0.03 + 0.5 * 40, 9);
  });
  it('écriture idempotente : même contenu, autre appareil → rien à réécrire', () => {
    const a = log('2026-11-02', { depositUsd: 100, updatedAt: '2026-11-02T08:00:00.000Z', by: 'pc' });
    const b = { ...a, updatedAt: '2026-11-02T08:03:00.000Z', by: 'vps' };
    expect(sameDayLog(a, b)).toBe(true);
    expect(mergeDayLogs([a], [b]).changed).toEqual([]);
    const c = { ...b, depositUsd: 25 };
    const r = mergeDayLogs([a], [c]);
    expect(r.changed).toEqual([c]);
    expect(r.days).toEqual([c]);
    expect(mergeDayLogs([], [a]).days).toEqual([a]);
  });
  it('deux appareils fusionnés : aucun doublon', () => {
    const a = log('2026-11-02', { updatedAt: '2026-11-02T08:00:00.000Z', by: 'pc' });
    const b = { ...a, updatedAt: '2026-11-02T08:01:00.000Z', by: 'vps' };
    const merged = mergeBundles({ data: { paperDays: [a] }, deletions: [], stamps: {} }, { data: { paperDays: [b] }, deletions: [], stamps: {} });
    expect(merged.data.paperDays).toHaveLength(1);
  });
  it('curseur effectif : le plus avancé du portefeuille et des journaux', () => {
    expect(effectiveCursor(pf, logs)).toBe('2026-11-05');
    expect(effectiveCursor({ ...pf, cursorDay: '2026-11-09' }, logs)).toBe('2026-11-09');
    expect(effectiveCursor({ ...pf, cursorDay: undefined }, [])).toBe('');
  });
});
