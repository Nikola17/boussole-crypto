// Pépites émergentes : les toute nouvelles paires Solana/Base en traction réelle — des lignes on-chain
// de quelques heures à quelques jours, où se jouent les grands mouvements spéculatifs (et la plupart
// des arnaques : c'est pourquoi le scan de sécurité reste la porte d'entrée). Fonctions pures, testées.
//
// La traction ne se mesure pas au prix : un token peut doubler sur 400 $ de volume. On regarde la
// profondeur (liquidité), l'activité (volume) et la pression acheteuse (achats vs ventes) — et on
// privilégie le jeune sans l'être trop (quelques heures à 7 jours).

import type { DexPool } from '../api/dex';
import { isStable, isWrappedOrStaked } from './portfolio';

/** Les contraintes d'un candidat « émergent ». Toutes expliquées, jamais cachées. */
export const EMERGING_RULES = {
  /** Plus de 7 jours : ce n'est plus une émergente, c'est une position du DEX ordinaire. */
  maxAgeHours: 7 * 24,
  /** Moins de 25 k $ de liquidité : impossible de sortir sans casser le prix. */
  minLiquidityUsd: 25_000,
  /** Moins de 75 k $ échangés en 24 h : personne n'y est, ou pas naturellement. */
  minVolumeUsd: 75_000,
  /** Les achats doivent dominer les ventes de 15 % au moins. */
  buyPressure: 1.15,
} as const;

export interface EmergingCandidate {
  pool: DexPool;
  /** Traction 0-100 : activité, pression acheteuse, jeunesse. */
  traction: number;
  /** Pourquoi cette ligne est listée : affiché dans l'interface et le digest du serveur. */
  reasons: string[];
}

const within = (v: number, min: number, max: number): number => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));

/**
 * Filtre et note les nouvelles paires en traction. Âge borné par construction (« nouveaux pools »),
 * stablecoins et tokens wrappés exclus, aucune donnée manquante remplacée par zéro.
 */
export function emergingCandidates(pools: DexPool[], max = 8): EmergingCandidate[] {
  const out: EmergingCandidate[] = [];
  for (const p of pools) {
    if (p.network !== 'solana' && p.network !== 'base') continue; // ce scanner est un pari Solana/Base, assumé
    if (isStable(p.tokenSymbol) || isWrappedOrStaked(p.tokenSymbol, p.tokenName)) continue;
    if (p.ageHours > EMERGING_RULES.maxAgeHours) continue;
    if (p.liquidityUsd < EMERGING_RULES.minLiquidityUsd) continue;
    if (p.volume24h < EMERGING_RULES.minVolumeUsd) continue;
    const total = p.buys24h + p.sells24h;
    if (total < 40) continue; // trop peu de transactions pour juger la pression
    const buyShare = p.buys24h / total;
    if (p.buys24h < p.sells24h * EMERGING_RULES.buyPressure) continue;
    if ((p.change24h ?? 0) < 5) continue; // pas en traction : ça refroidit déjà
    const reasons: string[] = [];
    reasons.push(`${p.ageHours < 24 ? `${Math.round(p.ageHours)} h` : `${Math.round(p.ageHours / 24)} j`} d'âge`);
    reasons.push(`${Math.round(buyShare * 100)} % d'achats (24 h)`);
    if (p.change24h != null && p.change24h > 30 && p.change24h < 400) reasons.push(`+${Math.round(p.change24h)} % sur 24 h`);
    // Traction : activité (volume/liquidité), pression acheteuse, fraîcheur — chacune bornée, aucune extrapolée.
    const activity = within(p.volume24h / Math.max(1, p.liquidityUsd), 0.5, 4);
    const pressure = (buyShare - 0.5) / 0.5 * 100;
    const freshness = within(EMERGING_RULES.maxAgeHours - p.ageHours, 0, EMERGING_RULES.maxAgeHours - 24);
    const traction = Math.round(0.45 * activity + 0.35 * Math.max(0, Math.min(100, pressure)) + 0.2 * freshness);
    out.push({ pool: p, traction, reasons });
  }
  return out.sort((a, b) => b.traction - a.traction || b.pool.volume24h - a.pool.volume24h).slice(0, max);
}

/** Le libellé d'un candidat pour le digest du serveur : compact, chiffres bruts, aucune promesse. */
export function emergingLine(c: EmergingCandidate, extra?: { security?: string | null; wallets?: string[] }): string {
  const p = c.pool;
  const net = p.network === 'solana' ? 'Solana' : 'Base';
  const vol = p.volume24h >= 1e6 ? `${(p.volume24h / 1e6).toFixed(1)} M $` : `${Math.round(p.volume24h / 1e3)} k $`;
  const parts = [`${p.tokenSymbol.toUpperCase()} (${net}, ${c.reasons[0]}, vol ${vol}, ${c.reasons[1]}`];
  if (extra?.security) parts[0] += `, ${extra.security}`;
  let out = parts[0] + ')';
  if (extra?.wallets?.length) out += ` — wallet suivi : ${extra.wallets.join(', ')}`;
  return out;
}
