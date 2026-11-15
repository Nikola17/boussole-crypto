import { describe, expect, it } from 'vitest';
import { computeCycle } from '../cycle';
import { temperatureAt, temperatureSeries } from './replayTemp';
import { dayOf } from './universe';
import type { Candle } from '../indicators';

const T0 = Date.UTC(2020, 0, 1) / 1000;
const btc: Candle[] = Array.from({ length: 400 }, (_, i) => {
  const close = 100 + i * 0.5 + Math.sin(i / 5) * 4;
  return { time: T0 + i * 86400, open: close, high: close * 1.01, low: close * 0.99, close, volume: 1 };
});
const day = (i: number) => dayOf(btc[i].time);

describe('température rejouable', () => {
  it('égale computeCycle aux mêmes entrées, avec le MVRV de J−7', () => {
    const fng = new Map([[day(300), 30]]);
    const mvrv = new Map([[day(293), 2.2], [day(300), 0.5]]);
    const direct = computeCycle({ btcDaily: btc.slice(0, 301), fng: 30, mvrv: 2.2 })!.temperature;
    expect(temperatureAt(day(300), btc, fng, mvrv)).toBeCloseTo(direct, 9);
  });
  it('null avant 200 bougies, et série complète cohérente', () => {
    expect(temperatureAt(day(150), btc, new Map(), new Map())).toBeNull();
    const s = temperatureSeries(btc, new Map(), new Map());
    expect(s.has(day(150))).toBe(false);
    expect(s.get(day(399))).toBeCloseTo(temperatureAt(day(399), btc, new Map(), new Map())!, 9);
  });
});
