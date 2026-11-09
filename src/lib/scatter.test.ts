import { describe, expect, it } from 'vitest';
import { scatterReport } from './scatter';
import type { Bucket } from '../types';

const h = (symbol: string, value: number, bucket: Bucket, coinId = symbol.toLowerCase()) => ({ key: `k:${symbol}:${value}`, coinId, symbol, value, bucket });
const rules = { maxLines: 12, minLinePct: 1, maxDiscoveryLines: 5 };

describe('éparpillement du portefeuille', () => {
  it('compte une crypto détenue à deux endroits une seule fois et ignore les stablecoins', () => {
    const r = scatterReport([h('BTC', 4000, 'btc'), h('BTC', 1000, 'btc'), h('ETH', 980, 'eth'), h('USDC', 300, 'stable')], rules);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0].value).toBe(5000);
    expect(r.total).toBe(5980);
  });

  it('repère les lignes sous le poids minimal et leur poids cumulé', () => {
    const r = scatterReport([h('BTC', 4900, 'btc'), h('PROVE', 7, 'small'), h('UNI', 6, 'mid'), h('ETH', 987, 'eth')], rules);
    expect(r.tiny.map((l) => l.symbol).sort()).toEqual(['PROVE', 'UNI']);
    expect(r.tinyValue).toBe(13);
    expect(r.tinyPct).toBeCloseTo((13 / 5900) * 100, 6);
    expect(r.tooMany).toBe(false);
  });

  it('signale trop de lignes et trop de lignes « découverte »', () => {
    const many = Array.from({ length: 14 }, (_, i) => h(`T${i}`, 100, i < 7 ? 'mid' : 'small'));
    const r = scatterReport(many, rules);
    expect(r.tooMany).toBe(true);
    expect(r.discoveryLines).toBe(14);
    expect(r.tooManyDiscovery).toBe(true);
  });

  it('un portefeuille vide ne déclenche rien', () => {
    const r = scatterReport([], rules);
    expect(r.total).toBe(0);
    expect(r.tooMany).toBe(false);
    expect(r.tiny).toHaveLength(0);
  });
});
