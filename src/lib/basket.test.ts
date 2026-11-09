import { describe, expect, it } from 'vitest';
import { discoveryShare, isBasketDay, lastBasketOccurrence, nextBasketOccurrences, planBasketOrder, type BasketContext } from './basket';
import type { BasketPlan, CoinRef } from '../types';

const coin = (id: string): CoinRef => ({ coinId: id, symbol: id.slice(0, 4), name: id });
const basket = (over: Partial<BasketPlan> = {}): BasketPlan => ({
  id: 'b', name: 'Panier', active: true, amountUsd: 25, daysOfWeek: [2, 5], startDate: '2026-01-01', discoveryMaxPct: 50,
  core: [{ ...coin('bitcoin'), weight: 70 }, { ...coin('ethereum'), weight: 30 }],
  discovery: [coin('sui'), coin('prove'), coin('tao')], reserveUsd: 20, minOrderUsd: 5, reminder: true, createdAt: '', ...over,
});
const ctx = (over: Partial<BasketContext> = {}): BasketContext => ({
  temperature: 50, totalValueUsd: 5250, altTargetPct: 40, altCurrentPct: 7,
  values: { bitcoin: 3920, ethereum: 980, sui: 56, prove: 7 }, change7d: {},
  cdc: { bitcoin: 'exchange', ethereum: 'exchange', sui: 'exchange', prove: 'exchange', tao: 'exchange' }, scores: {},
  rules: { maxPerGemPct: 3, minLinePct: 1, maxDiscoveryLines: 5 }, discoveryLinesOpen: 3, ...over,
});

describe('calendrier du panier (mardi et vendredi)', () => {
  const b = basket();
  it('reconnaît les jours d\'achat et ignore ceux d\'avant la date de départ', () => {
    expect(isBasketDay(b, new Date(2026, 10, 10))).toBe(true); // mardi
    expect(isBasketDay(b, new Date(2026, 10, 13))).toBe(true); // vendredi
    expect(isBasketDay(b, new Date(2026, 10, 11))).toBe(false); // mercredi
    expect(isBasketDay(basket({ startDate: '2026-12-01' }), new Date(2026, 10, 10))).toBe(false);
  });
  it('prochaines et dernière échéances', () => {
    expect(nextBasketOccurrences(b, new Date(2026, 10, 8), 3).map((d) => d.getDate())).toEqual([10, 13, 17]);
    expect(lastBasketOccurrence(b, new Date(2026, 10, 12))?.getDate()).toBe(10);
    expect(lastBasketOccurrence(b, new Date(2026, 10, 13))?.getDate()).toBe(13);
    expect(lastBasketOccurrence(basket({ daysOfWeek: [] }), new Date(2026, 10, 13))).toBeNull();
  });
});

describe('part « découverte »', () => {
  it('pleine quand les altcoins sont loin de leur cible, puis fond jusqu\'à 0', () => {
    expect(discoveryShare(50, 25, 7)).toBeCloseTo(0.5);
    expect(discoveryShare(50, 25, 20)).toBeCloseTo(0.2);
    expect(discoveryShare(50, 25, 25)).toBe(0);
    expect(discoveryShare(50, 25, 40)).toBe(0);
    expect(discoveryShare(50, 0, 0)).toBe(0);
  });
});

describe('ordre du jour : marché neutre', () => {
  const r = planBasketOrder(basket(), ctx());
  it('deux ordres au plus : un cœur et une découverte, budget respecté', () => {
    expect(r.orders).toHaveLength(2);
    expect(r.orders.map((o) => o.kind)).toEqual(['core', 'discovery']);
    expect(r.investUsd).toBe(25);
    expect(r.reserveDeltaUsd).toBe(0);
    expect(r.orders.filter((o) => o.kind === 'discovery')).toHaveLength(1);
  });
  it('le cœur renforce la ligne la plus en retard (Ethereum : 20 % du cœur pour 30 % visés)', () => {
    const core = r.orders[0];
    expect(core.coinId).toBe('ethereum');
    expect(core.usd).toBe(12.5);
    expect(core.reason).toContain('plus en retard');
  });
});

describe('ordre du jour : peur et euphorie', () => {
  it('peur (température 31, cœur ×1,5) : la réserve finance le dépassement', () => {
    const r = planBasketOrder(basket(), ctx({ temperature: 31 }));
    expect(r.multiplier).toBe(1.5);
    expect(r.orders[0].usd).toBe(18.75);
    expect(r.investUsd).toBe(31.25);
    expect(r.reserveDeltaUsd).toBe(-6.25);
  });
  it('peur sans réserve suffisante : on ne dépasse pas le budget + la réserve', () => {
    const r = planBasketOrder(basket({ reserveUsd: 3 }), ctx({ temperature: 31 }));
    expect(r.investUsd).toBeLessThanOrEqual(28);
    expect(r.reserveDeltaUsd).toBe(-3);
    expect(r.notes.join(' ')).toContain('Réserve insuffisante');
  });
  it('marché chaud (70) : cœur ×0,5 et découverte réduite de moitié, le reste va en réserve', () => {
    const r = planBasketOrder(basket(), ctx({ temperature: 70 }));
    expect(r.investUsd).toBe(12.5);
    expect(r.reserveDeltaUsd).toBe(12.5);
  });
  it('euphorie (85) : plus de découverte, cœur sous le minimum → tout en réserve', () => {
    const r = planBasketOrder(basket(), ctx({ temperature: 85 }));
    expect(r.orders).toHaveLength(0);
    expect(r.reserveDeltaUsd).toBe(25);
    expect(r.notes.join(' ')).toContain('très chaud');
  });
});

