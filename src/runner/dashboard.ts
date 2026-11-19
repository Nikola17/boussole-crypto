// Dashboard web du VPS : le runner écrit un fichier « status.json » ASSAINI (aucun secret, par construction)
// dans un dossier servi en lecture seule par nginx (voir scripts/vps/). La page statique lit ce JSON.
// Règle absolue : ce fichier ne contient que des champs énumérés ici — jamais de token, phrase de passe,
// chat id, URL de webhook, ni contenu du faisceau de synchronisation.

import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { upcomingUnlocks } from '../lib/unlocks';
import type { TokenUnlock } from '../types';
import type { CycleResult } from './cycle';
import type { RunnerState } from './state';

export interface DashboardStatus {
  at: string;
  device: string;
  ok: boolean;
  error: string | null;
  /** Alertes de prix armées vues au dernier cycle. */
  watching: number;
  /** Dernière zone de marché mémorisée (changement = alerte Telegram). */
  zoneLabel: string | null;
  fng: { value: number; label: string } | null;
  temperature: { value: number; zoneLabel: string } | null;
  btc: { usd: number | null; change24h: number | null } | null;
  /** Prochains déblocages suivis (J-x), au plus 5. */
  unlocksNext: { symbol: string; date: string; daysUntil: number }[];
  /** Dernier brief envoyé par créneau (« matin », « us-open », « us-close ») → jour. */
  lastBrief: Record<string, string>;
  /** Fraîcheur du fichier de synchronisation chiffré. */
  sync: { savedAt: string | null; device: string | null };
}

/** Construit le statut public à partir de données déjà assainies — fonction pure, testée. */
export function buildDashboardStatus(i: {
  now: Date;
  device: string;
  result: Pick<CycleResult, 'error' | 'watching'>;
  state: Pick<RunnerState, 'zoneLabel' | 'lastBriefSlot'>;
  fng: { value: number; label: string } | null;
  temperature: { value: number; zoneLabel: string } | null;
  btcPrice: { usd?: number; change?: number } | null | undefined;
  unlocks: TokenUnlock[];
  syncSavedAt: string | null;
  syncDevice: string | null;
}): DashboardStatus {
  const dayKey = i.now.toISOString().slice(0, 10);
  return {
    at: i.now.toISOString(),
    device: i.device,
    ok: i.result.error == null,
    error: i.result.error,
    watching: i.result.watching,
    zoneLabel: i.state.zoneLabel,
    fng: i.fng,
    temperature: i.temperature,
    btc: i.btcPrice ? { usd: i.btcPrice.usd ?? null, change24h: i.btcPrice.change ?? null } : null,
    unlocksNext: upcomingUnlocks(i.unlocks, dayKey, 30).slice(0, 5).map((u) => ({ symbol: u.symbol, date: u.date, daysUntil: u.daysUntil })),
    lastBrief: i.state.lastBriefSlot ?? {},
    sync: { savedAt: i.syncSavedAt, device: i.syncDevice },
  };
}

/** Écrit status.json dans le dossier du dashboard (servi par nginx en lecture seule). */
export function writePublicStatus(dir: string, status: DashboardStatus): void {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'status.json');
  writeFileSync(file, JSON.stringify(status, null, 2) + '\n', 'utf8');
  try { chmodSync(file, 0o644); } catch { /* sans privilège : toléré */ }
}
