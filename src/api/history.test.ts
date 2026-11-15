import { describe, expect, it } from 'vitest';
import { appendHistory } from './history';

const c = (t: number, close: number) => ({ time: t, open: close, high: close, low: close, close, volume: 1 });

describe('historique en cache', () => {
  it('fusionne par date, sans doublon, dans l’ordre, la version récente l’emporte', () => {
    const merged = appendHistory([c(1, 10), c(2, 20), c(3, 30)], [c(3, 31), c(4, 40), c(2, 20)]);
    expect(merged.map((x) => x.time)).toEqual([1, 2, 3, 4]);
    expect(merged[2].close).toBe(31);
    expect(appendHistory([], [c(5, 1), c(4, 1)]).map((x) => x.time)).toEqual([4, 5]);
  });
});
