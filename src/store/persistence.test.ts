import { describe, expect, it } from 'vitest';
import type { StateStorage } from 'zustand/middleware';
import { DATA_VERSION } from '../lib/backup';
import { guardedStorage, migrateState, stripHeavy, type StorageStatus } from './persistence';
import { exportBackup, useStore } from './useStore';

/** Faux stockage avec une capacité limitée (nombre de caractères), comme localStorage. */
function fakeBackend(capacity = Infinity, initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const backend: StateStorage = {
    getItem: (n) => data.get(n) ?? null,
    setItem: (n, v) => {
      const total = [...data.entries()].filter(([k]) => k !== n).reduce((s, [, x]) => s + x.length, 0) + v.length;
      if (total > capacity) throw new DOMException('quota', 'QuotaExceededError');
      data.set(n, v);
    },
    removeItem: (n) => void data.delete(n),
  };
  return { backend, data };
}

const payload = (state: Record<string, unknown>, version = DATA_VERSION) => JSON.stringify({ state, version });

describe('migration des données enregistrées', () => {
  it('la version actuelle ne transforme rien', () => {
    const s = { transactions: [{ id: 'a' }] };
    expect(migrateState(s, DATA_VERSION)).toBe(s);
  });

  it('des données plus récentes sont rendues telles quelles', () => {
    const s = { x: 1 };
    expect(migrateState(s, DATA_VERSION + 3)).toBe(s);
  });
});

describe('stockage protégé', () => {
  it('écrit et relit normalement', () => {
    const { backend, data } = fakeBackend();
    const seen: StorageStatus[] = [];
    const st = guardedStorage(backend, (s) => seen.push(s));
    st.setItem('k', payload({ transactions: [1] }));
    expect(data.get('k')).toContain('transactions');
    expect(st.getItem('k')).toBe(data.get('k'));
    expect(seen).toEqual([]); // l'état « ok » ne change pas : aucune notification
  });

  it('stockage plein : les rapports IA et le chat sont écartés, les transactions sont gardées', () => {
    const big = 'x'.repeat(5000);
    const state = { transactions: [{ id: 't' }], reports: [{ id: 'r', markdown: big }], chat: [{ id: 'c', content: big }] };
    const { backend, data } = fakeBackend(2000);
    const seen: StorageStatus[] = [];
    guardedStorage(backend, (s) => seen.push(s)).setItem('k', payload(state));
    const saved = JSON.parse(data.get('k') as string);
    expect(saved.state.transactions).toEqual([{ id: 't' }]);
    expect(saved.state.reports).toEqual([]);
    expect(saved.state.chat).toEqual([]);
    expect(seen.map((s) => s.kind)).toEqual(['trimmed']);
  });

  it('stockage vraiment plein : signale l’échec, sans lever d’erreur', () => {
    const { backend, data } = fakeBackend(10);
    const seen: StorageStatus[] = [];
    const st = guardedStorage(backend, (s) => seen.push(s));
    expect(() => st.setItem('k', payload({ transactions: [{ id: 'a' }] }))).not.toThrow();
    expect(data.has('k')).toBe(false);
    expect(seen.map((s) => s.kind)).toEqual(['failed']);
  });

  it('revient à « ok » quand l’écriture réussit de nouveau', () => {
    const { backend } = fakeBackend(300);
    const seen: StorageStatus[] = [];
    const st = guardedStorage(backend, (s) => seen.push(s));
    st.setItem('k', payload({ transactions: ['x'.repeat(2000)] }));
    st.setItem('k', payload({ transactions: [] }));
    expect(seen.map((s) => s.kind)).toEqual(['failed', 'ok']);
  });

  it('données d’une version plus récente : lecture seule, rien n’est réécrit ni supprimé', () => {
    const original = payload({ transactions: [{ id: 'futur' }] }, DATA_VERSION + 1);
    const { backend, data } = fakeBackend(Infinity, { k: original });
    const seen: StorageStatus[] = [];
    const st = guardedStorage(backend, (s) => seen.push(s));
    expect(st.getItem('k')).toBe(original);
    st.setItem('k', payload({ transactions: [] }));
    st.removeItem('k');
    expect(data.get('k')).toBe(original);
    expect(seen).toEqual([{ kind: 'newer', version: DATA_VERSION + 1 }]);
  });

  it('données d’une version plus ancienne : copie de précaution avant migration', () => {
    const old = payload({ transactions: [] }, DATA_VERSION - 1);
    const { backend, data } = fakeBackend(Infinity, { k: old });
    guardedStorage(backend, () => undefined).getItem('k');
    expect(data.get(`k.avant-v${DATA_VERSION - 1}`)).toBe(old);
  });

  it('stripHeavy : ne touche à rien d’autre, refuse un contenu illisible', () => {
    const out = JSON.parse(stripHeavy(payload({ a: 1, reports: [1], chat: [2] })) as string);
    expect(out.state).toEqual({ a: 1, reports: [], chat: [] });
    expect(out.version).toBe(DATA_VERSION);
    expect(stripHeavy('pas du json')).toBeNull();
    expect(stripHeavy('{"x":1}')).toBeNull();
  });
});

