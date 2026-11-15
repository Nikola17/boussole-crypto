// Fusion de deux appareils : la version la plus récente de chaque élément l'emporte, les suppressions
// se propagent, les horloges décalées ne causent aucune perte. `bundleOf`/`mergeBundles` sont pures.

import { describe, expect, it } from 'vitest';
import { bundleOf, mergeBundles, mergeBackupInto, sameSyncBundle, type SyncBundle } from './merge';
import type { SyncDeletion } from '../../types';

const T0 = '2026-11-01T10:00:00.000Z';
const T1 = '2026-11-05T10:00:00.000Z';
const T2 = '2026-11-09T10:00:00.000Z';
const NOW = Date.parse(T2);

const tx = (id: string, updatedAt?: string, price = 100) => ({ id, coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', type: 'buy', quantity: 1, price, updatedAt });

function pc(over: Partial<SyncBundle> = {}): SyncBundle {
  return {
    data: { transactions: [tx('a', T1), tx('b'), tx('c', T1)], profile: { name: 'Nico' }, basket: { id: 'panier', amountUsd: 50 } },
    deletions: [],
    stamps: { profile: T1, basket: T1 },
    ...over,
  };
}

describe('fusion de deux appareils', () => {
  it('un faisceau d’un appareil resté en 1.27 (thèses, checklist, papier) se fusionne sans erreur ; ces clés sont ignorées', () => {
    const old = { ...pc(), data: { ...pc().data, theses: [{ id: 't1', coinId: 'sol', updatedAt: T2 }], checklist: { a: true }, paper: { enabled: true } }, stamps: { profile: T1, basket: T1, checklist: T2, paper: T2 } } as unknown as SyncBundle;
    const m = mergeBundles(pc(), old, NOW);
    expect((m.data as Record<string, unknown>).theses).toBeUndefined();
    expect((m.data as Record<string, unknown>).checklist).toBeUndefined();
    expect((m.data as Record<string, unknown>).paper).toBeUndefined();
    expect(m.data.transactions).toHaveLength(3);
  });

  it('un élément modifié d’un côté arrive de l’autre', () => {
    const tel = pc({ data: { ...pc().data, transactions: [tx('a', T2, 120), tx('b'), tx('c', T1)] }, stamps: { profile: T1, basket: T1 } });
    const m = mergeBundles(pc(), tel, NOW);
    const a = (m.data.transactions as { id: string; price: number; updatedAt?: string }[]).find((x) => x.id === 'a');
    expect(a?.price).toBe(120);
    expect(m.changedFromA).toBeGreaterThan(0);
  });

  it('des modifications des deux côtés de la même ligne : la plus récente l’emporte (horloges décalées)', () => {
    const pcSide = pc({ data: { ...pc().data, transactions: [tx('a', T2, 150), tx('b'), tx('c', T1)] }, stamps: { profile: T1, basket: T1 } });
    const tel = pc({ data: { ...pc().data, transactions: [tx('a', T1, 120), tx('b'), tx('c', T0)] }, stamps: { profile: T0, basket: T1 } });
    const m = mergeBundles(pcSide, tel, NOW);
    const a = m.data.transactions as { id: string; price: number }[];
    expect(a.find((x) => x.id === 'a')?.price).toBe(150); // côté PC plus récent
    expect((m.data as { profile: { name: string } }).profile.name).toBe('Nico');
    expect(m.stamps.profile).toBe(T1);
  });

  it('une suppression d’un seul côté se propage, même si l’autre appareil n’a jamais rien vu de neuf', () => {
    const del: SyncDeletion[] = [{ key: 'transactions/b', at: T2 }];
    const tel = pc({ data: { ...pc().data, transactions: [tx('a', T1), tx('c', T1)] }, deletions: del, stamps: { profile: T1, basket: T1 } });
    const m = mergeBundles(pc(), tel, NOW);
    expect((m.data.transactions as { id: string }[]).map((x) => x.id).sort()).toEqual(['a', 'c']);
    expect(m.deletions).toContainEqual({ key: 'transactions/b', at: T2 });
  });

  it('un élément modifié APRÈS sa suppression ressuscite, pas avant', () => {
    const del: SyncDeletion[] = [{ key: 'transactions/a', at: T1 }];
    // téléphone : il a supprimé 'a', son état ne le contient plus.
    const tel = pc({ data: { ...pc().data, transactions: [tx('b'), tx('c', T1)], profile: { name: 'Nico' }, basket: pc().data.basket }, deletions: del, stamps: { profile: T1, basket: T1 } });
    // côté PC : l'élément 'a' modifié avant la suppression (T0) → il disparaît.
    const before = pc({ data: { ...pc().data, transactions: [tx('a', T0), tx('b'), tx('c', T1)] } });
    const m1 = mergeBundles(before, tel, NOW);
    expect((m1.data.transactions as { id: string }[]).map((x) => x.id)).not.toContain('a');
    // modifié après la suppression (T2) → il reste.
    const after = pc({ data: { ...pc().data, transactions: [tx('a', T2, 77), tx('b'), tx('c', T1)] } });
    const m2 = mergeBundles(after, tel, NOW);
    expect((m2.data.transactions as { id: string }[]).map((x) => x.id)).toContain('a');
  });

  it('deux ensembles identiques : aucun changement signalé de part et d’autre', () => {
    const m = mergeBundles(pc(), pc(), NOW);
    expect(m.changedFromA).toBe(0);
    expect(m.changedFromB).toBe(0);
    expect(m.deletions).toEqual([]);
  });

  it('les suppressions de plus de 180 jours sont élaguées', () => {
    const old: SyncDeletion[] = [{ key: 'transactions/ancien', at: '2026-01-01T00:00:00.000Z' }];
    const fresh: SyncDeletion[] = [{ key: 'transactions/recent', at: T1 }];
    const m = mergeBundles(pc({ deletions: old }), pc({ deletions: fresh }), NOW);
    expect(m.deletions.map((d) => d.key)).toEqual(['transactions/recent']);
  });

  it('bundleOf extrait exactement les rubriques synchronisées', () => {
    const b = bundleOf({
      transactions: [tx('a')],
      reports: [{ id: 'r' }],
      watchlist: ['bitcoin'],
      syncStamp: { watchlist: T1 },
      deletions: [],
    } as never);
    const data = (b as SyncBundle).data as Record<string, unknown>;
    expect(data.reports).toBeUndefined();
    expect(data.transactions).toHaveLength(1);
    expect((b as SyncBundle).stamps.watchlist).toBe(T1);
  });
});

describe('fusion d’un fichier de sauvegarde (import « Fusionner »)', () => {
  it('ajoute les inconnus, garde la version locale en cas de conflit (fichier v1 sans dates)', () => {
    const state = { transactions: [tx('local', T2, 50)], watchlist: ['bitcoin'], syncStamp: { profile: T1, basket: T1, watchlist: T1 }, deletions: [{ key: 'transactions/gone', at: T1 }] };
    const file = { version: 1, transactions: [tx('local', undefined, 999), tx('fichier', undefined, 80)], watchlist: ['ethereum'] };
    const m = mergeBackupInto(state, file);
    const ts = m.transactions as { id: string; price: number }[];
    expect(ts.find((x) => x.id === 'local')?.price).toBe(50); // conflit d'identifiant : la version locale, datée, gagne
    expect(ts.map((x) => x.id)).toContain('fichier'); // l'inconnu du fichier est ajouté
    expect(m.watchlist).toEqual(['bitcoin']); // le fichier n'a pas de date : l'appareil garde sa version
    expect(m.syncStamp.watchlist).toBe(T1);
    expect(m.checklist).toBeUndefined(); // rubrique absente des deux côtés : pas inventée
  });
});

describe('sameSyncBundle — décider de réécrire ou non le dépôt', () => {
  it('les champs de plomberie (device, savedAt) du fichier distant ne sont pas une différence', () => {
    const local = pc();
    const remote = { ...pc(), device: 'telephone-nico', savedAt: '2026-11-12T22:57:02Z' };
    expect(sameSyncBundle(local, remote)).toBe(true); // sinon le dépôt serait réécrit en boucle à chaque lecture
  });

  it('une vraie différence de contenu, si petite soit-elle, est vue', () => {
    const local = pc();
    const remote = { ...pc(), device: 'telephone-nico', savedAt: 'now', data: { ...pc().data, transactions: [tx('a', T2, 120), tx('b'), tx('c', T1)] } };
    expect(sameSyncBundle(local, remote)).toBe(false);
    expect(sameSyncBundle(local, { ...pc(), stamps: { profile: T2, basket: T1 } })).toBe(false);
    expect(sameSyncBundle(local, null)).toBe(false);
  });
});
