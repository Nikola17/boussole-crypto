// Données v3 du papier : migration, plusieurs portefeuilles, suppression en cascade propagée.
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateState } from './persistence';
import { useStore } from './useStore';
import type { PaperDayLog, PaperOrder, PaperPortfolio, PaperTrade } from '../types';

const trade = (id: string, ghost?: true): PaperTrade => ({ id, coinId: 'solana', symbol: 'sol', name: 'Solana', date: '2026-10-02', type: 'buy', quantity: 1, priceUsd: 150, feeUsd: 0.15, ...(ghost ? { ghost } : {}) });

describe('migration 2 → 3', () => {
  it('crée « Papier manuel » et y range les ordres non fantômes', () => {
    const v2 = { paper: { enabled: true, startingUsd: 2000, resetAt: '2026-10-01T09:00:00.000Z' }, paperTrades: [trade('a'), trade('b'), trade('c'), trade('g', true)] };
    const out = migrateState(JSON.parse(JSON.stringify(v2)), 2) as Record<string, unknown>;
    const pf = out.paperPortfolios as PaperPortfolio[];
    expect(pf).toHaveLength(1);
    expect(pf[0]).toMatchObject({ id: 'manuel', name: 'Papier manuel', kind: 'manual', startingUsd: 2000, createdAt: '2026-10-01T09:00:00.000Z', costs: { preset: 'exchange', feePct: 0.1, spreadPct: 0.05 } });
    const trades = out.paperTrades as PaperTrade[];
    expect(trades.filter((t) => t.portfolioId === 'manuel').map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(trades.find((t) => t.id === 'g')?.portfolioId).toBeUndefined();
    expect(out.paperOrders).toEqual([]);
    expect(out.paperDays).toEqual([]);
    expect(out.paper).toBeUndefined(); // repris dans « Papier manuel », puis retiré en v5
    expect(migrateState(JSON.parse(JSON.stringify(out)), 3)).toEqual(out);
  });
  it('sans réglage du papier : date du premier ordre', () => {
    const out = migrateState({ paperTrades: [trade('a')] }, 2) as Record<string, unknown>;
    expect((out.paperPortfolios as PaperPortfolio[])[0]).toMatchObject({ startingUsd: 1000, createdAt: '2026-10-02' });
  });
});

describe('suppression d’un portefeuille', () => {
  beforeEach(() => useStore.getState().resetAll());
  it('emporte ses ordres, exécutions et journaux, et propage les suppressions', () => {
    const s = useStore.getState();
    const p: PaperPortfolio = { id: 'p1', name: 'Test', kind: 'auto', startingUsd: 1000, createdAt: '2026-11-01T00:00:00.000Z', costs: { preset: 'exchange', feePct: 0.1, spreadPct: 0.05 } };
    s.upsertPaperPortfolio(p);
    s.upsertPaperTrade({ ...trade('t1'), portfolioId: 'p1' });
    s.upsertPaperTrade(trade('t2', true));
    s.upsertPaperOrder({ id: 'o1', portfolioId: 'p1', coinId: 'solana', symbol: 'sol', name: 'Solana', side: 'sell', type: 'stop', price: 100, createdAt: 'x', expiresAt: 'y', status: 'open' } as PaperOrder);
    s.applyPaperDays([{ id: 'p1:2026-11-02', portfolioId: 'p1', day: '2026-11-02', decidedOn: '2026-11-01', rules: 'r', depositUsd: 0, fills: [], skipped: [], by: 'pc' } as PaperDayLog]);
    useStore.getState().removePaperPortfolio('p1');
    const after = useStore.getState();
    expect(after.paperPortfolios.map((p) => p.id)).toEqual(['manuel']); // le portefeuille manuel d'une installation neuve reste
    expect(after.paperOrders).toHaveLength(0);
    expect(after.paperDays).toHaveLength(0);
    expect(after.paperTrades.map((t) => t.id)).toEqual(['t2']);
    const keys = after.deletions.map((d) => d.key).sort();
    expect(keys).toEqual(['paperDays/p1:2026-11-02', 'paperOrders/o1', 'paperPortfolios/p1', 'paperTrades/t1']);
  });
});

describe('journaux d’autopilote', () => {
  beforeEach(() => useStore.getState().resetAll());
  it('un journal identique venu d’un autre appareil n’est pas réécrit', () => {
    const d: PaperDayLog = { id: 'p1:2026-11-02', portfolioId: 'p1', day: '2026-11-02', decidedOn: '2026-11-01', rules: 'r', depositUsd: 25, fills: [], skipped: [], by: 'pc' };
    useStore.getState().applyPaperDays([d]);
    const first = useStore.getState().paperDays[0];
    useStore.getState().applyPaperDays([{ ...d, by: 'vps' }]);
    expect(useStore.getState().paperDays[0]).toBe(first);
    useStore.getState().applyPaperDays([{ ...d, depositUsd: 30 }]);
    expect(useStore.getState().paperDays[0].depositUsd).toBe(30);
  });
});

describe('migration 3 → 4', () => {
  it('ajoute les relevés, les mouvements suivis et les relevés de pépites', () => {
    const out = migrateState({ paperTrades: [], paperPortfolios: [], paperOrders: [], paperDays: [] }, 3) as Record<string, unknown>;
    expect(out.portfolioSnapshots).toEqual([]);
    expect(out.smartMoves).toEqual([]);
    expect(out.pickSnapshots).toEqual([]);
  });
});
