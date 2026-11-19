// Déblocages de tokens suivis : lesquels arrivent dans les prochains jours (J-1, J-7…).
// Fonction pure, testée.

import type { TokenUnlock } from '../types';

export interface UpcomingUnlock extends TokenUnlock {
  daysUntil: number;
}

/** Déblocages à venir (0 à horizonDays), triés par proximité. */
export function upcomingUnlocks(list: TokenUnlock[], todayIso: string, horizonDays = 30): UpcomingUnlock[] {
  const t = Date.parse(todayIso);
  if (!Number.isFinite(t)) return [];
  return list
    .map((u) => ({ ...u, daysUntil: Math.round((Date.parse(u.date) - t) / 86400000) }))
    .filter((u) => Number.isFinite(u.daysUntil) && u.daysUntil >= 0 && u.daysUntil <= horizonDays)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

/** Badge d'urgence : J-1 (demain ou moins) puis J-7. */
export function unlockBadge(daysUntil: number): string | null {
  if (daysUntil <= 1) return 'J-1';
  if (daysUntil <= 7) return 'J-7';
  return null;
}
