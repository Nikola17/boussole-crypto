import { describe, expect, it } from 'vitest';
import { dustPlan, type DustInput } from './consolidate';

const h = (symbol: string, valueUsd: number, over: Partial<DustInput> = {}): DustInput => ({
  key: `k${symbol}`, coinId: symbol.toLowerCase(), symbol, name: symbol, quantity: 1, valueUsd, priceUsd: valueUsd, bucket: 'small', source: 'ledger', ...over,
});
const opts = { minLinePct: 1, thesisIds: new Set<string>(), coreIds: new Set(['btc', 'eth']), discoveryIds: new Set(['sui']) };

describe('poussières à regrouper', () => {
  const base = [h('BTC', 3900, { bucket: 'btc' }), h('ETH', 980, { bucket: 'eth' }), h('SUI', 30), h('PROVE', 7), h('UNI', 6), h('ONDO', 13), h('USDC', 100, { bucket: 'stable' })];

  it('sépare les lignes à regrouper de celles que le panier renforce', () => {
    const p = dustPlan(base, opts);
    expect(p.merge.map((l) => l.symbol)).toEqual(['ONDO', 'PROVE', 'UNI']);
    expect(p.reinforce.map((l) => l.symbol)).toEqual(['SUI']);
    expect(p.mergeValueUsd).toBe(26);
  });

  it('ignore le cœur, les stablecoins, les lignes avec thèse et celles assez lourdes', () => {
    const p = dustPlan(base, { ...opts, thesisIds: new Set(['prove']), minLinePct: 0.2 });
    expect(p.merge.map((l) => l.symbol)).toEqual(['UNI']);
    expect(p.merge.some((l) => ['BTC', 'ETH', 'USDC'].includes(l.symbol))).toBe(false);
  });

  it('ne propose pas de regrouper un solde de wallet lié', () => {
    const p = dustPlan([...base, h('TAO', 5, { source: 'wallet' })], opts);
    expect(p.merge.some((l) => l.symbol === 'TAO')).toBe(false);
  });

  it('une crypto détenue à deux endroits est jugée sur son total', () => {
    const p = dustPlan([h('BTC', 5000, { bucket: 'btc' }), h('LINK', 30), h('LINK', 40, { key: 'other', source: 'wallet' })], { ...opts, minLinePct: 1 });
    expect(p.merge.some((l) => l.symbol === 'LINK')).toBe(false); // 70 $ sur 5 070 $ = 1,4 %
  });
});
