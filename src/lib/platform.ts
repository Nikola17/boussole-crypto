// Fonctions dépendantes de la plateforme : Windows (Electron), Android (Capacitor) ou navigateur.

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { BasketPlan, DcaPlan } from '../types';
import { nextOccurrences } from './dca';
import { nextBasketOccurrences } from './basket';
import { requestRunnerPermission } from './runnerSync';

export const isNative = Capacitor.isNativePlatform();
export const isElectron = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);
export const platformLabel = isNative ? 'Android' : isElectron ? 'Windows' : 'Navigateur';

interface DesktopApi {
  get: () => Promise<{ background: boolean; autoStart: boolean }>;
  set: (patch: { background?: boolean; autoStart?: boolean }) => Promise<{ background: boolean; autoStart: boolean }>;
}

/** Pont vers le processus principal d'Electron (zone de notification, démarrage avec Windows) ; null ailleurs. */
function desktop(): DesktopApi | null {
  return (typeof window !== 'undefined' && (window as unknown as { boussoleDesktop?: DesktopApi }).boussoleDesktop) || null;
}

export async function syncDesktop(s: { closeToTray: boolean; autoStart: boolean }) {
  const d = desktop();
  if (!d) return;
  try { await d.set({ background: s.closeToTray, autoStart: s.autoStart }); } catch { /* facultatif */ }
}

export function openExternal(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  if (isNative) {
    void Browser.open({ url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (isNative) {
      const p = await LocalNotifications.checkPermissions();
      if (p.display === 'granted') { void requestRunnerPermission(); return true; }
      const r = await LocalNotifications.requestPermissions();
      if (r.display === 'granted') void requestRunnerPermission();
      return r.display === 'granted';
    }
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

let notifSeq = 1;

export async function notify(title: string, body: string) {
  try {
    if (isNative) {
      await LocalNotifications.schedule({
        // Pas d'alarme « exacte » : elle ferait ouvrir la page système « Alarmes et rappels » à chaque notification.
        notifications: [{ id: 5000 + (notifSeq++ % 4000), title, body, schedule: { at: new Date(Date.now() + 500) }, isExactNotification: false }],
      });
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
  } catch {
    /* notifications facultatives */
  }
}

/** Programme les rappels DCA et du panier sur Android (déclenchés même application fermée). */
export async function scheduleDcaReminders(plans: DcaPlan[], currencySymbol: string, basket: BasketPlan | null = null) {
  if (!isNative) return;
  try {
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter((n) => n.id >= 1000 && n.id < 2000);
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
    // Rappels à heure approximative (9 h, 18 h) : l'alarme exacte exigerait une autorisation système affichée de force.
    const notifications: { id: number; title: string; body: string; schedule: { at: Date; allowWhileIdle: boolean }; isExactNotification: boolean }[] = [];
    let id = 1000;
    const now = new Date();
    for (const p of plans.filter((x) => x.active && x.reminder)) {
      for (const d of nextOccurrences(p, now, 6)) {
        const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0);
        if (at <= now || id >= 1490) continue;
        notifications.push({
          id: id++,
          title: `DCA ${p.symbol.toUpperCase()} aujourd'hui`,
          body: `C'est le jour de ton achat programmé (${p.amount} ${currencySymbol} de base). Ouvre Boussole pour le montant recommandé.`,
          schedule: { at, allowWhileIdle: true },
          isExactNotification: false,
        });
      }
    }
    // Panier : identifiants 1500 à 1589 (les plans à une seule crypto utilisent 1000 à 1489).
    if (basket && basket.active && basket.reminder) {
      let bid = 1500;
      for (const d of nextBasketOccurrences(basket, now, 8)) {
        const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0);
        if (at <= now || bid >= 1590) continue;
        notifications.push({
          id: bid++,
          title: 'Panier DCA aujourd’hui',
          body: `C'est l'échéance de ton panier (${basket.amountUsd} USDC). Ouvre Boussole pour l'ordre du jour : montants, lignes et réserve.`,
          schedule: { at, allowWhileIdle: true },
          isExactNotification: false,
        });
      }
    }
    // Bilan de la semaine : dimanche 18 h (identifiants 1600 et 1601).
    if (basket && basket.active) {
      let sid = 1600;
      for (let k = 0; k < 14 && sid < 1602; k++) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k);
        const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 18, 0, 0);
        if (day.getDay() !== 0 || at <= now) continue;
        notifications.push({ id: sid++, title: 'Bilan de la semaine prêt', body: 'Ouvre le Cockpit : échéances, réserve, règles et écart avec Bitcoin.', schedule: { at, allowWhileIdle: true }, isExactNotification: false });
      }
    }
    if (notifications.length && (await ensureNotificationPermission())) await LocalNotifications.schedule({ notifications });
  } catch {
    /* ignoré */
  }
}

export async function saveTextFile(filename: string, content: string): Promise<string> {
  if (isNative) {
    const res = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Sauvegarde Boussole', url: res.uri, dialogTitle: 'Enregistrer ou partager la sauvegarde' });
    return 'Sauvegarde prête : choisis où l’enregistrer (Drive, e-mail, Fichiers…).';
  }
  const blob = new Blob([content], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'Fichier de sauvegarde téléchargé.';
}
