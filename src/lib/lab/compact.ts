// Compactage des journaux d'autopilotes (`paperDays`) : avec 12+ autopilotes actifs tous les jours,
// retire les journaux vides (sans exécution ni dépôt) plus anciens que `keepEmptyDays` pour garder
// la synchronisation GitHub chiffrée légère (< 1 Mo) sans perdre aucune exécution ni aucun calcul d'état.

import type { PaperDayLog } from '../../types';
import { addDays } from './clock';

export function compactPaperDays(days: PaperDayLog[], today: string, keepEmptyDays = 90): { days: PaperDayLog[]; removed: number } {
  const cutoff = addDays(today, -Math.max(7, keepEmptyDays));
  const kept: PaperDayLog[] = [];
  let removed = 0;
  for (const d of days) {
    const hasActivity = d.fills.length > 0 || d.depositUsd > 0;
    if (hasActivity || d.day >= cutoff) kept.push(d);
    else removed++;
  }
  return { days: removed ? kept : days, removed };
}
