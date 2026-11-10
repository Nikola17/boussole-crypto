// Données de marché gardées d'un lancement à l'autre : hors ligne, ou quand CoinGecko limite les requêtes (erreur 429),
// l'application affiche les dernières données connues (avec leur date) au lieu de se vider et de montrer 0 €.
// Stockage dans IndexedDB (et non localStorage) : ces données pèsent plusieurs centaines de Ko et ne doivent jamais
// concurrencer tes vraies données (journal, plans…) pour la place limitée du stockage local.

import type { QueryClient } from '@tanstack/react-query';

/** Requêtes conservées (premier élément de leur clé) : celles qui alimentent le Cockpit, le portefeuille et le cycle. */
export const PERSISTED_ROOTS = new Set(['markets', 'global', 'fng', 'btc-history', 'funding', 'fx']);
/** Au-delà, des prix aussi anciens ne sont plus montrés. */
export const MAX_AGE_MS = 7 * 24 * 3600_000;

export interface CacheEntry { key: readonly unknown[]; data: unknown; updatedAt: number }
export interface CacheSnapshot { v: 1; savedAt: number; entries: CacheEntry[] }

export const isPersisted = (key: readonly unknown[]) => PERSISTED_ROOTS.has(String(key[0]));

export function buildSnapshot(qc: Pick<QueryClient, 'getQueryCache'>, now = Date.now()): CacheSnapshot {
  const entries: CacheEntry[] = [];
  for (const q of qc.getQueryCache().getAll()) {
    // Une requête dont la dernière actualisation a ÉCHOUÉ garde ses anciennes données : on les conserve (avec leur vraie date),
    // sinon des lancements successifs hors ligne viderait peu à peu le cache.
    if (!isPersisted(q.queryKey) || q.state.data == null) continue;
    if (Array.isArray(q.state.data) && q.state.data.length === 0) continue;
    entries.push({ key: q.queryKey, data: q.state.data, updatedAt: q.state.dataUpdatedAt });
  }
  return { v: 1, savedAt: now, entries };
}

/** Remet en place les données d'un instantané ; retourne le nombre de requêtes restaurées. Un contenu illisible est ignoré. */
export function restoreSnapshot(qc: Pick<QueryClient, 'setQueryData'>, snap: unknown, now = Date.now()): number {
  if (typeof snap !== 'object' || snap === null) return 0;
  const s = snap as Partial<CacheSnapshot>;
  if (s.v !== 1 || !Array.isArray(s.entries)) return 0;
  let n = 0;
  for (const e of s.entries) {
    if (!e || !Array.isArray(e.key) || !isPersisted(e.key) || e.data == null) continue;
    if (typeof e.updatedAt !== 'number' || !Number.isFinite(e.updatedAt) || now - e.updatedAt > MAX_AGE_MS || e.updatedAt > now + 60_000) continue;
    // `updatedAt` d'origine : la donnée est reconnue « ancienne », donc rechargée dès que le réseau répond, mais déjà affichable.
    qc.setQueryData(e.key, e.data, { updatedAt: e.updatedAt });
    n++;
  }
  return n;
}

// ------------------------------------------------------------------ IndexedDB (sans dépendance)

const DB_NAME = 'boussole-cache';
const STORE = 'kv';
const KEY = 'queries';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponible')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null; // le cache est un confort : son absence ne doit jamais gêner l'application
  }
}

export async function loadSnapshot(): Promise<unknown> {
  return idb('readonly', (s) => s.get(KEY));
}

export async function saveSnapshot(snap: CacheSnapshot): Promise<void> {
  await idb('readwrite', (s) => s.put(snap, KEY));
}

/** Restaure les dernières données connues avant l'affichage (au plus `timeoutMs` d'attente). */
export async function restoreQueryCache(qc: QueryClient, timeoutMs = 1500): Promise<number> {
  const snap = await Promise.race([loadSnapshot(), new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
  return restoreSnapshot(qc, snap);
}

/** Enregistre les données de marché au fil de l'eau (une écriture toutes les `delayMs` au plus). */
export function startQueryCachePersistence(qc: QueryClient, delayMs = 8000): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = qc.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success' || !isPersisted(event.query.queryKey)) return;
    if (timer) return;
    timer = setTimeout(() => { timer = null; void saveSnapshot(buildSnapshot(qc)); }, delayMs);
  });
  return () => { unsub(); if (timer) clearTimeout(timer); };
}
