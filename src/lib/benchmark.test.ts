import { describe, expect, it } from 'vitest';
import { btcBenchmark, compare, discoveryFlows, fiatFlows, priceByDay } from './benchmark';
import type { Transaction } from '../types';

const tx = (p: Partial<Transaction> & { id: string; type: Transaction['type']; coinId: string }): Transaction => ({
  symbol: p.coinId.slice(0, 3), name: p.coinId, date: '2026-01-01', quantity: 1, price: 100, currency: 'USD', fee: 0, fxEurPerUsd: 0.9, ...p,
});

describe('« et si tout en Bitcoin ? »', () => {
  const prices = new Map([['2026-01-01', 100], ['2026-02-01', 200], ['2026-03-01', 50]]);

  it('rejoue les montants aux mêmes dates', () => {
    const b = btcBenchmark([{ date: '2026-01-01', usd: 100 }, { date: '2026-02-01', usd: 100 }], prices, 400);
    expect(b.btcQty).toBeCloseTo(1.5); // 1 + 0,5
    expect(b.investedUsd).toBe(100 + 100);
    expect(b.valueUsd).toBeCloseTo(600);
  });

  it('les retraits vendent du Bitcoin', () => {
    const b = btcBenchmark([{ date: '2026-01-01', usd: 100 }, { date: '2026-02-01', usd: -100 }], prices, 400);
    expect(b.btcQty).toBeCloseTo(0.5);
    expect(b.investedUsd).toBe(0);
  });

  it('un jour sans cours reprend le dernier cours des 7 jours précédents, sinon est ignoré', () => {
    expect(btcBenchmark([{ date: '2026-02-04', usd: 200 }], prices, 400).btcQty).toBeCloseTo(1);
    const far = btcBenchmark([{ date: '2026-02-20', usd: 200 }], prices, 400);
    expect(far.skipped).toBe(1);
    expect(far.btcQty).toBe(0);
  });

  it('flux en monnaie classique : achats payés en euros, ventes converties', () => {
    const f = fiatFlows([
      tx({ id: '1', type: 'buy', coinId: 'usd-coin', fromFiat: true, quantity: 100, price: 1 }),
      tx({ id: '2', type: 'buy', coinId: 'sui', fromFiat: false, quantity: 10, price: 2 }),
      tx({ id: '3', type: 'sell', coinId: 'sui', toFiat: true, quantity: 5, price: 4, fee: 1 }),
      tx({ id: '4', type: 'sell', coinId: 'sui', toFiat: false, quantity: 5, price: 4 }),
    ]);
    expect(f.map((x) => Math.round(x.usd))).toEqual([100, -19]);
  });

  it('flux « découverte » : hors cœur et stablecoins, quel que soit le moyen de paiement', () => {
    const f = discoveryFlows([
      tx({ id: '1', type: 'buy', coinId: 'bitcoin', quantity: 1, price: 100 }),
      tx({ id: '2', type: 'buy', coinId: 'usd-coin', symbol: 'usdc', quantity: 50, price: 1 }),
      tx({ id: '3', type: 'buy', coinId: 'sui', fromFiat: false, quantity: 10, price: 2 }),
      tx({ id: '4', type: 'sell', coinId: 'sui', toFiat: false, quantity: 5, price: 3 }),
    ], new Set(['bitcoin', 'ethereum']));
    expect(f.map((x) => x.usd)).toEqual([20, -15]);
  });

  it('compare la valeur réelle à celle d\'un portefeuille tout en Bitcoin', () => {
    const c = compare(900, { investedUsd: 1000, btcQty: 2, valueUsd: 1000, skipped: 0 });
    expect(c.diffUsd).toBe(-100);
    expect(c.diffPct).toBeCloseTo(-10);
    expect(compare(10, { investedUsd: 0, btcQty: 0, valueUsd: 0, skipped: 0 }).diffPct).toBe(0);
  });

  it('indexe les bougies par jour UTC', () => {
    const m = priceByDay([{ time: Date.UTC(2026, 0, 1) / 1000, close: 123 }]);
    expect(m.get('2026-01-01')).toBe(123);
  });
});
