import { describe, expect, it } from 'vitest';
import { journalEquity, periodStats } from './equity';
import type { Transaction } from '../../types';

const tx = (id: string, date: string, type: Transaction['type'], quantity: number, price: number, over: Partial<Transaction> = {}): Transaction => ({ id, coinId: 'solana', symbol: 'sol', name: 'Solana', date, type, quantity, price, currency: 'USD', fee: 0, fxEurPerUsd: 0.9, ...over });
const closes = new Map([['solana', new Map([['2026-01-01', 110], ['2026-01-02', 120], ['2026-01-03', 130], ['2026-01-04', 100]])]]);

describe('courbe du portefeuille reconstituée d’après le journal', () => {
  it('achat, transfert entre comptes, vente vers l’euro, retrait', () => {
    const txs = [
      tx('a', '2026-01-01', 'buy', 1, 100, { fromFiat: true }),
      tx('t', '2026-01-02', 'transfer', 1, 0, { accountId: 'cdc', toAccountId: 'ledger' }),
      tx('s', '2026-01-03', 'sell', 0.5, 130, { toFiat: true }),
    ];
    const r = journalEquity(txs, closes, '2026-01-01', '2026-01-04');
    expect(r.missing).toEqual([]);
    expect(r.series.map((p) => [p.day, p.valueUsd, p.flowUsd])).toEqual([
      ['2026-01-01', 110, 100], ['2026-01-02', 120, 0], ['2026-01-03', 65, -65], ['2026-01-04', 50, 0],
    ]);
  });
  it('le transfert ne change pas la performance', () => {
    const base = [tx('a', '2026-01-01', 'buy', 1, 100, { fromFiat: true })];
    const withTransfer = [...base, tx('t', '2026-01-02', 'transfer', 1, 0, { accountId: 'x', toAccountId: 'y' })];
    expect(periodStats(journalEquity(withTransfer, closes, '2026-01-01', '2026-01-04').series).twrPct).toBeCloseTo(periodStats(journalEquity(base, closes, '2026-01-01', '2026-01-04').series).twrPct, 9);
  });
  it('performance pondérée par le temps et par l’argent, baisse maximale, mois', () => {
    const s = journalEquity([tx('a', '2026-01-01', 'buy', 1, 100, { fromFiat: true })], closes, '2026-01-01', '2026-01-04').series;
    const st = periodStats(s);
    expect(st.twrPct).toBeCloseTo((100 / 110 - 1) * 100, 9); // la base est le premier jour (110)
    expect(st.maxDrawdownPct).toBeCloseTo((100 / 130 - 1) * 100, 9);
    expect(st.bestMonth?.month).toBe('2026-01');
  });
  it('crypto sans prix : signalée, valorisée au dernier prix connu, jamais à zéro', () => {
    const r = journalEquity([tx('b', '2026-01-02', 'buy', 2, 5, { coinId: 'obscure', symbol: 'obs', fromFiat: true })], closes, '2026-01-02', '2026-01-03');
    expect(r.missing).toEqual(['obscure']);
    expect(r.series.map((p) => p.valueUsd)).toEqual([10, 10]);
  });
});
