import { describe, expect, it } from 'vitest';
import { interpretDerivs, FUNDING_EXTREME_APR, LS_LONG, MEMPOOL_FEE_HOT } from './derivs';

const base = { oiBtc: null, fundingLast: null, fundingAvg8h: null, fundingAprPct: null, longShortRatio: null, longPct: null, mempoolTx: null, mempoolVsizeMb: null, fastestFeeSatVb: null, oiUsd: null };

describe('interpretDerivs', () => {
  it('rien à signaler avec des données neutres', () => {
    expect(interpretDerivs({ ...base, fundingAprPct: 5, longShortRatio: 1.2, fastestFeeSatVb: 3, mempoolVsizeMb: 20, oiUsd: 30e9 })).toEqual([]);
  });

  it('funding extrême haut = avertissement de liquidations', () => {
    const n = interpretDerivs({ ...base, fundingAprPct: FUNDING_EXTREME_APR + 5 });
    expect(n.find((x) => x.key === 'funding-high')!.tone).toBe('warn');
    expect(n.find((x) => x.key === 'funding-low')).toBeUndefined();
  });

  it('funding négatif marqué = squeeze possible', () => {
    const n = interpretDerivs({ ...base, fundingAprPct: -FUNDING_EXTREME_APR - 1 });
    expect(n.find((x) => x.key === 'funding-low')!.tone).toBe('up');
  });

  it('ratio long/short très long = warn, très short = up', () => {
    expect(interpretDerivs({ ...base, longShortRatio: LS_LONG + 0.5 }).find((x) => x.key === 'ls-long')).toBeDefined();
    expect(interpretDerivs({ ...base, longShortRatio: 0.5 }).find((x) => x.key === 'ls-short')).toBeDefined();
  });

  it('mempool chaud si frais hauts OU très gros volume en attente', () => {
    expect(interpretDerivs({ ...base, fastestFeeSatVb: MEMPOOL_FEE_HOT + 10 }).find((x) => x.key === 'mempool-hot')).toBeDefined();
    expect(interpretDerivs({ ...base, fastestFeeSatVb: 2, mempoolVsizeMb: 150 }).find((x) => x.key === 'mempool-hot')).toBeDefined();
  });

  it('OI élevé = note neutre indicatives', () => {
    const n = interpretDerivs({ ...base, oiUsd: 80e9 });
    expect(n.find((x) => x.key === 'oi-high')!.tone).toBe('neutral');
  });
});
