import { describe, expect, it } from 'vitest';
import { paperEquitySeries, tradesToFills } from './equity';
import type { PaperTrade } from '../../types';

const t = (id: string, date: string, type: 'buy' | 'sell', quantity: number, priceUsd: number, feeUsd = 0): PaperTrade => ({ id, coinId: 'solana', symbol: 'sol', name: 'Solana', date, time: `${date}T10:00:00.000Z`, type, quantity, priceUsd, feeUsd, portfolioId: 'p1' });

describe('courbe d’un portefeuille papier', () => {
  it('achat puis vente sur trois jours', () => {
    const closes = new Map([['solana', new Map([['2026-11-01', 110], ['2026-11-02', 120], ['2026-11-03', 90]])]]);
    const r = paperEquitySeries(1000, [t('a', '2026-11-01', 'buy', 2, 100, 0.2), t('b', '2026-11-03', 'sell', 1, 95, 0.1)], closes, '2026-11-01', '2026-11-03');
    expect(r.partial).toBe(false);
    expect(r.series.map((p) => p.day)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(r.series[0].valueUsd).toBeCloseTo(799.8 + 2 * 110, 9);
    expect(r.series[1].valueUsd).toBeCloseTo(799.8 + 2 * 120, 9);
    expect(r.series[2].valueUsd).toBeCloseTo(799.8 + 95 - 0.1 + 90, 9);
    expect(r.series[2].cashUsd).toBeCloseTo(894.7, 9);
  });
  it('jour sans clôture : dernier prix connu, valorisation partielle, jamais zéro', () => {
    const closes = new Map([['solana', new Map([['2026-11-01', 110]])]]);
    const r = paperEquitySeries(1000, [t('a', '2026-11-01', 'buy', 2, 100)], closes, '2026-11-01', '2026-11-02');
    expect(r.partial).toBe(true);
    expect(r.series[1].valueUsd).toBeCloseTo(800 + 220, 9);
    const none = paperEquitySeries(1000, [t('a', '2026-11-01', 'buy', 2, 100)], new Map(), '2026-11-01', '2026-11-01');
    expect(none.series[0].valueUsd).toBeCloseTo(1000, 9);
  });
  it('exécutions converties pour les statistiques', () => {
    const f = tradesToFills([t('a', '2026-11-01', 'buy', 2, 100, 0.2)]);
    expect(f[0]).toMatchObject({ coinId: 'solana', side: 'buy', quantity: 2, priceUsd: 100, feeUsd: 0.2, marketUsd: 100, kind: 'market' });
  });
});
