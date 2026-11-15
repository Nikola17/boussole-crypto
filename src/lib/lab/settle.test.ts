import { describe, expect, it } from 'vitest';
import { settleOrders } from './settle';
import { marketOrder, COST_PRESETS } from './paperBook';
import type { Candle } from '../indicators';
import type { PaperOrder, PaperPortfolio } from '../../types';

const H = 3600;
const T0 = Date.UTC(2026, 10, 20, 10) / 1000; // 20/11/2026 10 h UTC
const pf: PaperPortfolio = { id: 'p1', name: 'T', kind: 'manual', startingUsd: 1000, createdAt: '2026-11-01T00:00:00.000Z', costs: { preset: 'exchange', ...COST_PRESETS.exchange } };
const sol = { coinId: 'solana', symbol: 'sol', name: 'Solana' };
const bar = (k: number, o: number, h: number, l: number, c: number): Candle => ({ time: T0 + k * H, open: o, high: h, low: l, close: c, volume: 1 });
const order = (over: Partial<PaperOrder>): PaperOrder => ({ id: 'o1', portfolioId: 'p1', ...sol, side: 'buy', type: 'limit', price: 95, usd: 100, createdAt: new Date((T0 - 1800) * 1000).toISOString(), expiresAt: '2027-01-01T00:00:00.000Z', status: 'open', ...over });
const NOW = (T0 + 10 * H) * 1000;

describe('règlement des ordres en attente', () => {
  it('achat limite exécuté au niveau, avec ses ordres attachés', () => {
    const hourly = new Map([['solana', [bar(0, 100, 101, 98, 99), bar(1, 99, 99, 94, 96), bar(2, 96, 97, 95, 96)]]]);
    const r = settleOrders({ portfolio: pf, orders: [order({ attachStop: 85, attachTarget: 120 })], trades: [], hourly, nowMs: NOW });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ id: 'fill:o1', type: 'buy', orderType: 'limit', orderId: 'o1', marketUsd: 95 });
    expect(r.trades[0].priceUsd).toBeCloseTo(95 * 1.0005, 9);
    const filled = r.orders.find((o) => o.id === 'o1')!;
    expect(filled.status).toBe('filled');
    const attached = r.orders.filter((o) => o.id !== 'o1');
    expect(attached.map((o) => [o.type, o.price, o.status])).toEqual([['stop', 85, 'open'], ['target', 120, 'open']]);
    expect(attached[0].ocoGroup).toBe('fill:o1');
  });
  it('stop sur trou de cotation : exécuté à l’ouverture ; l’objectif lié est annulé', () => {
    const buy = marketOrder(pf, [], { coin: sol, side: 'buy', usd: 100, stop: 90, target: 120 }, 100, new Date((T0 - 1800) * 1000).toISOString());
    const hourly = new Map([['solana', [bar(0, 100, 101, 99, 100), bar(1, 85, 86, 84, 85)]]]);
    const r = settleOrders({ portfolio: pf, orders: buy.orders, trades: [buy.trade!], hourly, nowMs: NOW });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ type: 'sell', orderType: 'stop', marketUsd: 85 });
    expect(r.trades[0].quantity).toBeCloseTo(buy.trade!.quantity, 8);
    expect(r.orders.map((o) => [o.type, o.status]).sort()).toEqual([['stop', 'filled'], ['target', 'cancelled']]);
  });
  it('expiration, et bougie pas encore close ignorée', () => {
    const exp = settleOrders({ portfolio: pf, orders: [order({ expiresAt: new Date((T0 + 1 * H) * 1000).toISOString() })], trades: [], hourly: new Map([['solana', [bar(0, 100, 101, 99, 100), bar(1, 100, 101, 90, 95)]]]), nowMs: NOW });
    expect(exp.trades).toHaveLength(0);
    expect(exp.orders[0].status).toBe('expired');
    const open = settleOrders({ portfolio: pf, orders: [order({})], trades: [], hourly: new Map([['solana', [bar(9, 100, 101, 90, 95)]]]), nowMs: (T0 + 9 * H + 600) * 1000 });
    expect(open.trades).toHaveLength(0);
    expect(open.orders).toHaveLength(0);
  });
  it('relancé : rien de nouveau ; deux règlements indépendants : même identifiant', () => {
    const hourly = new Map([['solana', [bar(1, 99, 99, 94, 96)]]]);
    const a = settleOrders({ portfolio: pf, orders: [order({})], trades: [], hourly, nowMs: NOW });
    const merged = [order({}), ...a.orders].filter((o, i, all) => all.findLastIndex((x) => x.id === o.id) === i);
    const again = settleOrders({ portfolio: pf, orders: merged, trades: a.trades, hourly, nowMs: NOW });
    expect(again.trades).toHaveLength(0);
    expect(again.orders).toHaveLength(0);
    const b = settleOrders({ portfolio: pf, orders: [order({})], trades: [], hourly, nowMs: NOW });
    expect(b.trades[0].id).toBe(a.trades[0].id);
    expect(b.trades[0]).toEqual(a.trades[0]);
  });
  it('vente sans position : ordre annulé', () => {
    const r = settleOrders({ portfolio: pf, orders: [order({ side: 'sell', type: 'stop', price: 90, usd: undefined })], trades: [], hourly: new Map([['solana', [bar(1, 95, 96, 89, 90)]]]), nowMs: NOW });
    expect(r.trades).toHaveLength(0);
    expect(r.orders[0].status).toBe('cancelled');
  });
});
