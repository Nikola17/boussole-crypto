import { QueryClient } from '@tanstack/query-core';
import { describe, expect, it } from 'vitest';
import { buildSnapshot, isPersisted, MAX_AGE_MS, restoreSnapshot } from './queryCache';
import { freshness, STALE_AFTER_MS } from './freshness';

const NOW = Date.parse('2026-11-10T20:00:00Z');

function client() {
  return new QueryClient();
}

describe('données de marché gardées d’un lancement à l’autre', () => {
  it('seules les requêtes utiles au Cockpit sont conservées', () => {
    expect(isPersisted(['markets', 1])).toBe(true);
    expect(isPersisted(['btc-history'])).toBe(true);
    expect(isPersisted(['fx'])).toBe(true);
    expect(isPersisted(['wallet', 'id'])).toBe(false);
    expect(isPersisted(['scan', 'a,b'])).toBe(false);
  });

  it('un instantané ne contient que les requêtes réussies et non vides', () => {
    const qc = client();
    qc.setQueryData(['markets', 1], [{ id: 'bitcoin', current_price: 80000 }], { updatedAt: NOW - 60_000 });
    qc.setQueryData(['fx'], 0.87, { updatedAt: NOW - 60_000 });
    qc.setQueryData(['funding'], null as unknown as number); // pas de donnée
    qc.setQueryData(['btc-history'], []); // vide
    qc.setQueryData(['scan', 'x'], { gros: 'calcul' }); // pas dans la liste
    const snap = buildSnapshot(qc, NOW);
    expect(snap.v).toBe(1);
    expect(snap.entries.map((e) => String(e.key[0])).sort()).toEqual(['fx', 'markets']);
    expect(snap.entries.find((e) => e.key[0] === 'markets')?.updatedAt).toBe(NOW - 60_000);
  });

  it('une requête dont l’actualisation a échoué garde ses anciennes données dans l’instantané (cache hors ligne durable)', async () => {
    const qc = client();
    qc.setQueryData(['markets', 1], [{ id: 'bitcoin', current_price: 80000 }], { updatedAt: NOW - 3 * 3600_000 });
    await qc.fetchQuery({ queryKey: ['markets', 1], queryFn: () => Promise.reject(new Error('réseau coupé')), retry: false, staleTime: 0 }).catch(() => undefined);
    expect(qc.getQueryState(['markets', 1])?.status).toBe('error');
    const snap = buildSnapshot(qc, NOW);
    expect(snap.entries).toHaveLength(1);
    expect(snap.entries[0].updatedAt).toBe(NOW - 3 * 3600_000);
  });

  it('la restauration remet les données et leur DATE d’origine (donc « anciennes », mais déjà affichables)', () => {
    const src = client();
    src.setQueryData(['markets', 1], [{ id: 'bitcoin', current_price: 80000 }], { updatedAt: NOW - 3 * 3600_000 });
    const snap = JSON.parse(JSON.stringify(buildSnapshot(src, NOW))); // passage par le stockage
    const dst = client();
    expect(restoreSnapshot(dst, snap, NOW)).toBe(1);
    expect(dst.getQueryData(['markets', 1])).toEqual([{ id: 'bitcoin', current_price: 80000 }]);
    expect(dst.getQueryState(['markets', 1])?.dataUpdatedAt).toBe(NOW - 3 * 3600_000);
  });

  it('des données de plus de 7 jours, du futur ou illisibles sont ignorées', () => {
    const dst = client();
    const entry = (updatedAt: number, key: unknown[] = ['fx']) => ({ key, data: 0.87, updatedAt });
    const n = restoreSnapshot(dst, { v: 1, savedAt: NOW, entries: [entry(NOW - MAX_AGE_MS - 1), entry(NOW + 3600_000), entry(NaN), entry(NOW - 1000, ['wallet', 'x']), { nimporte: 'quoi' }, null] }, NOW);
    expect(n).toBe(0);
    expect(restoreSnapshot(dst, null, NOW)).toBe(0);
    expect(restoreSnapshot(dst, { v: 2, entries: [] }, NOW)).toBe(0);
    expect(restoreSnapshot(dst, 'texte', NOW)).toBe(0);
    expect(dst.getQueryData(['fx'])).toBeUndefined();
  });
});

describe('fraîcheur des données', () => {
  it('récentes : pas d’alerte ; anciennes (plus de 20 minutes) : alerte avec la date', () => {
    expect(freshness(NOW - 5 * 60_000, NOW).stale).toBe(false);
    expect(freshness(NOW - STALE_AFTER_MS - 1000, NOW).stale).toBe(true);
    expect(freshness(0, NOW)).toEqual({ stale: false, label: '' });
  });
  it('l’étiquette dit « aujourd’hui » ou la date du jour concerné', () => {
    const today = freshness(NOW - 3600_000, NOW).label;
    expect(today.startsWith('d’aujourd’hui à ')).toBe(true);
    const old = freshness(NOW - 3 * 86_400_000, NOW).label;
    expect(old).toMatch(/^du \d{2}\/\d{2} à \d{2}:\d{2}$/);
  });
});
