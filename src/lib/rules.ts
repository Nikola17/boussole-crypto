// Règles de docs/STRATEGIE.md traduites en fonctions pures : chacune produit un avertissement, jamais un ordre automatique.

import type { Thesis } from '../types';
import { LAG_VS_BTC_POINTS, MIN_DAYS_BETWEEN_TRIMS, OUTSIDE_DCA_MAX_TEMPERATURE } from './thresholds';

/** « 6 mois sous Bitcoin sans progrès = bascule vers Bitcoin » : la variation sur 200 jours sert de mesure (≈ 6,5 mois). */
export function lagsBitcoin(alt200dPct: number | null | undefined, btc200dPct: number | null | undefined, margin = LAG_VS_BTC_POINTS): boolean {
  if (alt200dPct == null || btc200dPct == null || !Number.isFinite(alt200dPct) || !Number.isFinite(btc200dPct)) return false;
  return alt200dPct < btc200dPct - margin;
}

/** « Thèse cassée = sortie » : identifiants des cryptos dont une hypothèse est cassée ou morte, ou dont la dernière vérification dit « cassée ». */
export function brokenThesisCoins(theses: Pick<Thesis, 'coinId' | 'hypotheses' | 'lastCheck'>[]): string[] {
  return theses
    .filter((t) => t.hypotheses.some((h) => h.status === 'broken' || h.status === 'dead') || /cass/i.test(t.lastCheck?.verdict ?? ''))
    .map((t) => t.coinId);
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
