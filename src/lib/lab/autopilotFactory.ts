// Création d'un autopilote : réglages figés à la création (stratégie, paramètres, frais, heure), empreinte des règles,
// premier jour d'exécution le lendemain. Un autopilote dont les règles changent est archivé et recréé à l'identique.

import type { PaperCosts, PaperPortfolio } from '../../types';
import { uid } from '../format';
import { addDays, localDay } from './clock';
import { STRATEGIES, rulesFingerprint } from './strategies';

export const MAX_ACTIVE_AUTOPILOTS = 12;

export interface NewAutopilot { strategyId: string; name: string; startingUsd: number; params: PaperPortfolio['params']; costs: PaperCosts; executionHour?: number; executionHours?: number[]; timeZone?: string }

export function newAutopilot(i: NewAutopilot, nowMs: number): PaperPortfolio {
  const s = STRATEGIES[i.strategyId];
  if (!s) throw new Error(`Stratégie inconnue : ${i.strategyId}`);
  const timeZone = i.timeZone ?? 'Europe/Paris';
  const today = localDay(nowMs, timeZone);
  const hours = i.executionHours ?? s.executionHours;
  return {
    id: uid(), name: i.name, kind: 'auto', startingUsd: i.startingUsd, createdAt: new Date(nowMs).toISOString(), costs: i.costs,
    strategyId: s.id, rules: rulesFingerprint(s), params: i.params, executionHour: hours?.[0] ?? i.executionHour ?? 8,
    ...(hours?.length ? { executionHours: [...hours] } : {}),
    timeZone,
    cursorDay: today, liveSince: addDays(today, 1),
  };
}

/** L'autopilote archivé (« anciennes règles ») et son remplaçant, mêmes réglages, verdict reparti de zéro. */
export function renewAutopilot(old: PaperPortfolio, nowMs: number): { archived: PaperPortfolio; fresh: PaperPortfolio | null } {
  const archived: PaperPortfolio = { ...old, archived: true, name: old.name.endsWith('(anciennes règles)') ? old.name : `${old.name} (anciennes règles)` };
  if (!old.strategyId || !STRATEGIES[old.strategyId]) return { archived, fresh: null };
  const fresh = newAutopilot({ strategyId: old.strategyId, name: old.name, startingUsd: old.startingUsd, params: old.params, costs: old.costs, executionHour: old.executionHour, executionHours: old.executionHours, timeZone: old.timeZone }, nowMs);
  return { archived, fresh };
}
