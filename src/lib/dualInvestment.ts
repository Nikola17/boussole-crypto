// Simulateur « Dual Investment » (Binance Advanced Earn) — fonction pure, testée.
// Principe : tu engages un montant en stablecoin à un strike et une durée, à un APY annoncé.
// À l'échéance : si le prix est au-dessus du strike, tu récupères ta mise + intérêts en stablecoin ;
// sinon tu reçois l'actif au prix du strike (+ intérêts en actif), potentiellement sous son cours du moment.

export interface DualSimInput {
  /** Montant engagé, en USDC/USD. */
  amountUsd: number;
  /** Prix actuel de l'actif, en USD. */
  priceNowUsd: number;
  /** Strike en % sous le cours (ex : -10 → strike = cours − 10 %). Négatif = strike sous le cours. */
  strikePct: number;
  /** Durée en jours. */
  days: number;
  /** APY annoncé en % (ex : 25 = 25 %/an). */
  apyPct: number;
  /** Scénario testé : variation du prix d'ici l'échéance, en % (ex : -20). */
  priceChangePct: number;
}

export interface DualSimResult {
  strikeUsd: number;
  /** Intérêts en USDC si le strike n'est pas touché. */
  interestUsd: number;
  /** Quantité d'actif reçue si le strike est touché (mise + intérêts convertis au strike). */
  qtyIfConverted: number;
  /** Valeur en USD de ce que tu reçois dans le scénario testé. */
  valueAtScenarioUsd: number;
  /** APY réellement perçu dans le scénario (la conversion au strike peut coûter cher). */
  effectiveApyPct: number;
  /** Perte en % du montant engagé dans le scénario. */
  pnlPct: number;
  converted: boolean;
}

export function dualSim(i: DualSimInput): DualSimResult {
  const strikeUsd = i.priceNowUsd * (1 + i.strikePct / 100);
  const interestUsd = (i.amountUsd * i.apyPct / 100) * (i.days / 365);
  const priceAtEnd = i.priceNowUsd * (1 + i.priceChangePct / 100);
  // Dual investment « buy low » : converti si le prix passe SOUS le strike.
  const converted = priceAtEnd < strikeUsd;
  const qtyIfConverted = (i.amountUsd + interestUsd) / strikeUsd;
  const valueAtScenarioUsd = converted ? qtyIfConverted * priceAtEnd : i.amountUsd + interestUsd;
  const pnlPct = ((valueAtScenarioUsd - i.amountUsd) / i.amountUsd) * 100;
  const effectiveApyPct = pnlPct * (365 / i.days);
  return { strikeUsd, interestUsd, qtyIfConverted, valueAtScenarioUsd, effectiveApyPct, pnlPct, converted };
}

/** Libellé pédagogique du scénario. */
export function dualScenarioLabel(priceChangePct: number): string {
  if (priceChangePct >= 0) return `le prix monte ou stagne (+${priceChangePct} %) : tu gardes ta mise + intérêts`;
  return `le prix baisse de ${-priceChangePct} % : le strike peut être touché`;
}
