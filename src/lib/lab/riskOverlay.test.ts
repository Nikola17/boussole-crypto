import { describe, expect, it } from 'vitest';
import { applyRiskOverlay, drawdownScale } from './riskOverlay';
import type { Intent, StrategyContext } from './types';

function mkCtx(over: { equity?: number; peak?: number; positions?: StrategyContext['portfolio']['positions']; corr?: Record<string, number> } = {}): StrategyContext {
  return {
    decidedOn: '2026-01-01', execDay: '2026-01-02', scheduled: () => true, universe: [],
    candles: () => [{ time: 1, open: 100, high: 101, low: 99, close: 100, volume: 1000 }],
    temperature: 50, btcAboveSma200: true,
    metrics: (id) => ({
      rs7d: 0, rs30d: 0, rs90d: 0, vol30dAnn: 50, sharpeMom: 0.5, corrBtc30d: over.corr?.[id] ?? 0.5,
      atr14: 4, atrPct: 4, adx14: 25, fundingRate8h: null, volumeUsd30dMed: 1e7,
    }),
    portfolio: {
      cashUsd: 1000, equityUsd: over.equity ?? 1000, peakEquityUsd: over.peak ?? 1000,
      minSincePeakUsd: over.equity ?? 1000, positions: over.positions ?? [], lastFillOn: () => null,
    },
  };
}

const buy = (coinId: string, riskUsd = 20): Intent => ({
  coinId, symbol: coinId, name: coinId, side: 'buy', sizing: { riskUsd, maxUsd: 400 }, stop: 90, reason: 'test',
});

describe('riskOverlay', () => {
  it('drawdownScale réduit à ×0,5 sous −8 % et ×0,25 sous −15 %', () => {
    expect(drawdownScale(1000, 1000)).toBe(1);
    expect(drawdownScale(910, 1000)).toBe(0.5);
    expect(drawdownScale(840, 1000)).toBe(0.25);
  });

  it('laisse toujours passer les ventes, réduit/bloque les achats quand le Heat Cap est atteint', () => {
    const ctx = mkCtx({
      equity: 1000,
      positions: [
        { coinId: 'a', symbol: 'a', name: 'A', quantity: 4, costUsd: 400, openedOn: '2026-01-01', stop: 90 }, // risque 40 $ = 4 %
      ],
    });
    const sell: Intent = { coinId: 'a', symbol: 'a', name: 'A', side: 'sell', fraction: 1, reason: 'sortie' };
    const r = applyRiskOverlay([sell, buy('b', 20), buy('c', 20)], ctx, { maxHeatPct: 5 });
    expect(r.intents[0].side).toBe('sell');
    // Il ne reste que 1 % (= 10 $) de budget risque : b est réduit de 20 à 10, c est écarté
    expect((r.intents[1].sizing as { riskUsd: number }).riskUsd).toBeCloseTo(10, 4);
    expect(r.intents).toHaveLength(2);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].why).toContain('risque portefeuille saturé');
  });

  it('applique le plafond de corrélation (> 0,85 BTC)', () => {
    const ctx = mkCtx({
      positions: [
        { coinId: 'p1', symbol: 'p1', name: 'P1', quantity: 1, costUsd: 100, openedOn: '2026-01-01', stop: 95 },
        { coinId: 'p2', symbol: 'p2', name: 'P2', quantity: 1, costUsd: 100, openedOn: '2026-01-01', stop: 95 },
      ],
      corr: { p1: 0.92, p2: 0.9, c3: 0.91, c4: 0.93 },
    });
    const r = applyRiskOverlay([buy('c3', 10), buy('c4', 10)], ctx, { maxHeatPct: 10, maxHighCorrPositions: 2 });
    expect((r.intents[0].sizing as { riskUsd: number }).riskUsd).toBeCloseTo(5, 4); // 3ᵉ position réduite de moitié
    expect(r.intents).toHaveLength(1); // 4ᵉ bloquée
    expect(r.skipped[0].why).toContain('corrélation');
  });
});
