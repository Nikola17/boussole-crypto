// Android : transmet au script d'arrière-plan (public/runners/alerts.js) ce qu'il doit surveiller application fermée.

import { Capacitor } from '@capacitor/core';
import { BackgroundRunner } from '@capacitor/background-runner';
import type { PriceAlert } from '../types';

export const RUNNER_LABEL = 'fr.nseguy.boussole.alerts';

export interface WatchState {
  alerts: { id: string; coinId: string; symbol: string; name: string; condition: 'above' | 'below'; priceUsd: number }[];
  exits: { coinId: string; symbol: string; multiple: number; pct: number; targetUsd: number }[];
  /** Clé « Demo » CoinGecko de l'utilisateur (facultative) : sans elle, le script se heurte plus vite à la limite de requêtes. */
  cgKey?: string;
}

export const EMPTY_WATCH: WatchState = { alerts: [], exits: [] };

/** Alertes de prix encore actives, au format attendu par le script d'arrière-plan. */
export function watchAlerts(alerts: PriceAlert[]): WatchState['alerts'] {
  return alerts.filter((a) => a.active && !a.triggeredAt).slice(0, 60).map((a) => ({ id: a.id, coinId: a.coinId, symbol: a.symbol, name: a.name, condition: a.condition, priceUsd: a.priceUsd }));
}

/** Dernier état envoyé : l'écran se redessine souvent, mais le script d'arrière-plan n'a besoin d'être prévenu que si l'état change. */
let lastSent = '';

let retryTimer: ReturnType<typeof setTimeout> | null = null;
const RETRY_DELAYS_MS = [4000, 10_000, 25_000, 60_000, 60_000, 120_000];

/** Remet à zéro la mémoire du dernier envoi (tests). */
export function resetRunnerSync() {
  lastSent = '';
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}

/**
 * Récupère les alertes déjà notifiées en l'absence de l'application (pour ne pas les répéter), puis envoie l'état à surveiller.
 * Sans effet hors Android ; le plugin est facultatif : une erreur ne bloque jamais l'application.
 * Rien n'est envoyé si l'état est identique au précédent : chaque envoi démarre un contexte JavaScript dans le plugin,
 * et l'écran se redessinait toutes les quelques secondes (batterie).
 */
export async function syncRunner(state: WatchState, onFired: (alertIds: string[]) => void, attempt = 0): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const signature = JSON.stringify(state);
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; } // un envoi plus récent remplace une nouvelle tentative en attente
  if (signature === lastSent) return;
  lastSent = signature;
  try {
    const fired = await BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event: 'getFired', details: {} }) as { alerts?: string[] } | undefined;
    if (fired?.alerts?.length) onFired(fired.alerts);
    await BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event: 'syncWatch', details: { state } });
  } catch {
    // Indisponible : le plugin démarre son moteur JavaScript un peu après l'écran, ou l'application est passée en arrière-plan.
    // On réessaie avec un délai croissant (sans cela, un échec au lancement laissait la surveillance vide tant que rien ne changeait).
    lastSent = '';
    if (attempt < RETRY_DELAYS_MS.length) {
      retryTimer = setTimeout(() => { retryTimer = null; void syncRunner(state, onFired, attempt + 1); }, RETRY_DELAYS_MS[attempt]);
    }
  }
}

export interface RunnerStatus {
  /** Dernier contrôle réussi (ms) ; null si aucun. */
  okAt: number | null;
  attemptAt: number | null;
  error: string | null;
  /** Nombre d'alertes et de paliers surveillés. */
  watching: number;
}

/** État de la surveillance en arrière-plan (Android) ; null si le script n'est pas disponible. */
export async function readRunnerStatus(): Promise<RunnerStatus | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const r = await BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event: 'getStatus', details: {} }) as Partial<RunnerStatus> | undefined;
    if (!r) return null;
    return { okAt: r.okAt ?? null, attemptAt: r.attemptAt ?? null, error: r.error ?? null, watching: r.watching ?? 0 };
  } catch {
    return null;
  }
}

const ago = (ms: number) => {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 2) return 'à l’instant';
  if (min < 90) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 36 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} jours`;
};

/** Phrase pour les Réglages : la surveillance tourne-t-elle vraiment ? */
export function describeRunnerStatus(st: RunnerStatus | null, now = Date.now()): { ok: boolean; text: string } {
  if (!st) return { ok: false, text: 'Surveillance en arrière-plan indisponible sur cet appareil.' };
  if (!st.watching) return { ok: true, text: 'Aucune alerte de prix ni palier à surveiller : rien à contrôler en arrière-plan.' };
  if (!st.okAt) {
    return { ok: false, text: st.attemptAt ? `Aucun contrôle réussi pour l’instant${st.error ? ` (${st.error})` : ''}. Vérifie que l’économiseur de batterie n’empêche pas Boussole de s’exécuter.` : 'Pas encore de contrôle en arrière-plan : le premier a lieu dans la demi-heure.' };
  }
  const age = now - st.okAt;
  // Le contrôle est prévu toutes les 30 minutes : sans succès depuis plus de 3 heures, quelque chose l'empêche.
  if (age > 3 * 3600_000) return { ok: false, text: `Dernier contrôle réussi ${ago(age)}${st.error ? ` ; depuis : ${st.error}` : ''}. Vérifie l’économiseur de batterie, ou ouvre Boussole.` };
  return { ok: true, text: `Alertes surveillées en arrière-plan : dernier contrôle réussi ${ago(age)}${st.error ? ` (dernier essai en échec : ${st.error})` : ''}.` };
}

export async function requestRunnerPermission(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try { await BackgroundRunner.requestPermissions({ apis: ['notifications'] }); } catch { /* facultatif */ }
}
