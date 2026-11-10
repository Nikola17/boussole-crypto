// Seuils partagés : une seule définition pour le Fear & Greed, les zones de température et l'anti-FOMO.
// Avant, chaque module avait ses propres chiffres (20 / 24 / 25 pour la « peur extrême »), ce qui donnait des conseils contradictoires.

/** Zones de la température du marché (0-100), utilisées par le cycle, les signaux et le DCA. */
export const TEMPERATURE = { extremeFear: 20, fear: 40, warm: 60, euphoria: 80 } as const;

/** Fear & Greed (alternative.me) : bornes hautes de chaque classe. */
export const FNG = { extremeFearMax: 24, fearMax: 44, neutralMax: 55, greedMax: 75 } as const;

/** Une crypto qui a pris plus de X % en 7 jours n'est pas une opportunité : on n'achète pas (panier, Pépites, liste de contrôle). */
export const FOMO_7D_PCT = 50;

/** Achat hors DCA (STRATEGIE.md) : uniquement avec la réserve d'USDC, et seulement quand le marché a vraiment peur. */
export const OUTSIDE_DCA_MAX_TEMPERATURE = 30;

/** Euphorie : Bitcoin et Ethereum peuvent être allégés, par tranches, avec un délai minimal entre deux tranches (jours). */
export const MIN_DAYS_BETWEEN_TRIMS = 30;

/** Un palier de sortie dont la valeur est inférieure à ce montant (USD) n'est pas conseillé : les frais et l'impôt en mangeraient l'intérêt. */
export const MIN_RUNG_VALUE_USD = 20;

/** Une altcoin qui fait moins bien que Bitcoin de plus de X points sur ≈ 6 mois est candidate à la bascule vers Bitcoin. */
export const LAG_VS_BTC_POINTS = 10;
