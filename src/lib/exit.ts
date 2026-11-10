// Plan de sortie : paliers de prise de profits (×2, ×3, ×5…) pour les altcoins, et allègement par tranches en euphorie
// pour Bitcoin et Ethereum. Les calculs sont faits sur ton prix de revient moyen.

import { MIN_RUNG_VALUE_USD } from './thresholds';

export interface LadderStep {
  multiple: number;
  /** Part de la position de départ vendue à ce palier (en %). */
  pct: number;
}

export const DEFAULT_LADDER: LadderStep[] = [{ multiple: 2, pct: 25 }, { multiple: 3, pct: 25 }, { multiple: 5, pct: 25 }];

export interface Rung {
  multiple: number;
  pct: number;
  done: boolean;
  targetPrice: number;
  reached: boolean;
  /** Avancement du prix vers la cible (0-100). */
  progressPct: number;
  /** Quantité à vendre à ce palier (part de la position de départ, plafonnée à ce qu'il reste). */
  qty: number;
  valueUsd: number;
}

/**
 * `doneMultiples` : paliers déjà vendus. La position de départ se retrouve à partir de ce qu'il reste :
 * si 25 % ont déjà été vendus, le reste représente 75 % du départ.
 */
export function exitLadder(i: { avgCostUsd: number; priceUsd: number; quantity: number; steps: LadderStep[]; doneMultiples: number[] }): Rung[] {
  if (!(i.avgCostUsd > 0) || !(i.priceUsd > 0) || !(i.quantity > 0)) return [];
  const doneShare = i.steps.filter((s) => i.doneMultiples.includes(s.multiple)).reduce((t, s) => t + s.pct, 0) / 100;
  const initial = doneShare < 0.999 ? i.quantity / (1 - doneShare) : i.quantity;
  return [...i.steps]
    .sort((a, b) => a.multiple - b.multiple)
    .map((s) => {
      const done = i.doneMultiples.includes(s.multiple);
      const target = i.avgCostUsd * s.multiple;
      const qty = Math.min((initial * s.pct) / 100, i.quantity);
      return { multiple: s.multiple, pct: s.pct, done, targetPrice: target, reached: i.priceUsd >= target, progressPct: Math.min(100, (i.priceUsd / target) * 100), qty: done ? 0 : qty, valueUsd: done ? 0 : qty * i.priceUsd };
    });
}

/** Paliers atteints mais pas encore vendus, et assez gros pour valoir la peine (sous ≈ 20 $, frais et impôt mangent l'intérêt). */
export function pendingRungs(rungs: Rung[], minValueUsd = MIN_RUNG_VALUE_USD): Rung[] {
  return rungs.filter((r) => r.reached && !r.done && r.valueUsd >= minValueUsd);
}

export interface EuphoriaStep {
  active: boolean;
  /** Part de la position à alléger. */
  sellPct: number;
  label: string;
}

/** Bitcoin et Ethereum : on ne vend qu'en euphorie, par petites tranches, jamais tout. */
export function euphoriaStep(temperature: number | null): EuphoriaStep {
  if (temperature == null) return { active: false, sellPct: 0, label: 'Température du marché indisponible.' };
  if (temperature >= 90) return { active: true, sellPct: 10, label: 'Euphorie extrême : alléger de 10 % de la position.' };
  if (temperature >= 80) return { active: true, sellPct: 5, label: 'Euphorie : alléger de 5 % de la position.' };
  return { active: false, sellPct: 0, label: `Rien à vendre : le marché n’est pas en euphorie (température ${Math.round(temperature)}/100, seuil 80).` };
}
