// Stockage des données de l'application : écriture protégée, migrations, mode lecture seule si les données viennent d'une version plus récente.
// Règle d'or : une erreur de stockage ne doit jamais se transformer en perte de données silencieuse.

import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { DATA_VERSION } from '../lib/backup';

export const STORE_KEY = 'boussole-data';

export type StorageStatusKind =
  | 'ok'
  | 'memory' // stockage du système indisponible : tout est perdu à la fermeture
  | 'trimmed' // stockage presque plein : rapports IA et chat laissés de côté, le reste est enregistré
  | 'failed' // stockage plein : rien n'a pu être enregistré
  | 'newer'; // données écrites par une version plus récente : lecture seule

export interface StorageStatus { kind: StorageStatusKind; version?: number }

export const useStorageStatus = create<{ status: StorageStatus; setStatus: (s: StorageStatus) => void }>()((set) => ({
  status: { kind: 'ok' },
  setStatus: (status) => set({ status }),
}));

/**
 * Migration des données enregistrées par une ancienne version.
 * Pour passer à la version N+1 : ajouter ici un bloc `if (version < N+1) { …transformer l'état… }` et augmenter DATA_VERSION.
 * Sans cette fonction, zustand ignorerait tout l'état enregistré dès que la version change.
 */
export function migrateState(persisted: unknown, version: number): unknown {
  if (version > DATA_VERSION) return persisted; // données plus récentes : lues telles quelles, mais jamais réécrites (voir guardedStorage)
  // version 1 → rien à transformer pour l'instant.
  return persisted;
}

function readVersion(raw: string): number | null {
  try {
    const v = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

/** Retire les données les moins précieuses (rapports IA, chat) d'un état sérialisé, pour tenir dans un stockage presque plein. */
export function stripHeavy(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as { state?: Record<string, unknown> };
    if (!parsed.state) return null;
    parsed.state.reports = [];
    parsed.state.chat = [];
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

/** Au-delà de ce nombre de caractères, on prévient que le stockage approche de sa limite (≈ 5 Mo selon les appareils). */
const WARN_CHARS = 3_500_000;

export function guardedStorage(backend: StateStorage, report: (s: StorageStatus) => void): StateStorage {
  let locked = false;
  let last: StorageStatusKind = 'ok';
  const say = (kind: StorageStatusKind, version?: number) => {
    if (kind === last) return;
    last = kind;
    report({ kind, version });
  };
  return {
    getItem: (name) => {
      const raw = backend.getItem(name) as string | null;
      if (raw) {
        const v = readVersion(raw);
        if (v != null && v > DATA_VERSION) {
          locked = true;
          say('newer', v);
        } else if (v != null && v < DATA_VERSION) {
          // Copie de précaution avant toute migration.
          try { backend.setItem(`${name}.avant-v${v}`, raw); } catch { /* facultatif */ }
        }
      }
      return raw;
    },
    setItem: (name, value) => {
      if (locked) return;
      try {
        backend.setItem(name, value);
        say(value.length > WARN_CHARS ? 'trimmed' : 'ok');
        return;
      } catch { /* stockage plein ou refusé : on réessaie sans les données les moins précieuses */ }
      const lean = stripHeavy(value);
      if (lean) {
        try {
          backend.setItem(name, lean);
          say('trimmed');
          return;
        } catch { /* toujours impossible */ }
      }
      say('failed');
    },
    removeItem: (name) => {
      if (locked) return;
      try { backend.removeItem(name); } catch { /* ignoré */ }
    },
  };
}

/** Stockage du système si disponible, sinon mémoire (l'application reste utilisable, mais prévient). */
export function systemStorage(): { backend: StateStorage; memory: boolean } {
  try {
    const k = '__boussole_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return { backend: localStorage, memory: false };
  } catch {
    const mem = new Map<string, string>();
    return {
      memory: true,
      backend: {
        getItem: (n) => mem.get(n) ?? null,
        setItem: (n, v) => void mem.set(n, v),
        removeItem: (n) => void mem.delete(n),
      },
    };
  }
}
