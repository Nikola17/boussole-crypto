import { describe, expect, it } from 'vitest';
import { brierScore, brierSkillScore, predictProbUp14d, trainLogisticL2 } from './scoring';
import { computeAssetMetrics } from './features';
import type { Candle } from '../indicators';

const D = 86400;
const T0 = Date.UTC(2024, 0, 1) / 1000;
const mk = (fn: (i: number) => number, n = 220): Candle[] => Array.from({ length: n }, (_, i) => {
  const c = fn(i);
  return { time: T0 + i * D, open: c * 0.995, high: c * 1.015, low: c * 0.985, close: c, volume: 10_000_000 };
});

describe('scoring probabiliste calibré', () => {
  it('produit une probabilité bornée [0, 1], plus élevée en peur + cassure volume qu’en euphorie', () => {
    const btc = mk((i) => 100 + i * 0.2);
    const fear = mk((i) => 100 + i * 0.15);
    fear[fear.length - 1] = { ...fear[fear.length - 1], volume: 35_000_000 };
    const pFear = predictProbUp14d(fear, computeAssetMetrics(fear, btc, -0.0003), 18)!;
    const pHot = predictProbUp14d(fear, computeAssetMetrics(fear, btc, 0.0005), 88)!;
    expect(pFear.probUp14d).toBeGreaterThan(0);
    expect(pFear.probUp14d).toBeLessThan(1);
    expect(pFear.probUp14d).toBeGreaterThan(pHot.probUp14d);
  });

  it('trainLogisticL2 apprend une frontière linéaire séparable avec Brier Skill Score positif', () => {
    const xs = [[-2, 0], [-1.5, 0], [-1, 0], [-0.5, 0], [0.5, 0], [1, 0], [1.5, 0], [2, 0]];
    const ys = [0, 0, 0, 0, 1, 1, 1, 1];
    const m = trainLogisticL2(xs, ys, { epochs: 150 });
    expect(m.weights[0]).toBeGreaterThan(0.5);
    expect(m.oosBrierSkill).toBeGreaterThan(0.5);
    expect(brierScore([0.9, 0.1], [1, 0])).toBeCloseTo(0.01, 6);
    expect(brierSkillScore([0.5, 0.5], [1, 0])).toBeCloseTo(0, 6);
  });
});
