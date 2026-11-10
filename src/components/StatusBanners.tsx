// Bandeaux d'état des données : stockage plein ou en lecture seule, rappel de sauvegarde.

import { useState } from 'react';
import { exportBackup, useStore } from '../store/useStore';
import { useStorageStatus } from '../store/persistence';
import { hasUserData } from '../lib/backup';
import { backupReminderDue, describeBackupAge } from '../lib/autoBackup';
import { backupNow, canAutoBackup, noteManualBackup, useLastBackup } from '../hooks/useBackup';
import { backupFolderLabel, saveTextFile } from '../lib/platform';
import { isoDay } from '../lib/format';
import { Banner, Button } from './ui';

async function exportNow(): Promise<string> {
  const msg = await saveTextFile(`boussole-sauvegarde-${isoDay()}.json`, exportBackup(false));
  noteManualBackup();
  return msg;
}

/** Affiché en haut de toutes les pages quand les données ne sont pas (ou plus) enregistrées normalement. */
export function StorageBanner() {
  const status = useStorageStatus((s) => s.status);
  const [msg, setMsg] = useState<string | null>(null);
  if (status.kind === 'ok') return null;

  if (status.kind === 'memory') {
    return (
      <Banner tone="danger" title="Stockage indisponible : tes données ne seront pas conservées">
        Cet appareil refuse à Boussole d’enregistrer ses données. Tout ce que tu saisis disparaîtra à la fermeture : exporte-le régulièrement.
      </Banner>
    );
  }
  if (status.kind === 'newer') {
    return (
      <Banner tone="danger" title="Données écrites par une version plus récente de Boussole">
        Cette version les affiche en lecture seule (format {status.version}) : rien de ce que tu modifies n’est enregistré, pour ne rien abîmer. Installe la dernière version de Boussole.
      </Banner>
    );
  }
  if (status.kind === 'failed') {
    return (
      <Banner
        tone="danger"
        title="Tes dernières modifications ne sont PAS enregistrées"
        action={<Button size="sm" onClick={() => void exportNow().then(setMsg)}>Exporter mes données</Button>}
      >
        Le stockage de l’appareil est plein. Exporte tes données tout de suite, puis supprime d’anciens rapports IA (Copilote IA) pour libérer de la place.
        {msg && <span className="mt-1 block text-ink-2">{msg}</span>}
      </Banner>
    );
  }
  return (
    <Banner
      tone="warn"
      title="Stockage presque plein"
      action={<Button size="sm" onClick={() => { if (window.confirm('Supprimer tous les rapports IA et la conversation ? Tes transactions, plans et réglages ne sont pas touchés.')) useStore.setState({ reports: [], chat: [] }); }}>Vider les rapports IA</Button>}
    >
      Tes transactions, plans et réglages sont bien enregistrés, mais les rapports IA et la conversation ne le sont plus. Supprime d’anciens rapports pour libérer de la place.
    </Banner>
  );
}

/** Rappel au Cockpit : aucune sauvegarde récente (plus de 7 jours, ou jamais). */
export function BackupReminder() {
  const last = useLastBackup((s) => s.last);
  const worth = useStore((s) => hasUserData(s));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!worth || !backupReminderDue(last)) return null;

  async function save() {
    setBusy(true);
    try {
      if (canAutoBackup) {
        const r = await backupNow('auto');
        setMsg(r.ok ? `Sauvegarde faite : ${r.where}` : `Sauvegarde impossible (${r.error ?? 'erreur'}). Utilise « Exporter » dans les Réglages.`);
      } else {
        setMsg(await exportNow());
      }
    } catch (e) {
      setMsg(`Sauvegarde impossible : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Banner tone="info" title="Pense à sauvegarder tes données" action={<Button size="sm" loading={busy} onClick={() => void save()}>Sauvegarder maintenant</Button>}>
      {describeBackupAge(last)} Une réinstallation ou un téléphone perdu efface tout{backupFolderLabel ? ` ; la copie va dans ${backupFolderLabel}` : ''}.
      {msg && <span className="mt-1 block text-ink-2">{msg}</span>}
    </Banner>
  );
}
