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

/**
 * Récupère les alertes déjà notifiées en l'absence de l'application (pour ne pas les répéter), puis envoie l'état à surveiller.
 * Sans effet hors Android ; le plugin est facultatif : une erreur ne bloque jamais l'application.
 */
export async function syncRunner(state: WatchState, onFired: (alertIds: string[]) => void): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const fired = await BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event: 'getFired', details: {} }) as { alerts?: string[] } | undefined;
    if (fired?.alerts?.length) onFired(fired.alerts);
    await BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event: 'syncWatch', details: { state } });
  } catch {
    /* indisponible (premier lancement, économiseur de batterie…) */
  }
}

export async function requestRunnerPermission(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try { await BackgroundRunner.requestPermissions({ apis: ['notifications'] }); } catch { /* facultatif */ }
}
