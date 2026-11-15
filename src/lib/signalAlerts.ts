// Alertes de signal côté application : même logique que le serveur veilleur (src/runner/signals.ts), utilisée
// seulement quand le serveur est muet depuis 45 minutes, pour ne pas recevoir chaque alerte deux fois.

import { advanceSignals, type SignalEvent, type SignalState } from '../runner/signals';

export const RUNNER_SILENT_MS = 45 * 60_000;
export const MAX_SIGNAL_ALERTS = 3;

export interface StoredSignals extends SignalState { day: string }

export function runnerSilent(heartbeatRaw: string | null | undefined, nowMs: number): boolean {
  if (!heartbeatRaw) return true;
  try {
    const at = Date.parse((JSON.parse(heartbeatRaw) as { at?: string }).at ?? '');
    return !Number.isFinite(at) || nowMs - at >= RUNNER_SILENT_MS;
  } catch {
    return true;
  }
}

/** Un pas par jour : le premier calcul mémorise sans prévenir, les suivants annoncent les nouveaux épisodes. */
export function localSignalStep(stored: StoredSignals | null, today: Record<string, { symbol: string; keys: string[] }>, day: string, silent: boolean): { next: StoredSignals; events: SignalEvent[] } {
  if (stored?.day === day) return { next: stored, events: [] };
  const r = advanceSignals({ active: stored?.active ?? {}, starts: stored?.starts ?? {} }, today, day);
  return { next: { day, ...r.state }, events: stored && silent ? r.events.slice(0, MAX_SIGNAL_ALERTS) : [] };
}
