import { describe, expect, it } from 'vitest';
import { computeAssetMetrics } from './features';
import type { Candle } from '../indicators';

const D = 86400;
const T0 = Date.UTC(2025, 0, 1) / 1000;
const mk = (fn: (i: number) => number, n = 120): Candle[] => Array.from({ length: n }, (_, i) => {
  const c = fn(i);
  return { time: T0 + i * D, open: c * 0.995, high: c * 1.02, low: c * 0.98, close: c, volume: 5_000_000 };
});

describe('feature store (AssetMetrics)', () => {
  it('calcule force relative, sharpeMom, corrélation BTC et volatilité', () => {
    const btc = mk((i) => 100 + i * 0.3 + Math.sin(i / 2) * 2);
    const leader = mk((i) => 100 + i * 1.2 + Math.sin(i / 2) * 4);
    const m = computeAssetMetrics(leader, btc, -0.0002)!;
    expect(m).not.toBeNull();
    expect(m.rs30d!).toBeGreaterThan(0);
    expect(m.rs90d!).toBeGreaterThan(0);
    expect(m.sharpeMom!).toBeGreaterThan(0);
    expect(m.corrBtc30d!).toBeGreaterThan(0.8);
    expect(m.vol30dAnn!).toBeGreaterThan(0);
    expect(m.atr14!).toBeGreaterThan(0);
    expect(m.adx14!).toBeGreaterThan(0);
    expect(m.fundingRate8h).toBe(-0.0002);
    expect(m.volumeUsd30dMed).toBe(5_000_000);
  });

  it('renvoie null si historique trop court', () => {
    expect(computeAssetMetrics(mk(() => 100, 15), mk(() => 100, 15))).toBeNull();
  });
});
