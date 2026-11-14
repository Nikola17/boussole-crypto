// « Ordre du jour » transmis à l'IA : ce que les règles de l'utilisateur ont déjà décidé aujourd'hui.
// Le brief doit le reprendre tel quel (mêmes lignes, mêmes montants) au lieu de recalculer ou de contredire.

import type { BasketPlanResult } from '../lib/basket';
import type { BasketExecution, ProfileRules } from '../types';

export interface TodayInput {
  guidance: { title: string; detail: string }[];
  basketDue: boolean;
  plan: BasketPlanResult | null;
  /** Échéance du jour déjà validée : on transmet ce qui a été passé, pas un ordre recalculé après l'achat. */
  doneExecution?: BasketExecution | null;
  rules: ProfileRules;
  /** Faux si un wallet n'a pas pu être lu : le portefeuille transmis est alors partiel. */
  portfolioComplete: boolean;
  temperature: number | null;
}

export function todayContext(i: TodayInput): Record<string, unknown> {
  return {
    consigne: 'Ces éléments sont calculés par les règles de l’utilisateur. Reprends-les tels quels (mêmes lignes, mêmes montants en USDC) : ne les recalcule pas, ne les contredis pas. Tu peux ajouter un avis ou un risque, jamais un autre montant.',
    actionsDuJour: i.guidance.map((g) => `${g.title} — ${g.detail}`),
    panierDca: i.doneExecution
      ? {
          echeanceFaite: true,
          consigne: 'L’échéance du panier est déjà passée : ne propose aucun autre achat DCA avant la prochaine.',
          ordresPasses: i.doneExecution.orders.map((o) => ({ ligne: o.symbol.toUpperCase(), montantUsdc: o.usd })),
          variationReserveUsdc: i.doneExecution.reserveDeltaUsd,
          sautee: !!i.doneExecution.skipped,
        }
      : i.plan
      ? {
          echeanceAujourdhui: i.basketDue,
          budgetUsdc: i.plan.baseUsd,
          totalInvestiUsdc: i.plan.investUsd,
          variationReserveUsdc: i.plan.reserveDeltaUsd,
          ordres: i.plan.orders.map((o) => ({ ligne: o.symbol.toUpperCase(), type: o.kind === 'core' ? 'cœur' : 'découverte', montantUsdc: o.usd, raison: o.reason })),
          lignesEcartees: i.plan.excluded.map((e) => `${e.symbol} : ${e.reason}`),
          remarques: [...i.plan.notes, ...i.plan.warnings],
        }
      : null,
    reglesFixes: [
      'Bitcoin et Ethereum ne se vendent qu’en euphorie (température ≥ 80), par tranches de 5 à 10 %, avec au moins 30 jours entre deux tranches. Un excès de Bitcoin se corrige en orientant le DCA, jamais en vendant.',
      `Une ligne vaut au moins ${i.rules.minLinePct} % du portefeuille ; au plus ${i.rules.maxLines} lignes, dont ${i.rules.maxDiscoveryLines} « découverte » ; plafond par pépite ${i.rules.maxPerGemPct} %.`,
      'Achat hors DCA : uniquement avec la réserve d’USDC et si la température du marché est sous 30.',
      'Une altcoin sous Bitcoin depuis 6 mois sans progrès : bascule vers Bitcoin.',
    ],
    temperatureMarche: i.temperature == null ? null : Math.round(i.temperature),
    avertissement: i.portfolioComplete ? null : 'Un wallet suivi n’a pas pu être lu : le portefeuille ci-dessus est partiel. Ne tire aucune conclusion sur sa valeur totale ni sur les écarts à l’allocation.',
  };
}
