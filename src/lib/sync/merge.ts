// Fusion de deux états de l'application (PC et téléphone) : chaque élément porte sa date de dernière
// modification, la version la plus récente l'emporte, les suppressions se propagent, et les rubriques
// sans identifiant (profil, watchlist, panier…) sont datées dans `syncStamp`.
// Fonction pure : aucun accès au stockage, aucune horloge (l'instant de référence est en paramètre).

import type { SyncDeletion } from '../../types';

/** Rubriques-listes : chaque élément a un identifiant, la fusion se fait élément par élément. */
export const ITEM_KEYS = ['watchedTokens', 'transactions', 'wallets', 'dcaPlans', 'dcaExecutions', 'trades', 'alerts', 'airdrops', 'theses', 'accounts', 'basketExecutions', 'defiBets'] as const;
export type ItemKey = (typeof ITEM_KEYS)[number];

/** Rubriques datées dans `syncStamp` : fusionnées d'un bloc, la version la plus récente l'emporte. */
export const STAMP_KEYS = ['profile', 'watchlist', 'exitDone', 'coreTrims', 'envelope', 'cdcSeen', 'checklist', 'basket'] as const;
export type StampKey = (typeof STAMP_KEYS)[number];

export interface SyncBundle {
  data: Partial<Record<ItemKey | StampKey, unknown>>;
  deletions: SyncDeletion[];
  stamps: Partial<Record<StampKey, string>>;
}

/** L'état de l'application, vu par la fusion (seules les rubriques synchronisées comptent). */
export type SyncSource = {
  deletions?: SyncDeletion[];
  syncStamp?: Record<string, string>;
} & Partial<Record<ItemKey, unknown[]>> & Partial<Record<StampKey, unknown>>;

export function bundleOf(state: SyncSource): SyncBundle {
  const data: SyncBundle['data'] = {};
  for (const k of [...ITEM_KEYS, ...STAMP_KEYS]) if (k in state) data[k] = (state as Record<string, unknown>)[k];
  return { data, deletions: state.deletions ?? [], stamps: { ...(state.syncStamp ?? {}) } };
}

const EPOCH = '1970-01-01T00:00:00.000Z';
type Item = { id: string; updatedAt?: string };

/** Les suppressions de plus de 180 jours ne servent plus : tous les appareils les ont vues. */
const PRUNE_MS = 180 * 86400 * 1000;

export interface MergeDiff {
  /** Changements que la fusion apporte à `a` (ajouts + mises à jour + suppressions). */
  changedFromA: number;
  /** Changements que la fusion apporte à `b` : s'il y en a, il faut pousser le résultat. */
  changedFromB: number;
}

export function mergeBundles(a: SyncBundle, b: SyncBundle, now = Date.now()): SyncBundle & MergeDiff {
  if (!a.deletions) a = { ...a, deletions: [] };
  if (!b.deletions) b = { ...b, deletions: [] };

  // Registre des suppressions : union, la date la plus récente l'emporte ; élagage des entrées de plus de 180 jours.
  const del = new Map<string, string>();
  for (const d of [...a.deletions, ...b.deletions]) del.set(d.key, (del.get(d.key) ?? EPOCH) > d.at ? (del.get(d.key) as string) : d.at);
  const keepFrom = now - PRUNE_MS;
  const deletions: SyncDeletion[] = [...del.entries()].map(([key, at]) => ({ key, at })).filter((d) => (Date.parse(d.at) || 0) >= keepFrom);
  const deletedAt = (key: string): string => del.get(key) ?? EPOCH;

  const data: SyncBundle['data'] = {};
  let changedFromA = 0;
  let changedFromB = 0;

  // 1. Les rubriques-listes : union par identifiant, la version la plus récente gagne, la suppression tue.
  for (const k of ITEM_KEYS) {
    const la = (a.data[k] ?? []) as Item[];
    const lb = (b.data[k] ?? []) as Item[];
    const ma = new Map(la.map((x) => [x.id, x]));
    const mb = new Map(lb.map((x) => [x.id, x]));
    const out: unknown[] = [];
    // On garde l'ordre de a, puis les éléments propres à b passent devant (les listes se lisent du plus récent au plus ancien).
    for (const x of lb) if (!ma.has(x.id)) out.push(x);
    for (const x of la) {
      const y = mb.get(x.id);
      if (!y) { out.push(x); continue; }
      out.push(win(x, y));
    }
    // Suppressions : tout élément modifié avant sa suppression disparaît.
    const kept = out.filter((x) => {
      const it = x as Item;
      return deletedAt(`${k}/${it.id}`) <= (it.updatedAt ?? EPOCH);
    });
    data[k] = kept;
    if (!sameList(la, kept)) changedFromA++;
    if (!sameList(lb, kept)) changedFromB++;
  }

  // 2. Les rubriques datées (profil, watchlist, panier…) : le plus récent gagne en bloc (à date égale ou inconnue, la version de `b` l'emporte).
  const stamps: SyncBundle['stamps'] = {};
  for (const k of STAMP_KEYS) {
    const sa = a.stamps[k] ?? EPOCH;
    const sb = b.stamps[k] ?? EPOCH;
    if (!(k in a.data) && !(k in b.data)) continue;
    const win = sa >= sb ? a.data[k] : b.data[k];
    stamps[k] = sa >= sb ? sa : sb;
    data[k] = win;
    if (!sameValue(a.data[k], win)) changedFromA++;
    if (!sameValue(b.data[k], win)) changedFromB++;
  }

  return { data, deletions, stamps, changedFromA, changedFromB };
}

/** La plus récente des deux versions d'un élément ; à dates égales ou inconnues, celle de `a` (l'appareil local). */
function win(x: Item, y: Item): Item {
  const dx = x.updatedAt ?? EPOCH;
  const dy = y.updatedAt ?? EPOCH;
  return dy > dx ? y : x;
}

function sameList(la: unknown[], lb: unknown[]): boolean {
  if (la.length !== lb.length) return false;
  for (let i = 0; i < la.length; i++) if (JSON.stringify(la[i]) !== JSON.stringify(lb[i])) return false;
  return true;
}

function sameValue(x: unknown, y: unknown): boolean {
  return JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
}

/** Applique un faisceau fusionné à des tranches d'état pour réécrire le stockage local (aucun élément ignoré). */
export function splitForState(bundle: SyncBundle): { deletions: SyncDeletion[]; syncStamp: Record<string, string> } & Record<string, unknown> {
  return { ...bundle.data, deletions: bundle.deletions, syncStamp: bundle.stamps };
}

/**
 * Fusion d'un fichier de sauvegarde dans l'état actuel (choix « Fusionner » de l'import manuel).
 * Le fichier est traité comme un pair : ses éléments sans date comptent comme anciens (l'appareil garde
 * ses propres versions en cas de conflit d'identifiant), et ce qu'il a de nouveau est ajouté.
 */
export function mergeBackupInto(state: SyncSource, file: Record<string, unknown>): ReturnType<typeof splitForState> {
  const fileBundle = bundleOf(file as SyncSource);
  const merged = mergeBundles(bundleOf(state), fileBundle);
  return splitForState(merged);
}
