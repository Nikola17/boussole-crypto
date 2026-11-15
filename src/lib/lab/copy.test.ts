import { describe, expect, it } from 'vitest';
import { copyReport, copySize, copyText } from './copy';
import type { PaperDayLog, PaperFill, TradeEntry, Transaction } from '../../types';
import type { TrustVerdict } from './trust';

const fill = (coinId: string, priceUsd: number, quantity: number, at: string, side: 'buy' | 'sell' = 'buy'): PaperFill => ({
  coinId, symbol: coinId.slice(0, 3), name: coinId, side, kind: 'market', quantity, marketUsd: priceUsd, priceUsd, feeUsd: 0, at, reason: 'échéance',
});
const log = (day: string, fills: PaperFill[]): PaperDayLog => ({ id: `p1:${day}`, portfolioId: 'p1', day, decidedOn: day, rules: 'x', depositUsd: 0, fills, skipped: [], by: 'pc' });
const tx = (coinId: string, day: string, price: number, quantity: number, time?: string): Transaction => ({
  id: `t-${coinId}-${day}`, coinId, symbol: coinId.slice(0, 3), name: coinId, date: day, type: 'buy', quantity, price, currency: 'USD', fee: 0, fxEurPerUsd: 0.9, time,
  copyOf: { portfolioId: 'p1', day, coinId },
});

const LOGS = [
  log('2026-11-01', [fill('bitcoin', 100, 1, '2026-11-01T08:00:00.000Z'), fill('ethereum', 10, 10, '2026-11-01T08:00:00.000Z')]),
  log('2026-11-08', [fill('bitcoin', 100, 1, '2026-11-08T08:00:00.000Z'), fill('ethereum', 10, 10, '2026-11-08T08:00:00.000Z')]),
  log('2026-11-15', [fill('solana', 50, 2, '2026-11-15T08:00:00.000Z')]),
];
const LAST = (id: string) => ({ bitcoin: 110, ethereum: 10, solana: 50 }[id] ?? null);

describe('copie en réel', () => {
  it('5 ordres dont 3 copiés : écart moyen, délai, résultat réel contre papier', () => {
    const txs = [
      tx('bitcoin', '2026-11-01', 101, 1, '2026-11-01T10:00:00.000Z'), // payé 1 % plus cher : écart −0,99 %
      tx('ethereum', '2026-11-01', 10, 10),
      tx('bitcoin', '2026-11-08', 100, 1),
      { ...tx('solana', '2026-11-15', 50, 2), copyOf: undefined }, // pas une copie
    ];
    const r = copyReport(LOGS, txs, [], LAST);
    expect(r.orders).toBe(5);
    expect(r.copied).toBe(3);
    expect(r.lines.find((l) => l.symbol === 'bit' && l.day === '2026-11-01')).toMatchObject({ paperUsd: 100, realUsd: 101, delayH: 2 });
    expect(r.lines[0].slipPct).toBeCloseTo(-0.990, 2);
    expect(r.avgSlipPct).toBeCloseTo(-0.330, 2);
    // Papier, mêmes 3 ordres (BTC, ETH, BTC) : coût 300, valeur 110 + 100 + 110 = 320 ; réel : coût 301
    expect(r.paperPct).toBeCloseTo((320 / 300 - 1) * 100, 5);
    expect(r.realPct).toBeCloseTo((320 / 301 - 1) * 100, 5);
    expect(r.lines.filter((l) => l.realUsd == null)).toHaveLength(2);
  });
  it('une transaction corrigée après coup met le rapport à jour', () => {
    const before = copyReport(LOGS, [tx('bitcoin', '2026-11-01', 101, 1)], [], LAST);
    const after = copyReport(LOGS, [tx('bitcoin', '2026-11-01', 100, 1)], [], LAST);
    expect(before.avgSlipPct).toBeLessThan(0);
    expect(after.avgSlipPct).toBeCloseTo(0, 10);
  });
  it('un trade copié compte, au prix de sortie s’il est clos', () => {
    const trade: TradeEntry = { id: 'tr', coinId: 'solana', symbol: 'sol', side: 'long', status: 'closed', entryDate: '2026-11-15', entryPrice: 50, quantity: 2, exitPrice: 55, leverage: 1, fees: 0, setup: 'autopilote', copyOf: { portfolioId: 'p1', day: '2026-11-15', coinId: 'solana' } };
    const r = copyReport(LOGS, [], [trade], LAST);
    expect(r.copied).toBe(1);
    expect(r.realPct).toBeCloseTo(10, 5);
    expect(r.paperPct).toBeCloseTo(0, 5);
  });
  it('texte du rapport, au format de la fiche', () => {
    expect(copyText({ orders: 15, copied: 12, avgSlipPct: -0.8, realPct: 3.1, paperPct: 4.6, lines: [] })).toBe(
      'Copie en réel : 12 ordres sur 15. Écart moyen à l’exécution : −0,8 %.\nRésultat réel +3,1 % ; papier, sur les mêmes ordres, +4,6 %.',
    );
  });
  it('combien mettre : rien sous « encourageant », sinon le plus petit de la part et du risque', () => {
    const v = (level: TrustVerdict['level'], copyPct: number | null): TrustVerdict => ({ level, headline: '', criteria: [], copyPct });
    expect(copySize(v('observation', null), 10_000, 5, 1)).toBeNull();
    expect(copySize(v('encourageant', 5), 10_000, null, 1)).toBe(500);
    expect(copySize(v('fiable', 15), 10_000, 8, 1)).toBe(1250); // 1 % de 10 000 ÷ 8 % de stop = 1 250 < 1 500
  });
});
