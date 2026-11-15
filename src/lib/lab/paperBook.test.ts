import { describe, expect, it } from 'vitest';
import { bookOf, marketOrder, measuredPreset, repriceWithCosts, tradesOf, COST_PRESETS } from './paperBook';
import type { PaperPortfolio, PaperTrade } from '../../types';

const pf: PaperPortfolio = { id: 'p1', name: 'Test', kind: 'manual', startingUsd: 1000, createdAt: '2026-11-01T00:00:00.000Z', costs: { preset: 'exchange', ...COST_PRESETS.exchange } };
const sol = { coinId: 'solana', symbol: 'sol', name: 'Solana' };
const NOW = '2026-11-20T10:00:00.000Z';

describe('portefeuille papier manuel', () => {
  it('achat au marché de 100 USDC : frais et écart réalistes', () => {
    const r = marketOrder(pf, [], { coin: sol, side: 'buy', usd: 100 }, 100, NOW);
    expect(r.error).toBeNull();
    expect(r.trade).toMatchObject({ portfolioId: 'p1', type: 'buy', orderType: 'market', marketUsd: 100 });
    expect(r.trade!.priceUsd).toBeCloseTo(100.05, 9);
    expect(r.trade!.feeUsd).toBeCloseTo(0.1, 9);
    expect(r.trade!.quantity).toBeCloseTo(0.99850075, 8);
    const book = bookOf(pf, [r.trade!]);
    expect(book.cashUsd).toBeCloseTo(900, 6); // quantité arrondie à 8 décimales
    expect(book.positions.solana.quantity).toBeCloseTo(0.99850075, 8);
  });
  it('vente supérieure à la position : refusée', () => {
    const buy = marketOrder(pf, [], { coin: sol, side: 'buy', usd: 100 }, 100, NOW).trade!;
    const r = marketOrder(pf, [buy], { coin: sol, side: 'sell', quantity: 5 }, 110, NOW);
    expect(r.trade).toBeNull();
    expect(r.error).toBe('Tu ne détiens pas autant de cette crypto sur ce portefeuille.');
  });
  it('achat avec stop et objectif : deux ordres liés, valables 90 jours', () => {
    const r = marketOrder(pf, [], { coin: sol, side: 'buy', usd: 100, stop: 90, target: 120 }, 100, NOW);
    expect(r.orders).toHaveLength(2);
    expect(r.orders.map((o) => [o.type, o.price, o.side, o.status])).toEqual([['stop', 90, 'sell', 'open'], ['target', 120, 'sell', 'open']]);
    expect(r.orders[0].ocoGroup).toBe(r.orders[1].ocoGroup);
    expect(r.orders[0].expiresAt).toBe('2027-02-18T10:00:00.000Z');
  });
  it('les ordres d’un autre portefeuille et les achats fantômes ne comptent pas', () => {
    const other = { ...marketOrder(pf, [], { coin: sol, side: 'buy', usd: 100 }, 100, NOW).trade!, portfolioId: 'p2' };
    const ghost: PaperTrade = { ...other, id: 'g', portfolioId: undefined, ghost: true };
    expect(tradesOf([other, ghost], 'p1')).toEqual([]);
    expect(bookOf(pf, tradesOf([other, ghost], 'p1')).cashUsd).toBe(1000);
  });
  it('les mêmes ordres avec les frais d’une application rapportent moins', () => {
    const fills = [{ coinId: 'solana', side: 'buy' as const, quantity: 1, marketUsd: 100 }, { coinId: 'solana', side: 'sell' as const, quantity: 1, marketUsd: 120 }];
    const ex = repriceWithCosts(fills, 1000, COST_PRESETS.exchange, new Map());
    const app = repriceWithCosts(fills, 1000, COST_PRESETS.app, new Map());
    expect(app).toBeLessThan(ex);
    expect(ex).toBeCloseTo(1000 - 100 + (100 * 0.999 / 100.05) * 120 * 0.9995 * 0.999, 6);
  });
  it('frais mesurés : seulement avec 5 achats ou plus, écart borné', () => {
    expect(measuredPreset(0.02, 8)).toEqual({ feePct: 0, spreadPct: 0.05 });
    expect(measuredPreset(2.4, 8)).toEqual({ feePct: 0, spreadPct: 2.4 });
    expect(measuredPreset(9, 8)).toEqual({ feePct: 0, spreadPct: 5 });
    expect(measuredPreset(2, 4)).toBeNull();
    expect(measuredPreset(null, 10)).toBeNull();
  });
});