describe('ordre du jour : règles contre l\'éparpillement', () => {
  it('cible des altcoins atteinte : tout va au cœur, un seul ordre', () => {
    const r = planBasketOrder(basket(), ctx({ altCurrentPct: 45 }));
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0].kind).toBe('core');
    expect(r.orders[0].usd).toBe(25);
    expect(r.notes.join(' ')).toContain('Part découverte à 0 %');
  });

  it('on finit une ligne ouverte (sous 1 %) avant d\'en ouvrir une autre', () => {
    const r = planBasketOrder(basket(), ctx());
    const d = r.orders.find((o) => o.kind === 'discovery')!;
    expect(d.coinId).toBe('prove'); // 7 $ sur 5 250 $ = 0,13 %
    expect(d.reason).toContain('finit');
  });

  it('sans ligne à finir : le meilleur score de la liste gagne', () => {
    const r = planBasketOrder(basket(), ctx({ values: { bitcoin: 3920, ethereum: 980, sui: 60, prove: 70 }, scores: { sui: 10, prove: 5, tao: 40 } }));
    const d = r.orders.find((o) => o.kind === 'discovery')!;
    expect(d.coinId).toBe('tao');
    expect(d.reason).toContain('Meilleur score');
  });

  it('anti-FOMO : une crypto à +60 % en 7 jours est écartée', () => {
    const r = planBasketOrder(basket(), ctx({ change7d: { prove: 60 } }));
    expect(r.orders.find((o) => o.kind === 'discovery')?.coinId).not.toBe('prove');
    expect(r.excluded.some((e) => e.symbol === 'PROV' && e.reason.includes('FOMO'))).toBe(true);
  });

  it('absente de Crypto.com : écartée ; si toute la liste l\'est, le montant va en réserve', () => {
    const r = planBasketOrder(basket(), ctx({ cdc: { bitcoin: 'exchange', ethereum: 'exchange', sui: 'unknown', prove: 'unknown', tao: 'unknown' } }));
    expect(r.orders).toHaveLength(1);
    expect(r.excluded).toHaveLength(3);
    expect(r.reserveDeltaUsd).toBe(12.5);
    expect(r.notes.join(' ')).toContain('va en réserve');
  });

  it('plafond par ligne : le montant est limité, puis la ligne est écartée', () => {
    const near = planBasketOrder(basket({ discovery: [coin('sui')] }), ctx({ values: { bitcoin: 3920, ethereum: 980, sui: 150 } }));
    const d = near.orders.find((o) => o.kind === 'discovery')!;
    expect(d.usd).toBeCloseTo(0.03 * (5250 + 12.5) - 150, 1);
    expect(d.reason).toContain('plafond');
    const full = planBasketOrder(basket({ discovery: [coin('sui')] }), ctx({ values: { bitcoin: 3920, ethereum: 980, sui: 160 } }));
    expect(full.orders.some((o) => o.kind === 'discovery')).toBe(false);
    expect(full.excluded[0].reason).toContain('plafond');
  });

  it('trop de lignes « découverte » ouvertes : seules celles qui existent déjà sont renforcées', () => {
    const r = planBasketOrder(basket(), ctx({ discoveryLinesOpen: 5, values: { bitcoin: 3920, ethereum: 980, sui: 56 } }));
    expect(r.orders.find((o) => o.kind === 'discovery')?.coinId).toBe('sui');
    expect(r.excluded.map((e) => e.symbol).sort()).toEqual(['PROV', 'TAO']);
  });

  it('un petit portefeuille ne bloque pas les achats avec le plafond par ligne', () => {
    const r = planBasketOrder(basket(), ctx({ totalValueUsd: 200, values: { bitcoin: 150, ethereum: 20, prove: 10 } }));
    expect(r.orders.some((o) => o.kind === 'discovery')).toBe(true);
  });

  it('un cœur vide ou une liste vide sont signalés', () => {
    expect(planBasketOrder(basket({ core: [] }), ctx()).warnings.join(' ')).toContain('cœur du panier est vide');
    expect(planBasketOrder(basket({ discovery: [] }), ctx()).notes.join(' ')).toContain('Liste découverte vide');
  });

  it('sans température : montants non modulés, avec un avertissement', () => {
    const r = planBasketOrder(basket(), ctx({ temperature: null }));
    expect(r.multiplier).toBe(1);
    expect(r.warnings.join(' ')).toContain('Température');
  });

  it('les ordres respectent le minimum et ne dépassent jamais le budget + la réserve', () => {
    for (const t of [5, 25, 45, 65, 85, 95]) {
      const r = planBasketOrder(basket(), ctx({ temperature: t }));
      for (const o of r.orders) expect(o.usd).toBeGreaterThanOrEqual(5);
      expect(r.investUsd).toBeLessThanOrEqual(25 + 20 + 0.01);
      expect(r.orders.length).toBeLessThanOrEqual(2);
    }
  });
});