describe('données de l’application (store)', () => {
  it('l’export ne contient aucune clé API et porte la version des données', () => {
    useStore.getState().setSettings({ anthropicKey: 'sk-ant-secret', compatKey: 'sk-nous-secret', coingeckoKey: 'CG-secret' });
    const json = exportBackup(false);
    expect(json).not.toContain('secret');
    const data = JSON.parse(json);
    expect(data.version).toBe(DATA_VERSION);
    expect(data.app).toBe('boussole-crypto');
    expect(data.transactions).toEqual([]);
  });

  it('importAll ne change ni les clés, ni le serveur d’IA de l’appareil, et ignore les rubriques inconnues', () => {
    useStore.getState().setSettings({ compatKey: 'sk-nous-local', compatBaseUrl: 'https://inference-api.nousresearch.com/v1' });
    useStore.getState().importAll({ watchlist: ['bitcoin'], settings: { currency: 'USD' }, cheval: 'de Troie' } as never);
    const s = useStore.getState();
    expect(s.watchlist).toEqual(['bitcoin']);
    expect(s.settings.currency).toBe('USD');
    expect(s.settings.compatKey).toBe('sk-nous-local');
    expect(s.settings.compatBaseUrl).toBe('https://inference-api.nousresearch.com/v1');
    expect((s as unknown as Record<string, unknown>).cheval).toBeUndefined();
  });

  it('les rapports récents gardent le détail du comité, les anciens non', () => {
    useStore.getState().resetAll();
    const mk = (i: number) => ({ id: `r${i}`, kind: 'committee' as const, title: 't', createdAt: 'x', day: 'x', model: 'm', markdown: 'm', parts: [{ title: 'a', markdown: 'b' }] });
    for (let i = 0; i < 30; i++) useStore.getState().addReport(mk(i));
    const reports = useStore.getState().reports;
    expect(reports).toHaveLength(25);
    expect(reports[0].parts).toBeDefined();
    expect(reports[5].parts).toBeDefined();
    expect(reports[6].parts).toBeUndefined();
  });
});

describe('échéances : une écriture, et annuler une échéance retire ses transactions', () => {
  const t = (id: string): import('../types').Transaction => ({ id, coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', date: '2026-11-10', type: 'buy', quantity: 0.001, price: 80000, currency: 'USD', fee: 0, fxEurPerUsd: 0.87 });
  const basket = { id: 'b', name: 'P', active: true, amountUsd: 25, daysOfWeek: [2, 5], startDate: '2026-01-01', discoveryMaxPct: 50, core: [], discovery: [], reserveUsd: 10, minOrderUsd: 5, reminder: true, createdAt: '' };

  it('panier : les transactions entrent avec l’échéance, la réserve est mise à jour, et tout sort ensemble', () => {
    useStore.getState().resetAll();
    useStore.getState().upsertTransaction(t('ancienne'));
    useStore.getState().setBasket(basket);
    useStore.getState().addBasketExecution({ id: 'e1', basketId: 'b', periodKey: '2026-11-10', date: '2026-11-10', orders: [], investedUsd: 20, reserveDeltaUsd: 5 }, [t('a'), t('b')]);
    let s = useStore.getState();
    expect(s.transactions.map((x) => x.id).sort()).toEqual(['a', 'ancienne', 'b']);
    expect(s.basketExecutions[0].txIds).toEqual(['a', 'b']);
    expect(s.basket?.reserveUsd).toBe(15);
    s.removeBasketExecution('e1');
    s = useStore.getState();
    expect(s.transactions.map((x) => x.id)).toEqual(['ancienne']);
    expect(s.basket?.reserveUsd).toBe(10);
  });

  it('DCA : même principe', () => {
    useStore.getState().resetAll();
    useStore.getState().addDcaExecution({ id: 'd1', planId: 'p', periodKey: 'k', date: '2026-11-10', amount: 25, price: 80000, quantity: 0.0003, multiplier: 1 }, [t('x')]);
    expect(useStore.getState().transactions).toHaveLength(1);
    expect(useStore.getState().dcaExecutions[0].txIds).toEqual(['x']);
    useStore.getState().removeDcaExecution('d1');
    expect(useStore.getState().transactions).toHaveLength(0);
  });

  it('une échéance « passée » (sans transaction) s’annule sans toucher au journal', () => {
    useStore.getState().resetAll();
    useStore.getState().upsertTransaction(t('garde'));
    useStore.getState().addDcaExecution({ id: 'd2', planId: 'p', periodKey: 'k', date: '2026-11-10', amount: 0, price: 0, quantity: 0, multiplier: 1, skipped: true });
    useStore.getState().removeDcaExecution('d2');
    expect(useStore.getState().transactions.map((x) => x.id)).toEqual(['garde']);
  });

  it('import : remplace les saisies désignées, ajoute les soldes d’ouverture, en une écriture', () => {
    useStore.getState().resetAll();
    useStore.getState().upsertTransaction(t('manuelle'));
    useStore.getState().upsertTransaction(t('autre'));
    const res = useStore.getState().importTransactions([t('i1'), t('i2')], { replaceIds: ['manuelle'], extra: [t('open-1'), t('open-1')] });
    expect(res).toEqual({ added: 2, skipped: 0, replaced: 1, extra: 1 });
    expect(useStore.getState().transactions.map((x) => x.id).sort()).toEqual(['autre', 'i1', 'i2', 'open-1']);
    // réimporter le même fichier ne duplique rien
    const again = useStore.getState().importTransactions([t('i1'), t('i2')], { replaceIds: [], extra: [t('open-1')] });
    expect(again).toMatchObject({ added: 0, skipped: 2, extra: 0 });
  });
});
