// Règles de docs/STRATEGIE.md traduites en fonctions pures : chacune produit un avertissement, jamais un ordre automatique.

import { LAG_VS_BTC_POINTS, MIN_DAYS_BETWEEN_TRIMS, OUTSIDE_DCA_MAX_TEMPERATURE } from './thresholds';

/** « 6 mois sous Bitcoin sans progrès = bascule vers Bitcoin » : la variation sur 200 jours sert de mesure (≈ 6,5 mois). */
export function lagsBitcoin(alt200dPct: number | null | undefined, btc200dPct: number | null | undefined, margin = LAG_VS_BTC_POINTS): boolean {
  if (alt200dPct == null || btc200dPct == null || !Number.isFinite(alt200dPct) || !Number.isFinite(btc200dPct)) return false;
  return alt200dPct < btc200dPct - margin;
}

export interface OutsideDcaVerdict { allowed: boolean; reasons: string[] }

/** « Achat hors DCA : uniquement avec la réserve, et seulement quand la température est sous 30 ». */
export function outsideDcaCheck(i: { temperature: number | null; reserveUsd: number | null; amountUsd: number }): OutsideDcaVerdict {
  const reasons: string[] = [];
  if (i.temperature == null) reasons.push('la température du marché est indisponible');
  else if (i.temperature >= OUTSIDE_DCA_MAX_TEMPERATURE) reasons.push(`le marché n’a pas assez peur (température ${Math.round(i.temperature)}/100, seuil ${OUTSIDE_DCA_MAX_TEMPERATURE})`);
  if (i.reserveUsd != null && i.amountUsd > i.reserveUsd + 0.005) reasons.push(`ton achat dépasse ta réserve d’USDC (${Math.round(i.reserveUsd)} USDC)`);
  return { allowed: reasons.length === 0, reasons };
}

export interface TrimStatus { allowed: boolean; nextDate: Date | null; daysLeft: number }

/** Allègement du cœur en euphorie : un délai minimal sépare deux tranches, pour ne pas vendre chaque jour d'une euphorie qui dure. */
export function trimStatus(lastIso: string | undefined, now = new Date(), minDays = MIN_DAYS_BETWEEN_TRIMS): TrimStatus {
  if (!lastIso || !Number.isFinite(Date.parse(lastIso))) return { allowed: true, nextDate: null, daysLeft: 0 };
  const next = new Date(Date.parse(lastIso) + minDays * 86_400_000);
  const daysLeft = Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 86_400_000));
  return { allowed: daysLeft === 0, nextDate: daysLeft > 0 ? next : null, daysLeft };
}

/** Une ligne trop petite pour compter : on la regroupe vers Bitcoin plutôt que de lui appliquer des paliers de sortie. */
export function isTinyLine(valueUsd: number, totalUsd: number, minLinePct: number): boolean {
  return totalUsd > 0 && (valueUsd / totalUsd) * 100 < minLinePct;
}

// ------------------------------------------------------------------ délai de réflexion anti-FOMO

/** Une crypto qui prend +50 % en 7 jours ne s'achète pas dans la minute : attente de 24 h, appliquée à froid. */
export const FOMO_SPIKE_7D_PCT = 50;
export const FOMO_WAIT_MS = 24 * 3600_000;

export interface ImpulseVerdict {
  /** L'achat doit-il être bloqué maintenant ? */
  blocked: boolean;
  /** Une attente existe-t-elle déjà pour cette crypto ? */
  started: boolean;
  /** Date ISO de déblocage de l'attente existante (null : pas d'attente). */
  unlockAt: string | null;
  /** Heures restantes avant le déblocage (0 : c'est ouvert). */
  hoursLeft: number;
}

/**
 * La règle des 24 h : un achat hors DCA sur une crypto qui a pris +50 % ou plus en 7 jours doit attendre un jour,
 * pour séparer l'envie de la décision. Sans donnée de marché (variation inconnue), la règle ne s'applique pas —
 * elle ne bloque que ce qu'elle peut constater. Elle ne remplace pas la décision : elle lui laisse le temps.
 */
export function impulseVerdict(change7dPct: number | null | undefined, wait: { unlockAt: string } | null | undefined, nowMs: number): ImpulseVerdict {
  const spike = change7dPct != null && Number.isFinite(change7dPct) && change7dPct >= FOMO_SPIKE_7D_PCT;
  if (!spike) return { blocked: false, started: false, unlockAt: null, hoursLeft: 0 };
  if (!wait || !Number.isFinite(Date.parse(wait.unlockAt))) return { blocked: true, started: false, unlockAt: null, hoursLeft: Math.ceil(FOMO_WAIT_MS / 3600_000) };
  const left = Date.parse(wait.unlockAt) - nowMs;
  if (left > 0) return { blocked: true, started: true, unlockAt: wait.unlockAt, hoursLeft: Math.max(1, Math.ceil(left / 3600_000)) };
  return { blocked: false, started: true, unlockAt: wait.unlockAt, hoursLeft: 0 };
}

// ------------------------------------------------------------------ circuit breaker anti-panique (ventes)

/** Fear & Greed sous ce seuil = peur extrême : aucune vente hors plan de sortie n'est laissée passer à chaud. */
export const PANIC_FNG_MAX = 25;

export interface PanicVerdict {
  blocked: boolean;
  started: boolean;
  unlockAt: string | null;
  hoursLeft: number;
  /** Fear & Greed constaté (null si indisponible — la règle ne bloque alors rien). */
  fng: number | null;
}

/**
 * Circuit breaker anti-panique : en peur extrême (Fear & Greed < 25), une vente non prévue par le plan de
 * sortie est bloquée 24 h — c'est précisément dans un krach que vendre au plus bas est une erreur.
 * Les paliers prévus par le plan de sortie restent gérables depuis l'écran « Plan de sortie ».
 */
export function panicVerdict(fng: number | null | undefined, wait: { unlockAt: string } | null | undefined, nowMs: number): PanicVerdict {
  const panic = fng != null && Number.isFinite(fng) && fng < PANIC_FNG_MAX;
  if (!panic) return { blocked: false, started: false, unlockAt: null, hoursLeft: 0, fng: fng ?? null };
  if (!wait || !Number.isFinite(Date.parse(wait.unlockAt))) return { blocked: true, started: false, unlockAt: null, hoursLeft: Math.ceil(FOMO_WAIT_MS / 3600_000), fng };
  const left = Date.parse(wait.unlockAt) - nowMs;
  if (left > 0) return { blocked: true, started: true, unlockAt: wait.unlockAt, hoursLeft: Math.max(1, Math.ceil(left / 3600_000)), fng };
  return { blocked: false, started: true, unlockAt: wait.unlockAt, hoursLeft: 0, fng };
}

