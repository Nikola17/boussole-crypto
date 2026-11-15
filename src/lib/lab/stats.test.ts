import { describe, expect, it } from 'vitest';
import { bootstrapMeans, hashSeed, median, mulberry32, quantile, wilson, xirr } from './stats';

describe('statistiques de base', () => {
  it('médiane et quantile', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
    expect(quantile([0, 10], 0.1)).toBeCloseTo(1, 9);
    expect(quantile([5, 1, 3], 0.5)).toBe(3);
  });

  it('intervalle de Wilson à 90 %', () => {
    expect(wilson(50, 100).low).toBeCloseTo(0.4188, 3);
    expect(wilson(50, 100).high).toBeCloseTo(0.5812, 3);
    expect(wilson(0, 10).low).toBeCloseTo(0, 6);
    expect(wilson(0, 10).high).toBeCloseTo(0.213, 3);
    expect(wilson(9, 10).low).toBeCloseTo(0.6522, 3);
    expect(wilson(0, 0)).toEqual({ low: 0, high: 1 });
  });

  it('générateur à graine : reproductible, entre 0 et 1', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
    expect(hashSeed('abc')).toBeGreaterThanOrEqual(0);
  });

  it('bootstrap reproductible', () => {
    const xs = [1, -1, 2, 0.5, -0.3];
    const r = bootstrapMeans(xs, 200, 42);
    expect(r).toHaveLength(200);
    expect(r).toEqual(bootstrapMeans(xs, 200, 42));
    expect(r).not.toEqual(bootstrapMeans(xs, 200, 43));
    expect([...r].sort((x, y) => x - y)).toEqual(r);
  });

  it('XIRR : 100 investis, 110 un an après = 10 %', () => {
    const t0 = Date.UTC(2024, 0, 1);
    expect(xirr([{ t: t0, amount: -100 }, { t: t0 + 365 * 86400_000, amount: 110 }])).toBeCloseTo(0.1, 4);
    expect(xirr([{ t: t0, amount: 100 }])).toBeNull();
  });
});
