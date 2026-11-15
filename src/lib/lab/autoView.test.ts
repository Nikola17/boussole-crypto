import { describe, expect, it } from 'vitest';
import { autoEquitySeries, benchP10, dcaReferenceFromCloses, logsToFills } from './autoView';
import type { PaperDayLog, PaperPortfolio } from '../../types';

const pf: PaperPortfolio = { id: 'p1', name: 'A', kind: 'auto', startingUsd: 0, createdAt: '2026-11-01T00:00:00.000Z', costs: { preset: 'exchange', feePct: 0, spreadPct: 0 }, liveSince: '2026-11-02' };
const log = (day: string, depositUsd: number, buyQty = 0, price = 0): PaperDayLog => ({
  id: `p1:${day}`, portfolioId: 'p1', day, decidedOn: day, rules: 'r', depositUsd, skipped: [], by: 'pc',
  fills: buyQty ? [{ coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', side: 'buy', kind: 'market', quantity: buyQty, marketUsd: price, priceUsd: price, feeUsd: 0, at: `${day}T07:00:00.000Z`, reason: 'r', tag: 'dca' }] : [],
});
const closes = new Map([['bitcoin', new Map([['2026-11-02', 100], ['2026-11-03', 110], ['2026-11-04', 120]])]]);

describe('vue d’un autopilote', () => {
  it('courbe jour par jour, apports compris', () => {
    const s = autoEquitySeries(pf, [log('2026-11-02', 25, 0.25, 100), log('2026-11-04', 25, 0.25, 100)], closes, '2026-11-02', '2026-11-04');
    expect(s.map((p) => [p.day, p.valueUsd, p.flowUsd])).toEqual([['2026-11-02', 25, 25], ['2026-11-03', 27.5, 0], ['2026-11-04', 60, 25]]);
  });
  it('référence : les mêmes apports en Bitcoin aux clôtures', () => {
    const r = dcaReferenceFromCloses([{ day: '2026-11-02', usd: 25 }, { day: '2026-11-04', usd: 25 }], closes.get('bitcoin')!, { feePct: 0, spreadPct: 0 });
    expect(r.map((p) => p.valueUsd)).toEqual([25, 27.5, 55]);
  });
  it('exécutions des journaux et 10ᵉ centile du banc d’essai pour une durée', () => {
    expect(logsToFills([log('2026-11-02', 25, 0.25, 100)])).toHaveLength(1);
    expect(benchP10('dca-btc', 95)).toEqual(expect.any(Number));
    expect(benchP10('inconnue', 95)).toBeNull();
    expect(benchP10('dca-btc', 10)).toBeNull();
  });
});
