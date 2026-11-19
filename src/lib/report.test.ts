import { describe, expect, it } from 'vitest';
import { availableMonths, monthReport, monthReportText } from './report';
import type { BasketExecution, DcaExecution, PortfolioSnapshot, Transaction } from '../types';

const snap = (day: string, valueUsd: number, complete = true): PortfolioSnapshot => ({ id: day, day, valueUsd, byBucket: {}, complete });
const tx = (o: Partial<Transaction>): Transaction => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  date: '2026-11-10',
  coinId: 'bitcoin',
  symbol: 'BTC',
  name: 'Bitcoin',
  type: 'buy',
  quantity: 0.001,
  price: 60000,
  currency: 'USD',
  fee: 1,
  fxEurPerUsd: 0.92,
  ...o,
});

describe('monthReport', () => {
  const snaps = [snap('2026-11-01', 5000), snap('2026-11-15', 5500), snap('2026-11-30', 6000), snap('2026-10-31', 4800)];
  const txs = [
    tx({ id: 'b1', date: '2026-11-05', type: 'buy', quantity: 0.001, price: 60000, fee: 1, currency: 'USD' }),
    tx({ id: 's1', date: '2026-11-20', type: 'sell', quantity: 0.0002, price: 70000, fee: 0.5, currency: 'USD' }),
    tx({ id: 'old', date: '2026-10-15', type: 'buy', quantity: 0.001, price: 50000, fee: 1, currency: 'USD' }),
  ];
  const dca: DcaExecution[] = [{ id: 'd1', planId: 'p', periodKey: '2026-11', date: '2026-11-06', amount: 50, price: 60000, quantity: 0.00083, skipped: false } as unknown as DcaExecution];
  const basket: BasketExecution[] = [{ id: 'e1', basketId: 'b', periodKey: '2026-11', date: '2026-11-07', orders: [], investedUsd: 25, reserveDeltaUsd: 0, skipped: false } as unknown as BasketExecution];

  it('calcule le rapport du mois à partir des relevés complets et du journal', () => {
    const r = monthReport(2026, 11, snaps, txs, dca, basket)!;
    expect(r).not.toBeNull();
    expect(r.startValueUsd).toBe(5000);
    expect(r.endValueUsd).toBe(6000);
    expect(r.changePct).toBeCloseTo(20);
    expect(r.investedUsd).toBeCloseTo(60); // 0.001×60000
    expect(r.withdrawnUsd).toBeCloseTo(14); // 0.0002×70000
    expect(r.feesUsd).toBeCloseTo(1.5);
    expect(r.txCount).toBe(2); // la tx d'octobre est exclue
    expect(r.dcaCount).toBe(2);
  });

  it('null sans relevé complet sur le mois', () => {
    expect(monthReport(2026, 9, snaps, txs, dca, basket)).toBeNull();
    expect(monthReport(2026, 11, [snap('2026-11-05', 5000, false)], txs, dca, basket)).toBeNull();
  });

  it('availableMonths trie du plus récent au plus ancien', () => {
    expect(availableMonths(snaps).map((m) => m.label)).toEqual(['2026-11', '2026-10']);
  });

  it('monthReportText produit un export lisible en EUR', () => {
    const r = monthReport(2026, 11, snaps, txs, dca, basket)!;
    const t = monthReportText(r, 'EUR', 0.92);
    expect(t).toContain('# Rapport Boussole — 2026-11');
    expect(t).toContain('4600.00 EUR'); // 5000 $ × 0.92
    expect(t).toContain('20.0 %');
  });
});
