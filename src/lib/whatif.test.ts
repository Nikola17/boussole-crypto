import { describe, expect, it } from 'vitest';
import { whatIfTransactions } from './whatif';
import type { Transaction } from '../types';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't1', date: '2026-01-10', type: 'buy', coinId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin',
  quantity: 0.01, price: 40000, currency: 'USD', fee: 10, fxEurPerUsd: 0.92, ...over,
});

describe('whatIfTransactions', () => {
  it('calcule le coût d’une vente (garde vs vendu) et le gain d’un achat', () => {
    const txs = [
      tx({ id: 'a', type: 'buy', date: '2026-01-10', quantity: 0.01, price: 40000, fee: 10 }), // coût 410
      tx({ id: 'v', type: 'sell', date: '2026-06-01', quantity: 0.005, price: 60000, fee: 0 }), // proceeds 300
    ];
    const s = whatIfTransactions(txs, (id) => (id === 'bitcoin' ? 80000 : null), 0.92);
    const sell = s.rows.find((r) => r.txId === 'v')!;
    // vendu à 60 000, vaut 80 000 aujourd’hui : garder aurait rapporté 0,005 × 80 000 = 400 → la vente a coûté 100
    expect(sell.valueNow).toBeCloseTo(400);
    expect(sell.delta).toBeCloseTo(100);
    expect(s.costOfSelling).toBeCloseTo(100);
    const buy = s.rows.find((r) => r.txId === 'a')!;
    expect(buy.valueNow).toBeCloseTo(800); // 0,01 × 80 000
    expect(buy.delta).toBeCloseTo(800 - 410); // gain de l’achat
    expect(s.gainOfBuying).toBeCloseTo(390);
  });

  it('convertit en EUR avec le taux du jour', () => {
    const txs = [tx({ id: 'e', type: 'sell', currency: 'EUR', quantity: 1, price: 100, fee: 0 })];
    const s = whatIfTransactions(txs, () => 200, 0.9); // 200 USD = 180 EUR
    expect(s.rows[0].valueNow).toBeCloseTo(180);
    expect(s.rows[0].delta).toBeCloseTo(80);
  });

  it('laisse null quand le prix actuel est inconnu', () => {
    const s = whatIfTransactions([tx({})], () => null, 0.92);
    expect(s.rows[0].valueNow).toBeNull();
    expect(s.rows[0].delta).toBeNull();
    expect(s.costOfSelling).toBeNull();
    expect(s.gainOfBuying).toBeNull();
  });

  it('ignore les autres types de transactions et les montants nuls', () => {
    const s = whatIfTransactions([
      tx({ id: 'd', type: 'deposit' }),
      tx({ id: 'z', type: 'buy', quantity: 0 }),
    ], () => 1, 0.92);
    expect(s.rows).toHaveLength(0);
  });
});
