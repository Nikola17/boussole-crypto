// Panier automatique : montant + jours + part base/découverte → les ordres exacts, avec les garde-fous du panier.
import { describe, expect, it } from 'vitest';
import { planAutoBasket, topBaseUniverse, type AutoBasketContext, type AutoBasketSettings, type AutoCandidate } from './autoBasket';

const c = (id: string, over: Partial<AutoCandidate> = {}): AutoCandidate => ({
  coin: { coinId: id, symbol: id.slice(0, 3), name: id },
  rank: null,
  score: null,
  change7d: 0,
  heldUsd: 0,
  cdc: 'app',
  ...over,
});

const settings = (over: Partial<AutoBasketSettings> = {}): AutoBasketSettings => ({
  amountUsd: 60, basePct: 50, maxBaseLines: 3, maxDiscoveryLines: 3, minOrderUsd: 5, reserveUsd: 0, ...over,
});

const ctx = (over: Partial<AutoBasketContext> = {}): AutoBasketContext => ({
  temperature: 50,
  totalValueUsd: 0,
  maxPerGemPct: 5,
  base: [c('bitcoin', { rank: 1, score: 30 }), c('ethereum', { rank: 2, score: 20 }), c('solana', { rank: 5, score: 40 }), c('cardano', { rank: 9, score: 10 })],
  discovery: [c('gem-a', { score: 80 }), c('gem-b', { score: 70 }), c('gem-c', { score: 60 }), c('gem-d', { score: 50 })],
  canOpenBase: true,
  canOpenDiscovery: true,
  ...over,
});

const sum = (xs: { usd: number }[]) => Math.round(xs.reduce((s, x) => s + x.usd, 0) * 100) / 100;

describe('topBaseUniverse', () => {
  it('garde le top 20 par rang, sans stablecoins ni jetons « wrapped »', () => {
    const rows = [
      { id: 'tether', symbol: 'usdt', name: 'Tether', rank: 3 },
      { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', rank: 1 },
      { id: 'wrapped-bitcoin', symbol: 'wbtc', name: 'Wrapped Bitcoin', rank: 15 },
      { id: 'ethereum', symbol: 'eth', name: 'Ethereum', rank: 2 },
      ...Array.from({ length: 30 }, (_, i) => ({ id: `coin-${i}`, symbol: `c${i}`, name: `Coin ${i}`, rank: 20 + i })),
    ];
    const out = topBaseUniverse(rows);
    expect(out).toHaveLength(20);
    expect(out[0].id).toBe('bitcoin');
    expect(out.map((r) => r.id)).not.toContain('tether');
    expect(out.map((r) => r.id)).not.toContain('wrapped-bitcoin');
  });
});

describe('planAutoBasket', () => {
  it('marché neutre : 3 cryptos de base par meilleur signal, 3 découvertes par meilleur score, montants au centime', () => {
    const p = planAutoBasket(settings(), ctx());
    const base = p.orders.filter((o) => o.kind === 'core');
    const disc = p.orders.filter((o) => o.kind === 'discovery');
    expect(base.map((o) => o.coinId)).toEqual(['solana', 'bitcoin', 'ethereum']);
    expect(disc.map((o) => o.coinId)).toEqual(['gem-a', 'gem-b', 'gem-c']);
    expect(sum(base)).toBe(30);
    expect(sum(disc)).toBe(30);
    expect(p.investUsd).toBe(60);
    expect(p.reserveDeltaUsd).toBe(0);
  });

  it('le minimum par ordre limite le nombre de lignes (25 USDC à 50/50 : 2 + 2 au plus)', () => {
    const p = planAutoBasket(settings({ amountUsd: 25 }), ctx());
    expect(p.orders.filter((o) => o.kind === 'core')).toHaveLength(2);
    expect(p.orders.filter((o) => o.kind === 'discovery')).toHaveLength(2);
    expect(p.investUsd).toBe(25);
    for (const o of p.orders) expect(o.usd).toBeGreaterThanOrEqual(5);
  });

  it('respecte les maximums choisis (1 base, 0 découverte : tout va à la base)', () => {
    const p = planAutoBasket(settings({ maxBaseLines: 1, maxDiscoveryLines: 0 }), ctx());
    expect(p.orders).toHaveLength(1);
    expect(p.orders[0]).toMatchObject({ coinId: 'solana', kind: 'core', usd: 60 });
  });

  it('écarte FOMO, absence sur Crypto.com et signal « Alléger », en le disant', () => {
    const p = planAutoBasket(settings(), ctx({
      base: [c('bitcoin', { rank: 1, score: -30 }), c('ethereum', { rank: 2, score: 20, change7d: 80 }), c('solana', { rank: 5, score: 10, cdc: 'unknown' }), c('xrp', { rank: 4, score: 5 })],
    }));
    expect(p.orders.filter((o) => o.kind === 'core').map((o) => o.coinId)).toEqual(['xrp']);
    const reasons = p.excluded.map((e) => e.reason).join(' | ');
    expect(reasons).toMatch(/Alléger/);
    expect(reasons).toMatch(/FOMO/);
    expect(reasons).toMatch(/Crypto\.com/);
  });

  it('marché très chaud : pas de découverte, base réduite, le reste part en réserve', () => {
    const p = planAutoBasket(settings({ amountUsd: 100 }), ctx({ temperature: 85 }));
    expect(p.orders.every((o) => o.kind === 'core')).toBe(true);
    expect(sum(p.orders)).toBe(12.5); // 50 × 0,25
    expect(p.reserveDeltaUsd).toBe(87.5);
  });

  it('marché qui a peur : la base est renforcée par la réserve, jamais au-delà de ce qu’elle contient', () => {
    const p = planAutoBasket(settings({ amountUsd: 40, reserveUsd: 10 }), ctx({ temperature: 10 }));
    expect(p.investUsd).toBe(50);
    expect(p.reserveDeltaUsd).toBe(-10);
  });

  it('maximum de lignes atteint : seules les cryptos déjà détenues sont renforcées', () => {
    const p = planAutoBasket(settings(), ctx({
      canOpenBase: false,
      canOpenDiscovery: false,
      base: [c('bitcoin', { rank: 1, score: 30, heldUsd: 100 }), c('solana', { rank: 5, score: 40 })],
      discovery: [c('gem-a', { score: 80 }), c('gem-b', { score: 70, heldUsd: 10 })],
    }));
    expect(p.orders.map((o) => o.coinId).sort()).toEqual(['bitcoin', 'gem-b']);
  });

  it('aucune découverte possible : son montant revient à la base', () => {
    const p = planAutoBasket(settings(), ctx({ discovery: [] }));
    expect(p.orders.every((o) => o.kind === 'core')).toBe(true);
    expect(p.investUsd).toBe(60);
  });

  it('température inconnue : ×1 avec un avertissement', () => {
    const p = planAutoBasket(settings(), ctx({ temperature: null }));
    expect(p.investUsd).toBe(60);
    expect(p.warnings.join(' ')).toMatch(/indisponible/);
  });
});
