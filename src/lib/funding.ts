// Funding perp : taux par 8 h sur Binance. Un taux extrême (|r| ≥ 0,05 %/8 h ≈ 54 %/an) signale un déséquilibre
// de levier (trop de longs si positif, trop de shorts si négatif) — souvent avant un squeeze. Pure, testée.

/** Seuil « extrême » du funding par 8 h (0,05 %). */
export const FUNDING_EXTREME = 0.0005;

export type FundingVerdict = 'extreme-long' | 'extreme-short' | 'normal';

export function fundingVerdict(ratePer8h: number | null | undefined): FundingVerdict {
  if (ratePer8h == null || !Number.isFinite(ratePer8h)) return 'normal';
  if (ratePer8h >= FUNDING_EXTREME) return 'extreme-long';
  if (ratePer8h <= -FUNDING_EXTREME) return 'extreme-short';
  return 'normal';
}

export function fundingAnnualizedPct(ratePer8h: number): number {
  return ratePer8h * 3 * 365 * 100;
}

export function fundingAlertText(symbol: string, ratePer8h: number): string {
  const v = fundingVerdict(ratePer8h);
  const side = v === 'extreme-long' ? 'trop de positions longues' : 'trop de positions courtes';
  return `Funding extrême ${symbol} : ${(ratePer8h * 100).toFixed(3)} %/8 h (≈ ${fundingAnnualizedPct(ratePer8h).toFixed(0)} %/an) — ${side}, risque de squeeze. Ne te colle pas à la foule.`;
}
