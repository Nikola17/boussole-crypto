// Panier automatique : montant + jours + part base/découverte → les ordres exacts, avec les garde-fous du panier.
import { describe, expect, it } from 'vitest';
import { autoBaseUniverse, autoDiscoveryPicks, buildAutoBasketPlan, planAutoBasket, topBaseUniverse, type AutoBasketContext, type AutoBasketSettings, type AutoCandidate } from './autoBasket';
import type { CgMarket } from '../api/coingecko';

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

  it('écarte FOMO, absence sur Crypto.com et score investisseur bas, en le disant', () => {
    const p = planAutoBasket(settings(), ctx({
      base: [c('bitcoin', { rank: 1, score: -30 }), c('ethereum', { rank: 2, score: 20, change7d: 80 }), c('solana', { rank: 5, score: 10, cdc: 'unknown' }), c('xrp', { rank: 4, score: 5 })],
    }));
    expect(p.orders.filter((o) => o.kind === 'core').map((o) => o.coinId)).toEqual(['xrp']);
    const reasons = p.excluded.map((e) => e.reason).join(' | ');
    expect(reasons).toContain('(bas)');
    expect(reasons).toContain('score investisseur');
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

describe('calcul extrait du crochet useBasket', () => {
  const row = (id: string, rank: number, over: Partial<CgMarket> = {}): CgMarket => ({
    id, symbol: id.slice(0, 4), name: id, image: `img-${id}`, current_price: 1, market_cap: 1e9 / rank, market_cap_rank: rank, fully_diluted_valuation: 1e9 / rank,
    total_volume: 5e7 / rank, high_24h: null, low_24h: null, price_change_percentage_24h: 0, circulating_supply: null, total_supply: null, max_supply: null,
    ath: 2, ath_change_percentage: -50, ath_date: '', last_updated: '', price_change_percentage_7d_in_currency: 5, price_change_percentage_30d_in_currency: 20, ...over,
  });
  const markets = [row('bitcoin', 1), row('ethereum', 2), row('tether', 3, { symbol: 'usdt' }), row('solana', 5), ...Array.from({ length: 30 }, (_, i) => row(`coin${i}`, 21 + i))];
  const inputs = {
    basket: { amountUsd: 60, basePct: 70, maxBaseLines: 3, maxDiscoveryLines: 3, minOrderUsd: 5, reserveUsd: 20, discoverySource: 'mid' as const },
    markets, smallCaps: null, scores: { bitcoin: 30, ethereum: 20, solana: 40 }, change7d: {}, cdc: null, temperature: 50,
    heldUsd: { bitcoin: 100 }, totalValueUsd: 100, rules: { maxPerGemPct: 3, maxPerAltPct: 5, cashReservePct: 5, riskPerTradePct: 1, maxLines: 12, minLinePct: 1, maxDiscoveryLines: 5 }, linesOpen: 1, discoveryLinesOpen: 0,
  };
  it('donne le même ordre que planAutoBasket sur les mêmes candidates', () => {
    const r = buildAutoBasketPlan(inputs);
    const base = autoBaseUniverse(markets);
    expect(base.map((b) => b.id)).not.toContain('tether');
    const picks = autoDiscoveryPicks(markets, null, 'mid', base);
    const direct = planAutoBasket(
      { amountUsd: 60, basePct: 70, maxBaseLines: 3, maxDiscoveryLines: 3, minOrderUsd: 5, reserveUsd: 20 },
      {
        temperature: 50, totalValueUsd: 100, maxPerGemPct: 3,
        base: base.map((b) => ({ coin: { coinId: b.id, symbol: b.symbol, name: b.name, image: b.image }, rank: b.rank, score: inputs.scores[b.id as 'bitcoin'] ?? null, change7d: null, heldUsd: b.id === 'bitcoin' ? 100 : 0, cdc: null })),
        discovery: picks.map((p) => ({ coin: { ...p.coin, image: `img-${p.coin.coinId}` }, rank: null, score: p.score, change7d: null, heldUsd: 0, cdc: null })),
        canOpenBase: true, canOpenDiscovery: true,
      },
    );
    expect(r).toEqual(direct);
    expect(r.orders.length).toBeGreaterThan(0);
  });
});

describe('raisons du panier : le score, pas les libellés de la version 1', () => {
  it('ni « Accumuler fort » ni « Alléger » dans les raisons', () => {
    const r = planAutoBasket(settings(), ctx({ base: [c('bitcoin', { rank: 1, score: 58 }), c('ethereum', { rank: 2, score: -40 })] }));
    const text = JSON.stringify([r.orders.map((o) => o.reason), r.excluded]);
    expect(text).toContain('score investisseur +58');
    expect(text).toContain('score investisseur −40 (bas)');
    expect(text).not.toMatch(/Accumuler fort|Alléger/);
  });
});

describe('règle de la base (baseMode)', () => {
  const base = [c('bitcoin', { rank: 1, score: 30, weight: 600 }), c('ethereum', { rank: 2, score: 20, weight: 300 }), c('solana', { rank: 5, score: 40, weight: 60 }), c('cardano', { rank: 9, score: 10, weight: 40 })];
  const only = (over: Partial<AutoBasketSettings>) => planAutoBasket(settings({ amountUsd: 100, basePct: 100, ...over }), ctx({ base, discovery: [] })).orders;
  it('sans réglage : les trois meilleurs scores, comme avant', () => {
    expect(only({}).map((o) => o.coinId)).toEqual(['solana', 'bitcoin', 'ethereum']);
    expect(only({ baseMode: 'top3' })).toEqual(only({}));
  });
  it('ancre à 70 % : 70 % de la base en Bitcoin et Ethereum (75/25), le reste selon le signal', () => {
    const o = only({ baseMode: 'anchor', anchorPct: 70 });
    const usd = Object.fromEntries(o.map((x) => [x.coinId, x.usd]));
    expect(usd.bitcoin).toBeCloseTo(52.5, 2);
    expect(usd.ethereum).toBeCloseTo(17.5, 2);
    expect(usd.solana + (usd.cardano ?? 0)).toBeCloseTo(30, 2);
    expect(usd.solana).toBeGreaterThan(0);
    expect(sum(o)).toBe(100);
  });
  it('capitalisation : parts proportionnelles', () => {
    const usd = Object.fromEntries(only({ baseMode: 'cap', minOrderUsd: 1 }).map((x) => [x.coinId, x.usd]));
    expect(usd).toEqual({ bitcoin: 60, ethereum: 30, solana: 6, cardano: 4 });
    // Minimum de 5 $ : la part de Cardano (4 $) saute, le reste est renormalisé
    const min5 = Object.fromEntries(only({ baseMode: 'cap' }).map((x) => [x.coinId, x.usd]));
    expect(min5).toEqual({ bitcoin: 62.5, ethereum: 31.25, solana: 6.25 });
  });
  it('parts égales : jusqu’à 20 parts, au centime, sans passer sous le minimum', () => {
    const many = Array.from({ length: 25 }, (_, i) => c(`coin-${i}`, { rank: i + 1, score: 10 }));
    const o = planAutoBasket(settings({ amountUsd: 100, basePct: 100, minOrderUsd: 5, baseMode: 'equal' }), ctx({ base: many, discovery: [] })).orders;
    expect(o).toHaveLength(20);
    expect(o.every((x) => x.usd === 5)).toBe(true);
    const few = planAutoBasket(settings({ amountUsd: 33, basePct: 100, minOrderUsd: 5, baseMode: 'equal' }), ctx({ base: many, discovery: [] })).orders;
    expect(few).toHaveLength(6);
    expect(sum(few)).toBe(33);
    expect(few.every((x) => x.usd >= 5)).toBe(true);
  });
  it('Bitcoin seul', () => {
    expect(only({ baseMode: 'btc' })).toEqual([expect.objectContaining({ coinId: 'bitcoin', usd: 100 })]);
  });
});

