import { describe, expect, it } from 'vitest';
import { episodeStarts, forwardReturn, planR, studySignals, verdictOf, type KeyMeta, type PeriodStats } from './events';
import { makeAsset, dayOf } from './universe';
import type { Candle } from '../indicators';

const D = 86400;
const T0 = Date.UTC(2021, 0, 1) / 1000;
const c = (i: number, o: number, h: number, l: number, cl: number): Candle => ({ time: T0 + i * D, open: o, high: h, low: l, close: cl, volume: 1000 });

describe('rendement après un signal', () => {
  const flat = Array.from({ length: 40 }, (_, i) => c(i, 100 + i, 101 + i, 99 + i, 100 + i));
  it('entrée à l’ouverture du lendemain, pas à la clôture du signal', () => {
    const r = forwardReturn(flat, 5, 10, { seriesEnded: false })!;
    expect(r.ret).toBeCloseTo((115 / 106 - 1) * 100, 9);
    expect(r.forced).toBe(false);
    expect(r.worst).toBeCloseTo((105 / 106 - 1) * 100, 9); // plus bas du lendemain : 105
  });
  it('série retirée avant la fin de la fenêtre : dernière clôture, sortie forcée', () => {
    const r = forwardReturn(flat.slice(0, 15), 5, 30, { seriesEnded: true })!;
    expect(r.forced).toBe(true);
    expect(r.ret).toBeCloseTo((114 / 106 - 1) * 100, 9);
  });
  it('fenêtre dans le futur d’une série encore cotée : pas d’observation', () => {
    expect(forwardReturn(flat, 30, 30, { seriesEnded: false })).toBeNull();
  });
});

describe('épisodes et plan de trade', () => {
  it('un épisode compte une fois, depuis son premier jour', () => {
    expect(episodeStarts([3, 4, 5, 9, 10])).toEqual([3, 9]);
  });
  it('plan en R : objectif, stop, sortie au 30ᵉ jour', () => {
    const up = [c(0, 100, 100, 100, 100), c(1, 100, 101, 99, 100), c(2, 100, 125, 99, 120)];
    expect(planR(up, 0, 90, 2)).toBeCloseTo(2, 9);
    const down = [c(0, 100, 100, 100, 100), c(1, 100, 101, 99, 100), c(2, 100, 101, 85, 88)];
    expect(planR(down, 0, 90, 2)).toBeCloseTo(-1, 9);
    const drift = Array.from({ length: 32 }, (_, i) => c(i, 100, 101, 99, i === 30 ? 105 : 100));
    expect(planR(drift, 0, 90, 2)).toBeCloseTo((105 - 100) / (100 - 90), 9);
    expect(planR(up, 0, 101, 2)).toBeNull();
  });
});

