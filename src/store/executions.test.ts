// Correction et suppression des DCA : les transactions et la réserve suivent toujours l'échéance.
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './useStore';
import type { BasketPlan, Transaction } from '../types';

const basket: BasketPlan = {
  id: 'b1', name: 'Test', active: true, amountUsd: 20, daysOfWeek: [2], startDate: '2026-11-01', discoveryMaxPct: 50,
  core: [], discovery: [], reserveUsd: 10, minOrderUsd: 5, reminder: false, createdAt: '2026-11-01T00:00:00Z', mode: 'auto', basePct: 70,
};
const tx = (id: string, coinId: string, type: Transaction['type'], quantity: number, price: number): Transaction => ({
  id, coinId, symbol: coinId.slice(0, 3), name: coinId, date: '2026-11-10', type, quantity, price, currency: 'USD', fee: 0, fxEurPerUsd: 0.9, source: 'dca',
});

beforeEach(() => {
  useStore.getState().resetAll();
  useStore.getState().setBasket(basket);
  // Échéance : 12 USDC de SOL (0,1) + 6 USDC de NEAR (2) → 2 USDC partent en réserve (10 → 12).
  useStore.getState().addBasketExecution(
    { id: 'e1', basketId: 'b1', periodKey: '2026-11-10', date: '2026-11-10', investedUsd: 18, reserveDeltaUsd: 2, orders: [
      { coinId: 'solana', symbol: 'sol', name: 'Solana', usd: 12, quantity: 0.1, price: 120, kind: 'core' },
      { coinId: 'near', symbol: 'near', name: 'NEAR', usd: 6, quantity: 2, price: 3, kind: 'discovery' },
    ] },
    [tx('t1', 'solana', 'buy', 0.1, 120), tx('t2', 'usd-coin', 'sell', 12, 1), tx('t3', 'near', 'buy', 2, 3), tx('t4', 'usd-coin', 'sell', 6, 1)],
  );
});

describe('correction d’une échéance du panier', () => {
  it('met à jour l’échéance, ses achats, ses sorties d’USDC et la réserve', () => {
    expect(useStore.getState().basket?.reserveUsd).toBe(12);
    useStore.getState().updateBasketExecution('e1', [{ usd: 14, quantity: 0.11 }, { usd: 6, quantity: 2.2 }]);
    const s = useStore.getState();
    const e = s.basketExecutions.find((x) => x.id === 'e1')!;
    expect(e.investedUsd).toBe(20);
    expect(e.reserveDeltaUsd).toBe(0);
    expect(s.basket?.reserveUsd).toBe(10); // 2 USDC dépensés en plus : ils ne sont plus en réserve
    const byId = new Map(s.transactions.map((t) => [t.id, t]));
    expect(byId.get('t1')).toMatchObject({ quantity: 0.11, price: 14 / 0.11 });
    expect(byId.get('t2')?.quantity).toBe(14);
    expect(byId.get('t3')).toMatchObject({ quantity: 2.2 });
    expect(byId.get('t4')?.quantity).toBe(6);
  });
  it('ignore une correction qui n’a pas le bon nombre de lignes', () => {
    useStore.getState().updateBasketExecution('e1', [{ usd: 1, quantity: 1 }]);
    expect(useStore.getState().basketExecutions[0].investedUsd).toBe(18);
  });
});

describe('suppression du panier', () => {
  it('garde les achats au journal par défaut', () => {
    useStore.getState().removeBasket({ purgeTransactions: false });
    const s = useStore.getState();
    expect(s.basket).toBeNull();
    expect(s.basketExecutions).toHaveLength(0);
    expect(s.transactions).toHaveLength(4);
    expect(s.deletions.some((d) => d.key === 'basketExecutions/e1')).toBe(true);
  });
  it('retire aussi les achats si demandé, et propage les suppressions', () => {
    useStore.getState().removeBasket({ purgeTransactions: true });
    const s = useStore.getState();
    expect(s.transactions).toHaveLength(0);
    expect(s.deletions.filter((d) => d.key.startsWith('transactions/'))).toHaveLength(4);
  });
});

describe('correction d’une échéance d’un plan avancé', () => {
  it('met à jour l’échéance et sa transaction d’achat', () => {
    useStore.getState().addDcaExecution({ id: 'd1', planId: 'p1', periodKey: 'k', date: '2026-11-10', amount: 50, price: 100, quantity: 0.5, multiplier: 1 }, [tx('t9', 'bitcoin', 'buy', 0.5, 100)]);
    useStore.getState().updateDcaExecution('d1', { amount: 60, price: 120, quantity: 0.5 });
    const s = useStore.getState();
    expect(s.dcaExecutions.find((x) => x.id === 'd1')).toMatchObject({ amount: 60, price: 120 });
    expect(s.transactions.find((t) => t.id === 't9')).toMatchObject({ price: 120, quantity: 0.5 });
  });
});
