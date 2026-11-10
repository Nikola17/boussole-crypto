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
