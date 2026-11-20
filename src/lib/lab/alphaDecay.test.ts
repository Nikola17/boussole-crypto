import { describe, expect, it } from 'vitest';
import { detectAlphaDecay } from './alphaDecay';
import type { Fill } from './types';

function makeTrades(pnls: number[]): Fill[] {
  const fills: Fill[] = [];
  pnls.forEach((p, i) => {
    const day = `2026-01-${String((i % 28) + 1).padStart(2, '0')}`;
    fills.push({ coinId: 'btc', symbol: 'btc', name: 'BTC', side: 'buy', kind: 'market', quantity: 1, marketUsd: 100, priceUsd: 100, feeUsd: 0, at: `${day}T08:00:00Z`, reason: 'in', stop: 95 });
    fills.push({ coinId: 'btc', symbol: 'btc', name: 'BTC', side: 'sell', kind: 'market', quantity: 1, marketUsd: 100 + p, priceUsd: 100 + p, feeUsd: 0, at: `${day}T18:00:00Z`, reason: 'out' });
  });
  return fills;
}

describe('détection Alpha Decay', () => {
  it('signale insuffisant sous 8 trades, sain quand positif, dégradé quand l’edge s’effondre', () => {
    expect(detectAlphaDecay(makeTrades([5, 5, -2])).status).toBe('insuffisant');
    expect(detectAlphaDecay(makeTrades([10, -3, 12, -4, 8, 9, -3, 11, 7, -4]), 0.3).status).toBe('sain');
    const bad = detectAlphaDecay(makeTrades([-5, -4, -3, 2, -5, -4, -6, 1, -5, -4]), 0.3);
    expect(bad.status).toBe('degrade');
    expect(bad.recentExpectancyR!).toBeLessThan(0);
  });
});
