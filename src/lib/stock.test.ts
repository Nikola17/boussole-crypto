import { describe, expect, it } from 'vitest';
import { dayBeforeFirst, matchManualEntries, missingStock } from './stock';
import type { Transaction } from '../types';

function tx(p: Partial<Transaction> & { id: string; type: Transaction['type']; coinId: string; quantity: number }): Transaction {
  return { symbol: p.coinId.slice(0, 3), name: p.coinId, date: '2026-08-01', price: 100, currency: 'USD', fee: 0, fxEurPerUsd: 0.9, ...p };
}

describe('ventes sans stock', () => {
  it('un journal cohérent n’a rien de manquant', () => {
    expect(missingStock([tx({ id: '1', type: 'buy', coinId: 'bitcoin', quantity: 1 }), tx({ id: '2', type: 'sell', coinId: 'bitcoin', quantity: 0.4, date: '2026-08-02' })])).toEqual([]);
  });

  it('une vente avant tout achat : la quantité d’ouverture manquante est chiffrée', () => {
    const r = missingStock([tx({ id: '1', type: 'sell', coinId: 'usd-coin', symbol: 'usdc', quantity: 150 }), tx({ id: '2', type: 'buy', coinId: 'usd-coin', symbol: 'usdc', quantity: 100, date: '2026-08-03' })]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ coinId: 'usd-coin', missing: 150, count: 1 });
  });

  it('plusieurs ventes : on ne compte que le déficit total à couvrir, pas la somme des ventes', () => {
    const r = missingStock([
      tx({ id: '1', type: 'buy', coinId: 'eth', quantity: 1 }),
      tx({ id: '2', type: 'sell', coinId: 'eth', quantity: 3, date: '2026-08-02' }),
      tx({ id: '3', type: 'buy', coinId: 'eth', quantity: 5, date: '2026-08-03' }),
      tx({ id: '4', type: 'withdraw', coinId: 'eth', quantity: 1, date: '2026-08-04' }),
    ]);
    expect(r[0].missing).toBeCloseTo(2); // 1 acheté, 3 vendus : il manquait 2
  });

  it('les transferts entre comptes et les récompenses ne créent pas de manque', () => {
    expect(missingStock([tx({ id: '1', type: 'reward', coinId: 'sol', quantity: 2 }), tx({ id: '2', type: 'transfer', coinId: 'sol', quantity: 2, date: '2026-08-02', accountId: 'a', toAccountId: 'b' })])).toEqual([]);
  });

  it('jour du solde d’ouverture : la veille de la première opération', () => {
    expect(dayBeforeFirst([tx({ id: '1', type: 'buy', coinId: 'x', quantity: 1, date: '2026-08-01' }), tx({ id: '2', type: 'buy', coinId: 'x', quantity: 1, date: '2026-09-01' })])).toBe('2026-07-31');
    expect(dayBeforeFirst([tx({ id: '1', type: 'buy', coinId: 'x', quantity: 1, date: '2026-01-01' })])).toBe('2025-12-31');
  });
});

describe('doublons entre tes saisies et un import', () => {
  const manual = tx({ id: 'm1', type: 'buy', coinId: 'bitcoin', quantity: 0.0001, date: '2026-11-03', source: 'dca', accountId: 'cdc' });
  const imported = (over: Partial<Transaction> = {}) => tx({ id: 'i1', type: 'buy', coinId: 'bitcoin', quantity: 0.000101, date: '2026-11-03', source: 'import', accountId: 'cdc', ...over });

  it('même crypto, type, compte, date proche et quantité à ±1 % : rapprochés', () => {
    expect(matchManualEntries([manual], [imported()])).toEqual([{ incomingId: 'i1', existingId: 'm1' }]);
  });

  it('un décalage d’un jour (heure locale / UTC) reste rapproché ; deux jours non', () => {
    expect(matchManualEntries([manual], [imported({ date: '2026-11-04' })])).toHaveLength(1);
    expect(matchManualEntries([manual], [imported({ date: '2026-11-05' })])).toHaveLength(0);
  });

  it('quantité trop différente, autre type, autre crypto ou autre compte : pas rapprochés', () => {
    expect(matchManualEntries([manual], [imported({ quantity: 0.00012 })])).toHaveLength(0);
    expect(matchManualEntries([manual], [imported({ type: 'sell' })])).toHaveLength(0);
    expect(matchManualEntries([manual], [imported({ coinId: 'ethereum' })])).toHaveLength(0);
    expect(matchManualEntries([manual], [imported({ accountId: 'ledger' })])).toHaveLength(0);
  });

  it('une saisie sans compte précis est rapprochée quel que soit le compte de l’import', () => {
    expect(matchManualEntries([{ ...manual, accountId: undefined }], [imported()])).toHaveLength(1);
  });

  it('une saisie ne sert qu’une fois : deux achats identiques importés ne consomment pas la même', () => {
    const r = matchManualEntries([manual], [imported({ id: 'i1' }), imported({ id: 'i2' })]);
    expect(r).toHaveLength(1);
  });

  it('les lignes déjà importées ne sont jamais prises pour des saisies à remplacer', () => {
    expect(matchManualEntries([{ ...manual, source: 'import' }], [imported()])).toHaveLength(0);
  });

  it('le meilleur candidat est choisi (date et quantité les plus proches)', () => {
    const far = { ...manual, id: 'far', date: '2026-11-04', quantity: 0.000103 };
    const r = matchManualEntries([far, manual], [imported()]);
    expect(r).toEqual([{ incomingId: 'i1', existingId: 'm1' }]);
  });
});