describe('verdicts', () => {
  const ps = (o: Partial<PeriodStats>): PeriodStats => ({ days: 100, episodes: 40, hitPct: 50, hitLow: 40, hitHigh: 60, medianPct: 0, meanPct: 0, excessMedianPct: 0, worstMedianPct: -10, baselineHitPct: 50, baselineMedianPct: 0, ...o });
  const bull: KeyMeta = { key: 'x', label: 'x', bias: 'bull', horizon: 30, horizons: [30] };
  const v = (all: Partial<PeriodStats>, tuning: Partial<PeriodStats>, control: Partial<PeriodStats>) => verdictOf({ all: ps(all), tuning: ps(tuning), control: ps(control) }, bull);
  it('un signal de moment n’est pas effacé par l’excès du jour', () => {
    expect(v({ hitPct: 60 }, { medianPct: 3, excessMedianPct: -1 }, { hitPct: 58, hitLow: 52, medianPct: 4, excessMedianPct: -1 })).toBe('validé');
  });
  it('validé, prometteur, sans effet, inversé, trop peu de cas', () => {
    expect(v({ hitPct: 60 }, { medianPct: 1 }, { hitPct: 58, hitLow: 52, medianPct: 2 })).toBe('validé');
    expect(v({ hitPct: 54 }, { medianPct: 1 }, { hitPct: 56, hitLow: 47, medianPct: 1 })).toBe('prometteur');
    expect(v({ hitPct: 50 }, {}, { hitPct: 50 })).toBe('sans effet');
    expect(v({ hitPct: 42 }, { medianPct: -1 }, { hitPct: 43, medianPct: -2 })).toBe('inversé');
    expect(v({ episodes: 40 }, {}, { episodes: 11, hitPct: 80, hitLow: 70, excessMedianPct: 5 })).toBe('trop peu de cas');
    expect(v({ episodes: 29 }, {}, { episodes: 20 })).toBe('trop peu de cas');
  });
  it('clé baissière : symétrique', () => {
    const bear: KeyMeta = { ...bull, bias: 'bear' };
    expect(verdictOf({ all: ps({ hitPct: 40 }), tuning: ps({ medianPct: -1 }), control: ps({ hitPct: 42, hitHigh: 48, medianPct: -2 }) }, bear)).toBe('validé');
    expect(verdictOf({ all: ps({ hitPct: 58 }), tuning: ps({ medianPct: 1 }), control: ps({ hitPct: 57, medianPct: 1 }) }, bear)).toBe('inversé');
  });
  it('plan : verdict sur l’espérance en R', () => {
    const plan: KeyMeta = { key: 'plan:Achat@2', label: 'p', bias: 'bull', horizon: 30, horizons: [30] };
    expect(verdictOf({ all: ps({ expectancyR: 0.2 }), tuning: ps({ expectancyR: 0.1 }), control: ps({ expectancyR: 0.2 }) }, plan)).toBe('validé');
    expect(verdictOf({ all: ps({ expectancyR: -0.2 }), tuning: ps({ expectancyR: -0.1 }), control: ps({ expectancyR: -0.2 }) }, plan)).toBe('inversé');
    expect(verdictOf({ all: ps({ expectancyR: 0.05 }), tuning: ps({ expectancyR: 0.1 }), control: ps({ expectancyR: 0.1 }) }, plan)).toBe('sans effet');
  });
});

describe('étude complète', () => {
  it('pas assez d’historique : aucune observation', () => {
    const a = makeAsset('NEW', Array.from({ length: 150 }, (_, i) => c(i, 10, 10, 10, 10)));
    expect(studySignals({ assets: [a], btc: a, temperature: new Map(), top: 10 }).observations).toBe(0);
  });

  it('une clé qui précède toujours une hausse est validée', () => {
    // Six actifs déphasés : chaque bloc de 40 jours monte de 15 % pendant 30 jours puis redescend.
    const assets = Array.from({ length: 6 }, (_, k) => makeAsset(`A${k}`, Array.from({ length: 1100 }, (_, i) => {
      const ph = (i + 7 * k) % 40;
      const p = 100 * (ph < 30 ? 1 + 0.15 * (ph / 30) : 1.15 - 0.15 * ((ph - 30) / 10));
      return c(i, p, p * 1.001, p * 0.999, p);
    })));
    const meta: KeyMeta = { key: 'test:up', label: 'Test', bias: 'bull', horizon: 30, horizons: [30] };
    const r = studySignals({
      assets, btc: assets[0], temperature: new Map(), top: 10, metas: [meta],
      extractors: [(o) => ((o.i + 7 * Number(o.asset.id.slice(1)) + 1) % 40 === 0 ? ['test:up'] : [])],
    });
    expect(r.observations).toBeGreaterThan(0);
    const k = r.keys.find((x) => x.meta.key === 'test:up')!;
    expect(k.byHorizon[30].control.episodes).toBeGreaterThanOrEqual(12);
    expect(k.verdict).toBe('validé');
    expect(r.dataThrough).toBe(dayOf(T0 + 1099 * D));
  });
});
