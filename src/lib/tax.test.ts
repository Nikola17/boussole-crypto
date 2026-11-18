import { describe, expect, it } from 'vitest';
import { computeFrenchTax, simulateSale, taxYearCsv, EXEMPTION_THRESHOLD_EUR } from './tax';
import type { Transaction } from '../types';

const tx = (o: Partial<Transaction>): Transaction => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  date: '2026-03-10',
  coinId: 'bitcoin',
  symbol: 'BTC',
  name: 'Bitcoin',
  type: 'buy',
  quantity: 0.01,
  price: 50000,
  currency: 'EUR',
  fee: 0,
  fxEurPerUsd: 0.92,
  ...o,
});

describe('computeFrenchTax', () => {
  it('impute la fraction A×C/V et exonère sous 305 € de cessions', () => {
    const txs = [
      tx({ id: 'a', date: '2026-01-05', type: 'buy', quantity: 0.01, price: 40000, fromFiat: true }),
      tx({ id: 's', date: '2026-06-01', type: 'sell', quantity: 0.005, price: 100000, toFiat: true, portfolioValueEur: 500, fee: 10 }),
    ];
    const r = computeFrenchTax(txs, 31.4);
    expect(r.years).toHaveLength(1);
    const y = r.years[0];
    expect(y.year).toBe(2026);
    expect(y.totalCessions).toBeCloseTo(500 - 10); // C net de frais
    expect(y.exempt).toBe(false); // 490 € > 305 € → imposable
  });

  it('calcule la plus-value C − A×C/V quand V est renseignée', () => {
    const txs = [
      tx({ id: 'a', date: '2026-01-05', type: 'buy', quantity: 1, price: 1000, fromFiat: true }),
      tx({ id: 's', date: '2026-06-01', type: 'sell', quantity: 1, price: 2000, toFiat: true, portfolioValueEur: 2000, fee: 0 }),
    ];
    const r = computeFrenchTax(txs);
    const y = r.years[0];
    expect(y.totalCessions).toBeCloseTo(2000);
    expect(y.exempt).toBe(false); // > 305 €
    // A = 1000, C = 2000, V = 2000 → fraction = 1000, gain = 1000
    expect(y.netGain).toBeCloseTo(1000);
    expect(y.tax).toBeCloseTo(1000 * 0.314);
    expect(y.incomplete).toBe(false);
  });

  it('les échanges crypto→crypto (toFiat: false) ne sont pas des cessions', () => {
    const txs = [
      tx({ id: 'a', date: '2026-01-05', type: 'buy', quantity: 1, price: 1000, fromFiat: true }),
      tx({ id: 's', date: '2026-06-01', type: 'sell', quantity: 1, price: 5000, toFiat: false }),
    ];
    expect(computeFrenchTax(txs).years).toHaveLength(0);
  });
});

describe('simulateSale', () => {
  it('exonère si le cumul des cessions reste sous le seuil', () => {
    const s = simulateSale(200, 10000, 5000, 31.4, 100);
    expect(s.exempt).toBe(true);
    expect(s.tax).toBe(0);
    expect(s.net).toBe(200);
  });
});

describe('taxYearCsv', () => {
  it('produit un CSV point-virgule avec en-tête et ligne TOTAL', () => {
    const txs = [
      tx({ id: 'a', date: '2026-01-05', type: 'buy', quantity: 1, price: 1000, fromFiat: true }),
      tx({ id: 's', date: '2026-06-01', type: 'sell', quantity: 1, price: 2000, toFiat: true, portfolioValueEur: 2000 }),
    ];
    const y = computeFrenchTax(txs).years[0];
    const csv = taxYearCsv(y);
    const lines = csv.split('\r\n');
    expect(lines[0]).toContain('Prix de cession');
    expect(lines).toHaveLength(3); // en-tête + cession + TOTAL
    expect(lines[2]).toContain('TOTAL');
    expect(lines[2]).toContain('2000.00');
    expect(EXEMPTION_THRESHOLD_EUR).toBe(305);
  });
});
