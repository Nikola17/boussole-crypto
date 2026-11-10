// Alertes de prix : quelles alertes sont atteintes, et quelles cryptos faut-il interroger pour le savoir.

import type { PriceAlert } from '../types';

/** Alertes encore à surveiller (actives et pas déjà déclenchées). */
export const watchedAlerts = (alerts: PriceAlert[]): PriceAlert[] => alerts.filter((a) => a.active && !a.triggeredAt);

/**
 * Cryptos des alertes dont le prix n'est pas dans la liste de marché déjà chargée (les 250 premières capitalisations).
 * Avant, une alerte sur une petite capitalisation ne se déclenchait jamais sur ordinateur : son prix n'était pas demandé.
 */
export function alertCoinsToFetch(alerts: PriceAlert[], known: ReadonlySet<string>): string[] {
  return [...new Set(watchedAlerts(alerts).map((a) => a.coinId).filter((id) => !known.has(id)))].sort();
}

export interface AlertHit { alert: PriceAlert; price: number }

/** Alertes atteintes d'après les prix connus ; une crypto sans prix connu n'est jamais considérée comme atteinte. */
export function checkPriceAlerts(alerts: PriceAlert[], prices: ReadonlyMap<string, number>): AlertHit[] {
  const out: AlertHit[] = [];
  for (const a of watchedAlerts(alerts)) {
    const price = prices.get(a.coinId);
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    if (a.condition === 'above' ? price >= a.priceUsd : price <= a.priceUsd) out.push({ alert: a, price });
  }
  return out;
}
