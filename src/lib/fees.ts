// Frais réels : combien as-tu payé au-dessus du cours du marché (écart de prix inclus dans l'application) ?
// On compare le prix de chaque achat au cours Binance de la même minute.

import type { Transaction } from '../types';
import { FALLBACK_EUR_PER_USD } from './fx';

export interface SpreadSample {
  txId: string;
  symbol: string;
  time: string;
  amountUsd: number; // montant dépensé
  priceUsd: number; // prix payé
  refUsd: number; // cours du marché à la même minute
}

export interface SpreadStats {
  n: number;
  excluded: number;
  avgPct: number; // écart moyen pondéré par les montants
  medianPct: number;
  spentUsd: number;
  overpaidUsd: number;
  perYearUsd: number | null;
  spanDays: number;
  worst: (SpreadSample & { pct: number })[];
}

const STABLES = new Set(['usdc', 'usdt', 'dai', 'fdusd', 'tusd', 'usde']);

/** Achats importés dont on connaît l'heure : les seuls dont l'écart se mesure sérieusement. */
export function buySamplesFrom(txs: Transaction[], limit = 60): Transaction[] {
  return txs
    .filter((t) => t.type === 'buy' && !!t.time && t.source === 'import' && t.price > 0 && !STABLES.has(t.symbol.toLowerCase()))
    .sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''))
    .slice(0, limit);
}

/** Prix unitaire en dollars d'une transaction (convertit les euros au taux enregistré pour cette opération). */
export function priceUsdOf(t: Transaction): number {
  if (t.currency === 'USD') return t.price;
  return t.fxEurPerUsd > 0 ? t.price / t.fxEurPerUsd : t.price / FALLBACK_EUR_PER_USD;
}

export function spreadStats(samples: SpreadSample[]): SpreadStats {
  // Au-delà de ±15 %, c'est presque sûrement une erreur d'appariement (homonyme, mauvaise paire) et non un vrai écart.
  const valid = samples.filter((s) => s.refUsd > 0 && s.priceUsd > 0 && Math.abs(s.priceUsd / s.refUsd - 1) <= 0.15);
  const excluded = samples.length - valid.length;
  if (!valid.length) return { n: 0, excluded, avgPct: 0, medianPct: 0, spentUsd: 0, overpaidUsd: 0, perYearUsd: null, spanDays: 0, worst: [] };
  const spent = valid.reduce((s, x) => s + x.amountUsd, 0);
  // Surcoût = montant dépensé − valeur au cours du marché de ce qui a été reçu.
  const overpaid = valid.reduce((s, x) => s + x.amountUsd * (1 - x.refUsd / x.priceUsd), 0);
  const pcts = valid.map((x) => (x.priceUsd / x.refUsd - 1) * 100).sort((a, b) => a - b);
  const median = pcts.length % 2 ? pcts[(pcts.length - 1) / 2] : (pcts[pcts.length / 2 - 1] + pcts[pcts.length / 2]) / 2;
  const times = valid.map((x) => Date.parse(x.time)).filter(Number.isFinite);
  const spanDays = times.length ? (Math.max(...times) - Math.min(...times)) / 86400_000 : 0;
  return {
    n: valid.length,
    excluded,
    avgPct: spent - overpaid > 0 ? (overpaid / (spent - overpaid)) * 100 : 0,
    medianPct: median,
    spentUsd: spent,
    overpaidUsd: overpaid,
    perYearUsd: spanDays >= 30 ? (overpaid * 365) / spanDays : null,
    spanDays,
    worst: valid.map((x) => ({ ...x, pct: (x.priceUsd / x.refUsd - 1) * 100 })).sort((a, b) => b.pct * b.amountUsd - a.pct * a.amountUsd).slice(0, 3),
  };
}
