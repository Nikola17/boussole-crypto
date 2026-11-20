// Suivi de précision de l'IA (« AI Track Record ») : évalue a posteriori les verdicts émis par les rapports IA
// (Comité et Analyse rapide) en comparant le prix au moment du rapport au prix actuel (ou connu).
// Permet de savoir quel modèle (Claude, Mistral, DeepSeek…) donne réellement les meilleurs avis.

import type { AiReport } from '../types';

export interface AiVerdictEval {
  reportId: string;
  date: string;
  coinId: string;
  coinLabel: string;
  model: string;
  verdict: string;
  bias: 'bull' | 'bear';
  entryPriceUsd: number;
  currentPriceUsd: number;
  returnPct: number;
  won: boolean;
}

export interface ModelTrackRecord {
  model: string;
  total: number;
  wins: number;
  winRatePct: number;
  avgReturnPct: number;
}

export interface AiTrackRecordSummary {
  total: number;
  wins: number;
  winRatePct: number;
  byModel: ModelTrackRecord[];
  items: AiVerdictEval[];
}

const BULL_RE = /ACCUMULER|ACHETER/i;
const BEAR_RE = /ALL[ÉE]GER|VENDRE|[ÉE]VITER/i;

function extractPriceFromReport(r: AiReport): number | null {
  const d = r.data;
  if (!d || typeof d !== 'object') return null;
  if (typeof d.entry === 'number' && d.entry > 0) return d.entry;
  const zones = d.zones as Record<string, unknown> | undefined;
  if (zones && typeof zones.agressive === 'number' && zones.agressive > 0) return zones.agressive;
  if (zones && typeof zones.moderee === 'number' && zones.moderee > 0) return zones.moderee;
  return null;
}

/** Évalue tous les rapports IA portant un verdict directionnel et un prix de référence face aux prix courants. */
export function evaluateAiTrackRecord(
  reports: AiReport[],
  currentPriceUsd: (coinId: string) => number | null,
): AiTrackRecordSummary {
  const items: AiVerdictEval[] = [];
  for (const r of reports) {
    if (!r.coinId || !r.data || typeof r.data.verdict !== 'string') continue;
    const verdict = r.data.verdict.trim();
    const bias: 'bull' | 'bear' | null = BULL_RE.test(verdict) ? 'bull' : BEAR_RE.test(verdict) ? 'bear' : null;
    if (!bias) continue;
    const entry = extractPriceFromReport(r);
    const cur = currentPriceUsd(r.coinId);
    if (!entry || !(entry > 0) || !cur || !(cur > 0)) continue;
    const returnPct = ((cur - entry) / entry) * 100;
    const won = bias === 'bull' ? returnPct > 0 : returnPct < 0;
    items.push({
      reportId: r.id,
      date: r.createdAt.slice(0, 10),
      coinId: r.coinId,
      coinLabel: r.title || r.coinId,
      model: r.model || 'Inconnu',
      verdict,
      bias,
      entryPriceUsd: entry,
      currentPriceUsd: cur,
      returnPct,
      won,
    });
  }

  const map = new Map<string, AiVerdictEval[]>();
  for (const it of items) {
    const arr = map.get(it.model) ?? [];
    arr.push(it);
    map.set(it.model, arr);
  }
  const byModel: ModelTrackRecord[] = [...map.entries()].map(([model, arr]) => {
    const wins = arr.filter((x) => x.won).length;
    const directionalRet = arr.reduce((s, x) => s + (x.bias === 'bull' ? x.returnPct : -x.returnPct), 0) / arr.length;
    return { model, total: arr.length, wins, winRatePct: (wins / arr.length) * 100, avgReturnPct: directionalRet };
  }).sort((a, b) => b.winRatePct - a.winRatePct || b.total - a.total);

  const wins = items.filter((x) => x.won).length;
  return {
    total: items.length,
    wins,
    winRatePct: items.length ? (wins / items.length) * 100 : 0,
    byModel,
    items: items.sort((a, b) => b.date.localeCompare(a.date)),
  };
}
