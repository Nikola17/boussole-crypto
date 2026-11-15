import { describe, expect, it } from 'vitest';
import { annualize, closedTrades, maxDrawdownPct, referenceDcaBtc, referenceHoldBtc, rollingWindows, tradeStatsOf, twr, type DayPoint } from './metrics';
import { COSTS, type Fill } from './types';
import type { Candle } from '../indicators';

const pt = (day: string, valueUsd: number, flowUsd = 0): DayPoint => ({ day, valueUsd, cashUsd: 0, flowUsd });
const f = (side: 'buy' | 'sell', quantity: number, priceUsd: number, at: string, over: Partial<Fill> = {}): Fill => ({ coinId: 'x', symbol: 'x', name: 'X', side, kind: 'market', quantity, marketUsd: priceUsd, priceUsd, feeUsd: 0, at, reason: '', ...over });

describe('mesures de performance', () => {
  it('TWR insensible à un apport', () => {
    expect(twr([pt('d1', 100), pt('d2', 200, 100)])).toBeCloseTo(0, 12);
    expect(twr([pt('d1', 100), pt('d2', 110), pt('d3', 99)])).toBeCloseTo(-0.01, 12);
    expect(annualize(0.21, 730)).toBeCloseTo(0.1, 9);
  });
  it('baisse maximale sur l’indice', () => {
    expect(maxDrawdownPct([pt('a', 100), pt('b', 120), pt('c', 90), pt('d', 130)])).toBeCloseTo(-25, 9);
    expect(maxDrawdownPct([pt('a', 100), pt('b', 200, 100), pt('c', 150)])).toBeCloseTo(-25, 9);
  });
  it('trades clos : premier entré, premier sorti', () => {
    const trades = closedTrades([
      f('buy', 1, 100, '2024-01-01', { stop: 90, feeUsd: 1 }),
      f('buy', 1, 200, '2024-01-02'),
      f('sell', 1.5, 300, '2024-01-03', { feeUsd: 3 }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].costUsd).toBeCloseTo(101 + 100, 9);
    expect(trades[0].proceedsUsd).toBeCloseTo(450 - 3, 9);
    expect(trades[0].openedAt).toBe('2024-01-01');
    expect(trades[0].r).toBeNull(); // la seconde ligne n'a pas de stop : pas de R
    const one = closedTrades([f('buy', 2, 100, 'a', { stop: 90 }), f('sell', 2, 110, 'b')]);
    expect(one[0].r).toBeCloseTo(1, 9);
    const st = tradeStatsOf([...one, ...closedTrades([f('buy', 1, 100, 'a', { stop: 90 }), f('sell', 1, 95, 'b')])]);
    expect(st.n).toBe(2);
    expect(st.winRatePct).toBe(50);
    expect(st.expectancyR).toBeCloseTo((1 - 0.5) / 2, 9);
    expect(st.maxLosingStreak).toBe(1);
  });
  it('fenêtres glissantes', () => {
    const s = [100, 110, 121, 133.1, 146.41].map((v, i) => pt(`d${i}`, v));
    const w = rollingWindows(s, 2)!;
    expect(w.p50).toBeCloseTo(21, 6);
    expect(rollingWindows(s, 10)).toBeNull();
  });
  it('références Bitcoin', () => {
    const btc: Candle[] = [100, 110, 121].map((p, i) => ({ time: Date.UTC(2024, 0, 1 + i) / 1000, open: p, high: p, low: p, close: p, volume: 1 }));
    const hold = referenceHoldBtc(100, '2024-01-01', '2024-01-03', btc, { feePct: 0, spreadPct: 0 });
    expect(hold.map((p) => p.valueUsd)).toEqual([100, 110, 121]);
    const dca = referenceDcaBtc([{ day: '2024-01-01', usd: 10 }, { day: '2024-01-02', usd: 11 }], btc, COSTS.exchange);
    expect(dca).toHaveLength(3);
    expect(dca[1].flowUsd).toBe(11);
    expect(dca[2].valueUsd).toBeLessThan(10 * 1.21 + 11 * 1.1);
  });
});
