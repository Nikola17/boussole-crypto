// Sauvegarde automatique quotidienne et à la demande. Le fichier n'inclut jamais les clés API.

import { useEffect } from 'react';
import { create } from 'zustand';
import { exportBackup, useStore } from '../store/useStore';
import { useStorageStatus } from '../store/persistence';
import { hasUserData } from '../lib/backup';
import { autoBackupDue, readLastBackup, saveLastBackup, type BackupKind, type LastBackup } from '../lib/autoBackup';
import { isElectron, isNative, writeBackupFile, type BackupWrite } from '../lib/platform';

/** Dernière sauvegarde connue (partagée entre le Cockpit, les Réglages et le rappel). */
export const useLastBackup = create<{ last: LastBackup | null; refresh: () => void }>()((set) => ({
  last: readLastBackup(),
  refresh: () => set({ last: readLastBackup() }),
}));

/** Notée après un export fait à la main (téléchargement ou partage) : il compte comme une sauvegarde. */
export function noteManualBackup() {
  saveLastBackup({ at: new Date().toISOString(), where: '', kind: 'manuel' });
  useLastBackup.getState().refresh();
}

/** Sauvegarde dans le dossier dédié (PC : Documents\Boussole\sauvegardes ; Android : Documents/Boussole). */
export async function backupNow(kind: Exclude<BackupKind, 'manuel'>): Promise<BackupWrite> {
  const r = await writeBackupFile(kind, exportBackup(false));
  useLastBackup.getState().refresh();
  return r;
}

/** Peut-on écrire une sauvegarde sans intervention de l'utilisateur sur cet appareil ? */
export const canAutoBackup = isNative || isElectron;

/** Une sauvegarde par jour, au lancement puis à chaque changement de jour (l'application reste ouverte en arrière-plan sous Windows). */
export function useAutoBackup() {
  useEffect(() => {
    if (!canAutoBackup) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const state = useStore.getState();
      // Jamais de sauvegarde de données vides ni de données lues en lecture seule.
      if (useStorageStatus.getState().status.kind === 'newer' || !hasUserData(state)) return;
      if (autoBackupDue(readLastBackup())) void backupNow('auto');
    };
    const first = setTimeout(tick, 5000); // laisse l'application finir de charger ses données
    const timer = setInterval(tick, 30 * 60_000);
    return () => { cancelled = true; clearTimeout(first); clearInterval(timer); };
  }, []);
}
