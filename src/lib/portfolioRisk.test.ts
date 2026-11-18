import { describe, expect, it } from 'vitest';
import { pearson, riskMetrics } from './portfolioRisk';

describe('pearson', () => {
  it('vaut 1 pour deux séries identiques, -1 pour l’inverse', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7];
    expect(pearson(xs, xs)).toBeCloseTo(1);
    expect(pearson(xs, [...xs].reverse())).toBeCloseTo(-1);
  });

  it('vaut null avec moins de 5 points', () => {
    expect(pearson([1, 2, 3], [1, 2, 3])).toBeNull();
  });
});

describe('riskMetrics', () => {
  const alloc = { btc: 650, eth: 200, large: 60, mid: 40, small: 50, stable: 0 };
  const lines = [
    { symbol: 'BTC', bucket: 'btc' as const, value: 650, series: [1, 2, 3, 4, 5, 6, 7], source: 'Ledger' },
    { symbol: 'ETH', bucket: 'eth' as const, value: 200, series: [1, 2, 3, 4, 5, 6, 8], source: 'Crypto.com' },
    { symbol: 'SOL', bucket: 'large' as const, value: 60, series: [2, 3, 3, 5, 6, 7, 9], source: 'Crypto.com' },
    { symbol: 'PEPE', bucket: 'small' as const, value: 50, series: [1, 5, 2, 8, 3, 9, 4], source: 'Phantom' },
    { symbol: 'USDC', bucket: 'stable' as const, value: 40, source: 'Binance' },
  ];

  it('calcule concentration, top1/top3, corrélation moyenne et répartition par source', () => {
    const total = 1000;
    const m = riskMetrics({ total, alloc: { ...alloc, stable: 40 }, lines, btcSeries: [1, 2, 3, 4, 5, 6, 7] });
    expect(m.hhi).toBeGreaterThan(0);
    expect(m.top1Pct).toBeCloseTo((650 / total) * 100, 1);
    expect(m.top3Pct).toBeCloseTo(((650 + 200 + 60) / total) * 100, 1);
    expect(m.btcCorr).not.toBeNull();
    expect(m.btcCorr!).toBeGreaterThan(-1);
    expect(m.btcCorr!).toBeLessThanOrEqual(1);
    // La stable est exclue de la corrélation : 3 lignes corrélées.
    const bySrc = Object.fromEntries(m.bySource.map((s) => [s.label, s.pct]));
    expect(bySrc['Crypto.com']).toBeCloseTo(((200 + 60) / total) * 100, 1);
    expect(m.bySource.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 1);
  });

  it('produit des scénarios de krach cohérents (le −50 % baisse plus que le −30 %)', () => {
    const m = riskMetrics({ total: 1000, alloc, lines: [], btcSeries: undefined });
    expect(m.btcCorr).toBeNull();
    expect(m.scenarios).toHaveLength(2);
    expect(m.scenarios[1].changePct).toBeLessThan(m.scenarios[0].changePct);
    expect(m.scenarios[1].changePct).toBeLessThan(-50); // les alts amplifient
    expect(m.scenarios[1].value).toBeCloseTo(1000 * (1 + m.scenarios[1].changePct / 100), 5);
  });
});
