// Perte impermanente (impermanent loss) d'une position de liquidité — fonction pure, testée.
// Formule classique : IL(r) = 2·√r / (1+r) − 1, où r = prix courant / prix d'entrée (ratio des deux actifs du pool).
// Elle ne dépend que du ratio de prix, pas des montants.

/** Perte impermanente en fraction (négative) pour un ratio de prix r = prixActuel / prixEntrée. */
export function impermanentLoss(ratio: number): number {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return 0;
  return (2 * Math.sqrt(ratio)) / (1 + ratio) - 1;
}

/** En pourcentage, arrondi au dixième (ex : −5,3 % pour un ratio 2). */
export function impermanentLossPct(ratio: number): number {
  return Math.round(impermanentLoss(ratio) * 1000) / 10;
}

/**
 * Valeur d'une position LP vs « garder » (HODL) les deux actifs à parts égales.
 * `amountUsd` = valeur initiale de la position ; `ratio` = prix pool actuel / prix d'entrée.
 * Renvoie la valeur LP en USD et la valeur HODL en USD.
 */
export function lpVsHodl(amountUsd: number, ratio: number): { lpUsd: number; hodlUsd: number; diffPct: number } {
  if (!(amountUsd > 0) || !(ratio > 0) || !Number.isFinite(ratio)) return { lpUsd: amountUsd, hodlUsd: amountUsd, diffPct: 0 };
  const il = impermanentLoss(ratio);
  const lpUsd = amountUsd * (1 + il); // la valeur LP vaut (1+IL) × la valeur initiale, IL ≤ 0
  const hodlUsd = amountUsd * (1 + Math.sqrt(ratio)) / 2; // HODL 50/50 : moyenne géométrique
  const diffPct = hodlUsd > 0 ? ((lpUsd - hodlUsd) / hodlUsd) * 100 : 0;
  return { lpUsd, hodlUsd, diffPct };
}
