// Protocole du lot 3 : le journal des regards sur la période de contrôle (pour ne jamais régler en douce sur la
// période censée juger), et la cohérence d'un effet d'une crypto à l'autre (un effet porté par trois cryptos ne compte pas).

import type { Bias } from './events';

export const JOURNAL_HEADER = `# Journal des essais sur la période de contrôle

Chaque ligne est un regard sur la période de contrôle (à partir du 01/01/2023). Trois essais au plus par candidat.

| Date | Candidat | Période | Résultat |
|---|---|---|---|
`;

export interface JournalEntry { day: string; key: string; period: string; result: string }

export function appendJournal(text: string, entries: JournalEntry[]): string {
  const base = text.trim() ? text.replace(/\s*$/, '\n') : JOURNAL_HEADER;
  return base + entries.map((e) => `| ${e.day} | ${e.key} | ${e.period} | ${e.result} |`).join('\n') + (entries.length ? '\n' : '');
}

/** Nombre d'essais par candidat (F1, F2…) : jeux de paramètres distincts regardés sur le contrôle, lus dans le journal. */
export function trialsPerCandidate(text: string): Record<string, number> {
  const keys = new Map<string, Set<string>>();
  for (const m of text.matchAll(/^\| [^|]+ \| ((?:cand|plan):(F\d+)[^|]*?) \|/gm)) {
    const set = keys.get(m[2]) ?? new Set<string>();
    set.add(m[1]);
    keys.set(m[2], set);
  }
  return Object.fromEntries([...keys].map(([k, v]) => [k, v.size]));
}

export interface AssetKeyStats { asset: string; episodes: number; medianPct: number; baselineMedianPct: number }

/** Part (en %) des cryptos ayant au moins 5 épisodes dont l'effet a le sens attendu ; null sans aucune. */
export function consistencyPct(rows: AssetKeyStats[], bias: Bias): number | null {
  const judged = rows.filter((r) => r.episodes >= 5 && Number.isFinite(r.medianPct) && Number.isFinite(r.baselineMedianPct));
  if (!judged.length || bias === 'neutral') return null;
  const sign = bias === 'bull' ? 1 : -1;
  return (judged.filter((r) => sign * (r.medianPct - r.baselineMedianPct) > 0).length / judged.length) * 100;
}
