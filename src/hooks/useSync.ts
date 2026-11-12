// Synchronisation PC ↔ téléphone (dépôt GitHub privé, fichier unique chiffré de bout en bout) :
// 1. lit le fichier distant, 2. fusionne (la version la plus récente de chaque élément gagne, les
// suppressions se propagent), 3. réécrit l'état local, 4. repousse le résultat AVEC l'empreinte du fichier
// lu : GitHub refuse l'écriture si l'autre appareil a modifié le fichier entre-temps.

import { create } from 'zustand';
import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { hasUserData } from '../lib/backup';
import { bundleOf, mergeBundles, sameSyncBundle, splitForState, type SyncBundle, ITEM_KEYS, STAMP_KEYS } from '../lib/sync/merge';
import { seal, unseal } from '../lib/sync/crypto';
import { fetchRemote, pushRemote, CONFLICT } from '../lib/sync/github';
import { uid } from '../lib/format';

export const SYNC_PATH = 'boussole-sync.enc';

interface SyncStatus {
  busy: boolean;
  error: string | null;
  lastAt: number;
  set: (p: Partial<Omit<SyncStatus, 'set'>>) => void;
}

export const useSyncStatus = create<SyncStatus>()((set) => ({ busy: false, error: null, lastAt: 0, set: (p) => set(p) }));

/** En cours d'application d'une fusion : les écritures qui en découlent ne doivent pas re-déclencher une synchronisation. */
let applying = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function configured(): boolean {
  const { syncEnabled, syncRepo, syncToken, syncPassphrase } = useStore.getState().settings;
  return !!syncEnabled && !!syncRepo.trim() && !!syncToken.trim() && !!syncPassphrase.trim();
}

/** Une synchronisation complète : tirer, fusionner, appliquer, pousser (au plus deux tentatives en cas de conflit d'empreinte). */
export async function runSync(): Promise<void> {
  const st = useSyncStatus.getState();
  if (st.busy || !configured()) return;
  // Rien à synchroniser tant que l'appareil est vierge : on n'envoie pas un état vide écraser l'autre appareil.
  if (!hasUserData(useStore.getState())) return;
  useSyncStatus.getState().set({ busy: true, error: null });
  try {
    const { syncRepo, syncToken, syncPassphrase } = useStore.getState().settings;
    if (!useStore.getState().settings.deviceId) useStore.getState().setSettings({ deviceId: uid() });
    await syncRound(syncRepo, syncToken, syncPassphrase);
    useSyncStatus.getState().set({ lastAt: Date.now(), busy: false });
    useStore.getState().setSettings({ syncLastAt: Math.floor(Date.now() / 1000) });
  } catch (e) {
    useSyncStatus.getState().set({ busy: false, error: e instanceof Error ? e.message : String(e) });
  }
}

async function syncRound(repo: string, token: string, passphrase: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await fetchRemote(repo, SYNC_PATH, token);
    const local = bundleOf(useStore.getState());
    let remoteBundle: SyncBundle | null = null;
    let changedFromA = 0;
    if (remote) {
      remoteBundle = (await unseal(remote.content, passphrase)) as SyncBundle;
      if (!remoteBundle || typeof remoteBundle !== 'object' || !remoteBundle.data || !remoteBundle.deletions) throw new Error('Le fichier de synchronisation distant ne contient pas des données Boussole.');
      const m = mergeBundles(local, remoteBundle);
      changedFromA = m.changedFromA;
      if (changedFromA > 0) {
        applying = true;
        try {
          useStore.setState(splitForState(m), false);
        } finally {
          applying = false;
        }
      }
    }
    const out = bundleOf(useStore.getState());
    // Seul le CONTENU synchronisé compte : le fichier distant porte aussi l'appareil et la date d'écriture.
    // Sans ça, chaque lecture voit une « différence » (device/savedAt) et réécrit le dépôt en boucle.
    const differs = !remoteBundle || !sameSyncBundle(out, remoteBundle);
    if (!differs) return; // déjà identique : rien à écrire, rien à risquer
    try {
      const text = await seal({ ...out, device: useStore.getState().settings.deviceId, savedAt: new Date().toISOString() }, passphrase);
      await pushRemote(repo, SYNC_PATH, token, text, remote?.sha ?? null);
      return;
    } catch (e) {
      if (e instanceof Error && e.message === CONFLICT) continue; // l'autre appareil a écrit entre-temps : on relit et on refusionne
      throw e;
    }
  }
  throw new Error('L’autre appareil a synchronisé trois fois de suite au même moment : réessaie dans un instant.');
}

/** Après une modification de l'utilisateur : la synchronification part regroupée, pas à chaque frappe. */
export function scheduleSync(delayMs = 4000): void {
  if (applying || !configured()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runSync();
  }, delayMs);
}

/** À monter une fois (App) : synchronisation au lancement, après les modifications (regroupées), et toutes les 15 minutes. */
export function useSyncLifecycle(): void {
  const enabled = useStore((s) => s.settings.syncEnabled);
  const syncLastAt = useStore((s) => s.settings.syncLastAt);
  useEffect(() => { useSyncStatus.getState().set({ lastAt: syncLastAt * 1000 }); }, [syncLastAt]);
  useEffect(() => {
    if (!enabled) return;
    void runSync();
    // Seules les rubriques synchronisées comptent : un cycle d'horloge ou un rafraîchissement de marché
    // ne doit pas déclencher d'écriture dans le dépôt (avant, chaque changement de l'état repartait).
    const watchedKeys = [...ITEM_KEYS, ...STAMP_KEYS, 'deletions', 'syncStamp'] as const;
    const unsubscribe = useStore.subscribe((s, prev) => {
      for (const k of watchedKeys) {
        if (s[k] !== prev[k]) { scheduleSync(); return; }
      }
    });
    const interval = setInterval(() => void runSync(), 15 * 60 * 1000);
    return () => { unsubscribe(); clearInterval(interval); };
  }, [enabled]);
}
