// Android : transmet au script d'arrière-plan (public/runners/alerts.js) ce qu'il doit surveiller application fermée.

import { Capacitor } from '@capacitor/core';
import { BackgroundRunner } from '@capacitor/background-runner';
import type { PriceAlert } from '../types';

export const RUNNER_LABEL = 'fr.nseguy.boussole.alerts';

export interface WatchState {
  alerts: { id: string; coinId: string; symbol: string; name: string; condition: 'above' | 'below'; priceUsd: number }[];
  exits: { coinId: string; symbol: string; multiple: number; pct: number; targetUsd: number }[];
}

/** Alertes de prix encore actives, au format attendu par le script d'arrière-plan. */
export function watchAlerts(alerts: PriceAlert[]): WatchState['alerts'] {
  return alerts.filter((a) => a.active && !a.triggeredAt).slice(0, 60).map((a) => ({ id: a.id, coinId: a.coinId, symbol: a.symbol, name: a.name, condition: a.condition, priceUsd: a.priceUsd }));
}

/** Dernier état envoyé : l'écran se redessine souvent, mais le script d'arrière-plan n'a besoin d'être prévenu que si l'état change. */
let lastSent = '';

/** Remet à zéro la mémoire du dernier envoi (tests). */
export function resetRunnerSync() {
  lastSent = '';
}

/**
 * Récupère les alertes déjà notifiées en l'absence de l'application (pour ne pas les répéter), puis envoie l'état à surveiller.
 * Sans effet hors Android ; le plugin est facultatif : une erreur ne bloque jamais l'application.
 * Rien n'est envoyé si l'état est identique au précédent : chaque envoi démarre un contexte JavaScript dans le plugin,
 * et l'écran se redessinait toutes les quelques secondes (batterie).
 */
export async function syncRunner(state: WatchState, onFired: (alertIds: string[]) => void): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const signature = JSON.stringify(state);
  if (signature === lastSent) return;
  lastSent = signature;
  try {
    const fired = await BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event: 'getFired', details: {} }) as { alerts?: string[] } | undefined;
    if (fired?.alerts?.length) onFired(fired.alerts);
    await BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event: 'syncWatch', details: { state } });
  } catch {
    lastSent = ''; // indisponible (premier lancement, économiseur de batterie…) : on réessaiera au prochain changement
  }
}

export async function requestRunnerPermission(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try { await BackgroundRunner.requestPermissions({ apis: ['notifications'] }); } catch { /* facultatif */ }
}
