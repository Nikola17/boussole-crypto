// Tier de risque d'un rendement (1 = classique, 2 = modéré, 3 = élevé).
// Heuristique transparente et testée : audit, TVL, type de pool (stablecoins < risque), exposition.
// Ce n'est PAS un conseil : un tier bas ne garantit rien (un contrat audité peut être vidé par une faille 0-day).

export type RiskTier = 1 | 2 | 3;

export const RISK_LABEL: Record<RiskTier, string> = { 1: 'Classique', 2: 'Modéré', 3: 'Élevé' };

export interface RiskInput {
  tvlUsd: number | null;
  /** Audité (DefiLlama « audit » non vide) et non « single exposure » risquée. */
  audited?: boolean;
  /** Pool de stablecoins (moins de risque de volatilité du sous-jacent). */
  stablecoin?: boolean;
  /** Exposition « single » sur un protocole tiers (ex : lending sur un protocole peu connu). */
  singleExposure?: boolean;
  /** Pool avec risque de perte impermanente (LP) — ilRisk ou presence de 2+ tokens non-stables. */
  ilRisk?: boolean;
}

export function riskTierOf(i: RiskInput): RiskTier {
  const tvl = i.tvlUsd ?? 0;
  // Tier 3 : petit TVL, exposition single, perte impermanente, ou contrat non audité.
  if (tvl < 1_000_000 || i.singleExposure || i.ilRisk || !i.audited) return 3;
  // Audité et solide : gros TVL → classique, TVL moyen → modéré.
  if (tvl >= 10_000_000) return 1;
  return 2;
}
