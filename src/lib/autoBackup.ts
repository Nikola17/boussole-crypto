// Sauvegarde automatique : quand la faire, comment nommer les fichiers, lesquels supprimer. Fonctions pures + mémo de la dernière sauvegarde.

export type BackupKind = 'auto' | 'avant-import' | 'manuel';

export interface LastBackup { at: string; where: string; kind: BackupKind }

/** Nombre de fichiers conservés par type. */
export const KEEP: Record<'auto' | 'avant-import', number> = { auto: 14, 'avant-import': 5 };

const LAST_KEY = 'boussole-last-backup';

export function readLastBackup(): LastBackup | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LastBackup>;
    return typeof v.at === 'string' && Number.isFinite(Date.parse(v.at)) ? { at: v.at, where: String(v.where ?? ''), kind: (v.kind as BackupKind) ?? 'auto' } : null;
  } catch {
    return null;
  }
}

export function saveLastBackup(b: LastBackup) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(b)); } catch { /* facultatif */ }
}

const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Une sauvegarde automatique est due si aucune n'a été faite aujourd'hui (heure locale). */
export function autoBackupDue(last: LastBackup | null, now = new Date()): boolean {
  if (!last || last.kind !== 'auto') return true;
  return dayOf(new Date(last.at)) !== dayOf(now);
}

/** Jours écoulés depuis la dernière sauvegarde, tous types confondus ; null si jamais. */
export function daysSinceBackup(last: LastBackup | null, now = new Date()): number | null {
  if (!last) return null;
  const a = new Date(last.at);
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86_400_000);
  return Math.max(0, days);
}

/** Rappel affiché au Cockpit : jamais sauvegardé, ou plus de 7 jours. */
export function backupReminderDue(last: LastBackup | null, now = new Date()): boolean {
  const d = daysSinceBackup(last, now);
  return d == null || d > 7;
}

/** Nom de fichier horodaté (heure locale), triable par ordre alphabétique : boussole-auto-2026-11-09_203015.json */
export function backupFileName(kind: 'auto' | 'avant-import', now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `boussole-${kind}-${dayOf(now)}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.json`;
}

/** Fichiers à supprimer pour n'en garder que `keep` de ce type (les plus récents d'abord, d'après leur nom). */
export function backupsToPrune(names: string[], kind: 'auto' | 'avant-import', keep = KEEP[kind]): string[] {
  const mine = names.filter((n) => n.startsWith(`boussole-${kind}-`) && n.endsWith('.json')).sort().reverse();
  return mine.slice(keep);
}

export function describeBackupAge(last: LastBackup | null, now = new Date()): string {
  const d = daysSinceBackup(last, now);
  if (d == null) return 'Aucune sauvegarde faite depuis cet appareil.';
  if (d === 0) return 'Dernière sauvegarde : aujourd’hui.';
  if (d === 1) return 'Dernière sauvegarde : hier.';
  return `Dernière sauvegarde : il y a ${d} jours.`;
}
