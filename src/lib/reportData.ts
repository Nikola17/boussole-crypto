// Les blocs JSON renvoyés par l'IA ne sont jamais fiables : on les remet en forme avant de les stocker ou de les afficher.
// Un champ manquant ou d'un mauvais type ne doit jamais faire planter l'écran (c'était le cas d'un `actions` qui n'était pas une liste).

import type { AiReportKind } from '../types';

export interface BriefAction { type: string; asset: string; detail: string; priority: number }

export interface ScoutItem {
  name: string; ecosystem?: string; type?: string; status?: string; cost?: string; effort?: string; potential?: number; risk?: number;
  confirmed?: boolean; deadline?: string | null; url?: string; steps?: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, max = 600): string {
  if (typeof v === 'string') return v.slice(0, max);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function optStr(v: unknown, max = 300): string | undefined {
  const s = str(v, max).trim();
  return s || undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Lien proposé par l'IA : seulement https, jamais autre chose (javascript:, file:, http en clair…). */
function safeUrl(v: unknown): string | undefined {
  const s = str(v, 500).trim();
  return /^https:\/\/[^\s]+$/i.test(s) ? s : undefined;
}

/** Les actions du brief : une liste d'objets {type, asset, detail, priority}. Tout le reste est écarté. */
export function readBriefActions(v: unknown): BriefAction[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .map((a) => ({ type: str(a.type, 40).trim(), asset: str(a.asset, 80).trim(), detail: str(a.detail, 700).trim(), priority: num(a.priority) ?? 3 }))
    .filter((a) => a.detail || a.asset)
    .slice(0, 10);
}

export function readScoutItems(v: unknown): ScoutItem[] {
  if (!Array.isArray(v)) return [];
  const out: ScoutItem[] = [];
  for (const raw of v) {
    if (!isObj(raw)) continue;
    const name = str(raw.name, 120).trim();
    if (!name) continue;
    const clamp = (n: number | undefined) => (n == null ? undefined : Math.min(5, Math.max(1, Math.round(n))));
    out.push({
      name,
      ecosystem: optStr(raw.ecosystem, 60),
      type: optStr(raw.type, 60),
      status: optStr(raw.status, 60),
      cost: optStr(raw.cost, 80),
      effort: optStr(raw.effort, 80),
      potential: clamp(num(raw.potential)),
      risk: clamp(num(raw.risk)),
      confirmed: raw.confirmed === true,
      deadline: raw.deadline == null ? null : optStr(raw.deadline, 40) ?? null,
      url: safeUrl(raw.url),
      steps: Array.isArray(raw.steps) ? raw.steps.map((s) => str(s, 300).trim()).filter(Boolean).slice(0, 8) : undefined,
    });
    if (out.length >= 20) break;
  }
  return out;
}

const THESIS_STATUS = new Set(['ok', 'weak', 'broken', 'dead']);

/** Statuts des hypothèses d'une thèse (ok / weak / broken / dead), dans l'ordre. */
export function readThesisStatuses(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((s) => str(s, 20).toLowerCase().trim()).map((s) => (THESIS_STATUS.has(s) ? s : 'weak'));
}

/**
 * Remet en forme le JSON d'un rapport avant stockage. Retourne null s'il n'y a rien d'exploitable.
 * (Le type de `data` du rapport est un objet ; l'éclaireur d'airdrops y range historiquement une liste.)
 */
export function sanitizeReportData(kind: AiReportKind, data: unknown): Record<string, unknown> | null {
  if (kind === 'airdrops') {
    const items = readScoutItems(data);
    return items.length ? (items as unknown as Record<string, unknown>) : null;
  }
  if (!isObj(data)) return null;
  const out: Record<string, unknown> = { ...data };
  if (kind === 'briefing') {
    if ('actions' in out) {
      const actions = readBriefActions(out.actions);
      if (actions.length) out.actions = actions;
      else delete out.actions;
    }
  } else if (kind === 'thesis') {
    out.statuses = readThesisStatuses(out.statuses);
    out.verdict = str(out.verdict, 40) || undefined;
  }
  return out;
}
