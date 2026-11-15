// Fiabilité mesurée des signaux : table produite par le banc d'essai (`npm run bench -- signals`),
// embarquée dans l'application et affichée à côté de chaque signal. Toujours avec sa référence et son nombre de cas.

import raw from '../../data/reliability.json';
import type { Bias, Verdict } from './events';

export interface ReliabilityEntry {
  label: string; bias: Bias; horizon: number;
  days: number; episodes: number; frequencyPct: number;
  hitPct: number; hitLow: number; hitHigh: number; medianPct: number; excessMedianPct: number; worstMedianPct: number;
  baselineHitPct: number; baselineMedianPct: number;
  control: { episodes: number; hitPct: number; medianPct: number; baselineHitPct: number };
  verdict: Verdict;
  expectancyR?: number;
}
export interface ReliabilityTable {
  generatedAt: string; dataThrough: string; rulesVersion: number;
  universe: { assets: number; from: string; top: number };
  entries: Record<string, ReliabilityEntry>;
}

const VERDICTS = new Set(['validé', 'prometteur', 'sans effet', 'inversé', 'trop peu de cas']);
const NUM = ['horizon', 'days', 'episodes', 'frequencyPct', 'hitPct', 'hitLow', 'hitHigh', 'medianPct', 'excessMedianPct', 'baselineHitPct', 'baselineMedianPct'] as const;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
/** NaN s'écrit null en JSON : accepté là où une médiane n'a pas pu être calculée. */
const isNum = (x: unknown) => typeof x === 'number' || x === null;

export function validateReliability(x: unknown): ReliabilityTable | null {
  if (!isObj(x) || typeof x.rulesVersion !== 'number' || typeof x.generatedAt !== 'string' || !isObj(x.universe) || !isObj(x.entries)) return null;
  for (const e of Object.values(x.entries)) {
    if (!isObj(e) || typeof e.label !== 'string' || !VERDICTS.has(e.verdict as string) || !isObj(e.control)) return null;
    if (NUM.some((k) => !isNum(e[k]))) return null;
  }
  return x as unknown as ReliabilityTable;
}

const EMPTY: ReliabilityTable = { generatedAt: '', dataThrough: '', rulesVersion: -1, universe: { assets: 0, from: '2019-01-01', top: 50 }, entries: {} };
export const RELIABILITY: ReliabilityTable = validateReliability(raw) ?? EMPTY;

export function reliabilityOf(key: string): ReliabilityEntry | null {
  return RELIABILITY.entries[key] ?? null;
}

export const reliabilityFromYear = (): number => Number(RELIABILITY.universe.from.slice(0, 4)) || 2019;

const fr0 = (x: number) => String(Math.round(x));
const frR = (x: number) => `${x >= 0 ? '+' : ''}${(Math.round(x * 100) / 100).toFixed(2).replace('.', ',')}`;

export function reliabilityPhrase(e: ReliabilityEntry | null, fromYear = reliabilityFromYear()): string {
  if (!e) return 'Fiabilité non mesurée.';
  if (e.verdict === 'trop peu de cas') return `Pas assez de cas pour juger (${e.episodes} fois depuis ${fromYear}).`;
  if (e.expectancyR != null) return `Depuis ${fromYear} : vu ${e.episodes} fois. Espérance ${frR(e.expectancyR)} R par trade, frais compris. Verdict : ${e.verdict}.`;
  return `Depuis ${fromYear} : vu ${e.episodes} fois. En hausse ${e.horizon} jours après dans ${fr0(e.hitPct)} % des cas (un jour quelconque : ${fr0(e.baselineHitPct)} %). Verdict : ${e.verdict}.`;
}
