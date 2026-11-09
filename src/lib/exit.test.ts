import { describe, expect, it } from 'vitest';
import { DEFAULT_LADDER, euphoriaStep, exitLadder, pendingRungs } from './exit';

describe('plan de sortie par paliers', () => {
  const base = { avgCostUsd: 1, quantity: 100, steps: DEFAULT_LADDER, doneMultiples: [] as number[] };

  it('calcule la cible, l\'avancement et la quantité de chaque palier', () => {
    const r = exitLadder({ ...base, priceUsd: 1.5 });
    expect(r.map((x) => x.multiple)).toEqual([2, 3, 5]);
    expect(r[0].targetPrice).toBe(2);
    expect(r[0].progressPct).toBeCloseTo(75);
    expect(r[0].reached).toBe(false);
    expect(r[0].qty).toBe(25);
    expect(r[0].valueUsd).toBeCloseTo(37.5);
    expect(pendingRungs(r)).toHaveLength(0);
  });

  it('un palier atteint et non vendu est signalé', () => {
    const r = exitLadder({ ...base, priceUsd: 2.4 });
    expect(pendingRungs(r).map((x) => x.multiple)).toEqual([2]);
    expect(r[1].reached).toBe(false);
  });

  it('une fois un palier vendu, la position de départ est reconstituée pour les suivants', () => {
    // 25 % déjà vendus : il reste 75 unités = 75 % du départ → le palier ×3 vend toujours 25 unités.
    const r = exitLadder({ ...base, quantity: 75, priceUsd: 3.2, doneMultiples: [2] });
    expect(r[0].done).toBe(true);
    expect(r[0].qty).toBe(0);
    expect(r[1].reached).toBe(true);
    expect(r[1].qty).toBeCloseTo(25);
    expect(pendingRungs(r).map((x) => x.multiple)).toEqual([3]);
  });

  it('les quantités ne dépassent jamais ce qu\'il reste', () => {
    const r = exitLadder({ ...base, quantity: 10, steps: [{ multiple: 2, pct: 90 }, { multiple: 3, pct: 90 }], doneMultiples: [], priceUsd: 5 });
    for (const x of r) expect(x.qty).toBeLessThanOrEqual(10);
  });

  it('sans prix de revient, prix ou quantité : aucun palier', () => {
    expect(exitLadder({ ...base, avgCostUsd: 0, priceUsd: 2 })).toEqual([]);
    expect(exitLadder({ ...base, priceUsd: 0 })).toEqual([]);
    expect(exitLadder({ ...base, quantity: 0, priceUsd: 2 })).toEqual([]);
  });

  it('utilise des paliers personnalisés, triés', () => {
    const r = exitLadder({ ...base, priceUsd: 4, steps: [{ multiple: 4, pct: 50 }, { multiple: 1.5, pct: 10 }] });
    expect(r.map((x) => x.multiple)).toEqual([1.5, 4]);
    expect(r.every((x) => x.reached)).toBe(true);
  });
});

describe('Bitcoin et Ethereum : seulement en euphorie', () => {
  it('rien à vendre sous 80, 5 % dès 80, 10 % dès 90', () => {
    expect(euphoriaStep(31).active).toBe(false);
    expect(euphoriaStep(31).label).toContain('Rien à vendre');
    expect(euphoriaStep(79.9).active).toBe(false);
    expect(euphoriaStep(80)).toMatchObject({ active: true, sellPct: 5 });
    expect(euphoriaStep(89)).toMatchObject({ active: true, sellPct: 5 });
    expect(euphoriaStep(92)).toMatchObject({ active: true, sellPct: 10 });
    expect(euphoriaStep(null).active).toBe(false);
  });
});
