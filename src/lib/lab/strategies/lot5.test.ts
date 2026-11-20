import { describe, expect, it } from 'vitest';
import { STRATEGIES, rulesFingerprint } from './index';
import { metaAllocator } from './metaAllocator';
import { smartShadow } from './smartShadow';
import { catalystEvent } from './catalystEvent';
import { computeAssetMetrics } from '../features';
import type { Candle } from '../../indicators';
import type { RegimeSnapshot } from '../regime';
import type { Position, StrategyContext, UniverseEntry } from '../types';

const D = 86400;
const T0 = Date.UTC(2024, 0, 1) / 1000;
const mk = (fn: (i: number) => number, n = 220): Candle[] => Array.from({ length: n }, (_, i) => {
  const c = fn(i);
  return { time: T0 + i * D, open: c * 0.995, high: c * 1.015, low: c * 0.985, close: c, volume: 10_000_000, takerBuyQuote: 6_500_000 };
});

const reg = (regime: RegimeSnapshot['regime']): RegimeSnapshot => ({
  day: '2025-03-03', regime, confidence: 0.85, btcTrendScore: regime === 'BEAR_TREND' ? -80 : 75,
  adx14: 26, volAnnualizedPct: 45, temperature: regime === 'EXTREME_STRESS' ? 90 : 30, daysInRegime: 6,
});

function ctxOf(series: Record<string, Candle[]>, regime: RegimeSnapshot['regime'], positions: Position[] = []): StrategyContext {
  const btc = series.bitcoin ?? mk((i) => 100 + i * 0.2);
  const uni: UniverseEntry[] = Object.keys(series).map((id, i) => ({ coinId: id, symbol: id.slice(0, 4), name: id, rank: i + 1, available: true }));
  return {
    decidedOn: '2025-03-02', execDay: '2025-03-03', scheduled: () => true, universe: uni,
    candles: (id) => series[id] ?? [], temperature: regime === 'EXTREME_STRESS' ? 90 : 25, btcAboveSma200: regime !== 'BEAR_TREND',
    regime: reg(regime),
    metrics: (id) => computeAssetMetrics(series[id] ?? [], btc, -0.0002),
    portfolio: { cashUsd: 1000, equityUsd: 1000, peakEquityUsd: 1000, minSincePeakUsd: 1000, positions, lastFillOn: () => null },
  };
}

describe('stratégies Lot 5 (Meta-Allocator, Smart Shadow, Catalyst)', () => {
  it('le registre contient 14 stratégies distinctes aux empreintes uniques', () => {
    expect(Object.keys(STRATEGIES)).toHaveLength(14);
    expect(new Set(Object.values(STRATEGIES).map((s) => rulesFingerprint(s))).size).toBe(14);
  });

  it('meta-allocator : allège 50 % en EXTREME_STRESS et passe en USDC en BEAR_TREND', () => {
    const pos: Position[] = [{ coinId: 'solana', symbol: 'sol', name: 'Solana', quantity: 5, costUsd: 500, openedOn: '2025-02-01' }];
    const s = { bitcoin: mk((i) => 100 + i * 0.2), solana: mk((i) => 100 + i * 0.6) };
    const stress = metaAllocator.decide(ctxOf(s, 'EXTREME_STRESS', pos), metaAllocator.defaults);
    expect(stress).toEqual([expect.objectContaining({ coinId: 'solana', side: 'sell', fraction: 0.5, tag: 'meta:stress-trim' })]);
    const bear = metaAllocator.decide(ctxOf(s, 'BEAR_TREND', pos), metaAllocator.defaults);
    expect(bear).toEqual([expect.objectContaining({ coinId: 'solana', side: 'sell', fraction: 1, tag: 'meta:bear-cash' })]);
  });

  it('smart-money-shadow : détecte un pic de volume acheteur (hors FOMO) avec plafond 5 %', () => {
    const sol = mk((i) => 100 + i * 0.1, 60);
    sol[sol.length - 1] = { ...sol[sol.length - 1], open: 105, close: 108, high: 109, low: 104.5, volume: 35_000_000, takerBuyQuote: 25_000_000 };
    const orders = smartShadow.decide(ctxOf({ bitcoin: mk(() => 100, 60), solana: sol }, 'BULL_TREND'), smartShadow.defaults);
    const buy = orders.find((o) => o.coinId === 'solana' && o.side === 'buy');
    expect(buy).toBeDefined();
    expect((buy!.sizing as { usd: number }).usd).toBeCloseTo(50, 4); // 5 % de 1000 $
  });

  it('catalyst-event : entre sur probabilité calibrée élevée + RS 7j > +5 % vs BTC', () => {
    const btc = mk(() => 100, 220);
    const alt = mk((i) => 100 + Math.sin(i / 4) * 2, 220);
    // Base saine proche MM200 puis accélération récente (+10 % sur 7 j) avec fort volume acheteur
    for (let k = 7; k >= 1; k--) {
      const idx = alt.length - k;
      const mult = 1 + (8 - k) * 0.015;
      alt[idx] = { ...alt[idx], open: 100 * mult * 0.99, close: 100 * mult, high: 100 * mult * 1.01, low: 100 * mult * 0.98, volume: 35_000_000 };
    }
    const orders = catalystEvent.decide(ctxOf({ bitcoin: btc, chainlink: alt }, 'BULL_TREND'), catalystEvent.defaults);
    expect(orders.some((o) => o.coinId === 'chainlink' && o.side === 'buy' && o.tag === 'catalyst')).toBe(true);
  });
});
