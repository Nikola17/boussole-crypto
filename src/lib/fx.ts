// Taux de change EUR/USD : une seule valeur de repli pour toute l'application (avant : 0,9 ici et 0,86 là, donc des montants différents d'un écran à l'autre).

/** Nombre d'euros pour 1 dollar, utilisé UNIQUEMENT quand aucun taux réel n'est disponible. */
export const FALLBACK_EUR_PER_USD = 0.87;

/** Un taux plausible (entre 0,3 et 3 €/$) ; sinon le repli. */
export function sanitizeFx(v: number | null | undefined): number {
  return v != null && Number.isFinite(v) && v > 0.3 && v < 3 ? v : FALLBACK_EUR_PER_USD;
}

/**
 * Taux du JOUR d'une opération passée. Une saisie datée d'il y a trois mois doit utiliser le taux de cette date,
 * pas celui d'aujourd'hui, sinon son coût d'acquisition en euros est faux.
 * `closes` : cours de clôture EURUSD par jour (AAAA-MM-JJ) ; dollars pour 1 euro.
 */
export function eurPerUsdOn(date: string, closes: Map<string, number> | null | undefined, fallback: number): number {
  if (!closes?.size) return fallback;
  for (let back = 0; back <= 7; back++) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - back);
    const usdPerEur = closes.get(d.toISOString().slice(0, 10));
    if (usdPerEur != null && usdPerEur > 0) return sanitizeFx(1 / usdPerEur);
  }
  return fallback;
}
