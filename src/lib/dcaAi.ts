// DCA × IA : les règles calculent l'ordre du jour (montants, garde-fous), l'IA l'affine avec ce que les règles ne
// voient pas (actualité, contexte du projet, cohérence avec le portefeuille). Fonctions pures, testées.
//
// Le contrat est strict : l'IA ne peut que GARDER une ligne ou la REMPLACER par une autre candidate du même côté
// (base ou découverte) qui a déjà passé toutes les règles. Elle ne change jamais un montant, n'ajoute jamais une
// crypto hors de la liste, et une réponse illisible laisse l'ordre des règles intact.

import type { PlannedOrder } from './basket';
import type { CoinRef } from '../types';

/** Une alternative qui a passé les règles : l'IA ne peut choisir que parmi elles. */
export interface PoolCoin extends CoinRef {
  side: 'core' | 'discovery';
  score: number | null;
  rank: number | null;
  change7d: number | null;
  change30d?: number | null;
  heldPct?: number;
}

export interface DcaAiDecision {
  symbol: string;
  decision: 'garder' | 'remplacer';
  /** Symbole de la remplaçante (si « remplacer »). */
  by?: string;
  confidence: number | null;
  reason: string;
}

export interface DcaAiAdvice {
  decisions: DcaAiDecision[];
  summary: string;
  mainRisk: string;
}

export interface AppliedAdvice {
  orders: PlannedOrder[];
  /** Remplacements acceptés : « SOL → AVAX : raison ». */
  changes: { from: string; to: string; reason: string; confidence: number | null }[];
  /** Propositions refusées parce qu'elles sortent du contrat (crypto hors liste, autre côté, doublon…). */
  rejected: string[];
}

/** Le dossier envoyé à l'IA : l'ordre, les alternatives autorisées, le marché et le poids de chaque ligne. */
export function dcaAiPayload(i: {
  orders: PlannedOrder[];
  pool: PoolCoin[];
  temperature: number | null;
  fearGreed: number | null;
  notes: string[];
}): Record<string, unknown> {
  const fmt = (c: PoolCoin) => ({
    jeton: c.symbol.toUpperCase(),
    nom: c.name,
    cote: c.side === 'core' ? 'base' : 'decouverte',
    score: c.score,
    rang: c.rank,
    variation7j: c.change7d != null ? Math.round(c.change7d * 10) / 10 : null,
    variation30j: c.change30d != null ? Math.round(c.change30d * 10) / 10 : null,
    poidsDansLePortefeuillePct: c.heldPct != null ? Math.round(c.heldPct * 10) / 10 : 0,
  });
  return {
    ordre: i.orders.map((o) => ({ jeton: o.symbol.toUpperCase(), nom: o.name, cote: o.kind === 'core' ? 'base' : 'decouverte', montantUsdc: o.usd, raisonDesRegles: o.reason })),
    alternativesAutorisees: i.pool.map(fmt),
    marche: { temperature: i.temperature == null ? null : Math.round(i.temperature), fearGreed: i.fearGreed },
    remarquesDesRegles: i.notes,
  };
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Lit le bloc JSON de la réponse ; null si rien d'exploitable (l'ordre des règles reste alors tel quel). */
export function parseDcaAiReply(data: unknown): DcaAiAdvice | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const list = Array.isArray(d.ordres) ? d.ordres : [];
  const decisions: DcaAiDecision[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const symbol = str(r.jeton).toUpperCase();
    if (!symbol) continue;
    const dec = str(r.decision).toLowerCase();
    const by = str(r.par).toUpperCase();
    const conf = Number(r.confiance);
    decisions.push({
      symbol,
      decision: dec.startsWith('rempl') && by ? 'remplacer' : 'garder',
      by: dec.startsWith('rempl') && by ? by : undefined,
      confidence: Number.isFinite(conf) ? Math.max(1, Math.min(5, Math.round(conf))) : null,
      reason: str(r.raison),
    });
  }
  if (!decisions.length && !str(d.synthese)) return null;
  return { decisions, summary: str(d.synthese), mainRisk: str(d.risque_principal) };
}

/**
 * Applique l'avis sans jamais sortir des règles : même côté, candidate de la liste autorisée, pas de doublon,
 * même montant. Une confiance de 1 ou 2 sur 5 ne suffit pas à remplacer une ligne choisie par les règles.
 */
export function applyDcaAiAdvice(orders: PlannedOrder[], advice: DcaAiAdvice, pool: PoolCoin[], minConfidence = 3): AppliedAdvice {
  const out = orders.map((o) => ({ ...o }));
  const changes: AppliedAdvice['changes'] = [];
  const rejected: string[] = [];
  const used = new Set(out.map((o) => o.coinId));
  for (const d of advice.decisions) {
    if (d.decision !== 'remplacer' || !d.by) continue;
    const idx = out.findIndex((o) => o.symbol.toUpperCase() === d.symbol);
    if (idx === -1) { rejected.push(`${d.symbol} → ${d.by} : ${d.symbol} n’est pas dans l’ordre du jour.`); continue; }
    const from = out[idx];
    const cand = pool.find((p) => p.symbol.toUpperCase() === d.by && p.side === from.kind);
    if (!cand) {
      const otherSide = pool.some((p) => p.symbol.toUpperCase() === d.by);
      rejected.push(`${d.symbol} → ${d.by} : ${otherSide ? 'pas du même côté (base ou découverte)' : 'hors de la liste autorisée par tes règles'}.`);
      continue;
    }
    if (used.has(cand.coinId)) { rejected.push(`${d.symbol} → ${d.by} : déjà dans l’ordre.`); continue; }
    if (d.confidence != null && d.confidence < minConfidence) { rejected.push(`${d.symbol} → ${d.by} : confiance trop faible (${d.confidence}/5).`); continue; }
    used.delete(from.coinId);
    used.add(cand.coinId);
    out[idx] = { coinId: cand.coinId, symbol: cand.symbol, name: cand.name, image: cand.image, usd: from.usd, kind: from.kind, reason: `Choix de l’IA à la place de ${from.symbol.toUpperCase()}${d.reason ? ` : ${d.reason}` : ''}` };
    changes.push({ from: from.symbol.toUpperCase(), to: cand.symbol.toUpperCase(), reason: d.reason, confidence: d.confidence });
  }
  return { orders: out, changes, rejected };
}
