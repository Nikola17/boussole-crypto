// Frais Binance par niveau VIP (ordre de grandeur 2026, taux « taker » — à vérifier sur binance.com/fees).
// Paiement des frais en BNB : −25 %. Utilisé pour rendre le paper trading réaliste (preset « plateforme »).

import type { CostModel } from './lab/types';

/** Taux taker en % pour VIP 0 à VIP 9 (ordre de grandeur). */
export const VIP_TAKER_PCT: number[] = [0.10, 0.09, 0.075, 0.07, 0.06, 0.05, 0.045, 0.04, 0.035, 0.03];

/** Taux maker (ordres limites / bots grid) en % pour VIP 0 à VIP 9 (ordre de grandeur). */
export const VIP_MAKER_PCT: number[] = [0.10, 0.09, 0.08, 0.06, 0.04, 0.03, 0.02, 0.015, 0.01, 0.008];

/** Remise BNB sur les frais. */
export const BNB_DISCOUNT_FACTOR = 0.75;

export function clampVip(vip: number): number {
  if (!Number.isFinite(vip)) return 0;
  return Math.min(VIP_TAKER_PCT.length - 1, Math.max(0, Math.round(vip)));
}

/** Taux taker effectif en % pour un VIP et la remise BNB. */
export function binanceTakerPct(vip: number, bnbDiscount: boolean): number {
  const base = VIP_TAKER_PCT[clampVip(vip)];
  return Math.round(base * (bnbDiscount ? BNB_DISCOUNT_FACTOR : 1) * 10000) / 10000;
}

/** Taux maker effectif en % pour un VIP et la remise BNB (ordres limites et grilles). */
export function binanceMakerPct(vip: number, bnbDiscount: boolean): number {
  const base = VIP_MAKER_PCT[clampVip(vip)];
  return Math.round(base * (bnbDiscount ? BNB_DISCOUNT_FACTOR : 1) * 10000) / 10000;
}

/** Modèle de coûts « plateforme d'échange » (ordres au marché) calibré sur ton VIP Binance. */
export function binanceCostModel(vip: number, bnbDiscount: boolean): CostModel {
  return { feePct: binanceTakerPct(vip, bnbDiscount), spreadPct: 0.05 };
}

/** Modèle de coûts « ordres limites / maker » calibré sur ton VIP Binance (sans spread de carnet). */
export function binanceMakerCostModel(vip: number, bnbDiscount: boolean): CostModel {
  return { feePct: binanceMakerPct(vip, bnbDiscount), spreadPct: 0 };
}
