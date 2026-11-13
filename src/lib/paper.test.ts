// Portefeuille papier : positions, cash, P&L, garde-fous et comparaison Bitcoin — tout est pur et vérifié.

import { describe, expect, it } from 'vitest';
import type { PaperTrade } from '../types';
import { btcBenchmark, checkPaperOrder, paperPositions, paperStatus } from './paper';

const trade = (over: Partial<PaperTrade> = {}): PaperTrade => ({
  id: 't1', coinId: 'solana', symbol: 'sol', name: 'Solana', date: '2026-01-10', type: 'buy',
  quantity: 10, priceUsd: 100, ...over,
});

describe('portefeuille papier', () => {
  it('un achat décrémente le cash et ouvre une position valorisée au prix réel', () => {
    const st = paperStatus(2000, [trade({ quantity: 10, priceUsd: 100 })], new Map([['solana', 150]]));
    expect(st.cashUsd).toBe(1000); // 2000 - 10 x 100
    expect(st.positions).toHaveLength(1);
    expect(st.positions[0]).toMatchObject({ coinId: 'solana', quantity: 10, costUsd: 1000, valueUsd: 1500, pnlPct: 50 });
    expect(st.totalUsd).toBe(2500); // 1000 de cash + 1500 en positions
    expect(st.pnlPct).toBe(25); // +500 sur 2000
  });

  it('les frais simulés sont déduits, une vente rend le cash au prorata du coût', () => {
    const trades = [
      trade({ quantity: 10, priceUsd: 100, feeUsd: 5 }),
      trade({ id: 't2', type: 'sell', quantity: 5, priceUsd: 120, feeUsd: 2 }),
    ];
    const st = paperStatus(1000, trades, new Map([['solana', 130]]));
    // cash : 1000 - (10 x 100 + 5) + (5 x 120 - 2) = 593
    expect(st.cashUsd).toBeCloseTo(593, 6);
    // coût restant : 1005 au prorata (moitié vendue), quantité 5
    expect(st.positions[0]).toMatchObject({ quantity: 5, costUsd: 502.5 });
    expect(st.positions[0].valueUsd).toBe(650);
  });

  it('une ligne sans prix connu est dite telle quelle, jamais valorisée à 0', () => {
    const st = paperStatus(1000, [trade({ coinId: 'jeton-x', symbol: 'xyz', name: 'Jeton X' })], new Map());
    expect(st.unpriced).toBe(1);
    expect(st.positions[0].valueUsd).toBeNull();
  });

  it('les garde-fous : pas d’achat sans cash, pas de vente au-delà de ce qui est détenu', () => {
    const st = paperStatus(100, [trade({ quantity: 1, priceUsd: 100 })], new Map([['solana', 100]]));
    expect(checkPaperOrder('buy', 1, 100, st).ok).toBe(false); // plus de cash
    expect(checkPaperOrder('sell', 2, 100, st, 1).ok).toBe(false); // pas assez de quantité
    expect(checkPaperOrder('sell', 1, 100, st, 1).ok).toBe(true);
    expect(checkPaperOrder('buy', 0, 100, st).ok).toBe(false);
  });

  it('la comparaison Bitcoin : le même montant investi aux mêmes dates', () => {
    const trades = [trade({ date: '2026-01-10', quantity: 5, priceUsd: 100 })]; // 500 $ le jour où BTC valait 50 000 $
    const r = btcBenchmark(trades, new Map([['2026-01-10', 50_000]]), 100_000);
    expect(r?.nowUsd).toBeCloseTo(1000, 6); // 0,01 BTC à 100 000 $
    expect(r?.pct).toBeCloseTo(100, 6);
    // une date sans prix BTC : la comparaison n'existe pas
    expect(btcBenchmark(trades, new Map(), 100_000)).toBeNull();
    expect(btcBenchmark([], new Map([['2026-01-10', 50_000]]), 100_000)).toBeNull();
  });

  it('positions calculées seules (montants et coûts), sans valorisation', () => {
    const base = paperPositions([trade({ quantity: 10, priceUsd: 50 })], new Map());
    expect(base.positions[0]).toMatchObject({ quantity: 10, costUsd: 500 });
    expect(base.unpriced).toBe(1);
  });
});
