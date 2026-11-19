// Interprétation du radar dérivés & réseau : seuils heuristiques (documentés comme tels),
// fonction pure testée. Aucun conseil d'achat/vente, juste ce que signifient les chiffres.

import type { DerivsSnapshot } from '../api/derivs';

export interface DerivNotice {
  key: string;
  tone: 'up' | 'down' | 'warn' | 'neutral';
  title: string;
  detail: string;
}

/** Funding annualisé extrême : au-delà de ±0,01 %/8 h (≈ ±36,5 %/an). */
export const FUNDING_EXTREME_APR = 36.5;
/** Ratio long/short « très long » / « très short » (comptes Binance). */
export const LS_LONG = 2.5;
export const LS_SHORT = 0.7;
/** Mempool congestionné : frais > 50 sat/vB ou > 100 Mo en attente. */
export const MEMPOOL_FEE_HOT = 50;
export const MEMPOOL_VSIZE_HOT_MB = 100;
/** Open interest « élevé » indicatif, en $ (levier agrégé du marché). */
export const OI_HIGH_USD = 60e9;

export function interpretDerivs(d: DerivsSnapshot & { oiUsd: number | null }): DerivNotice[] {
  const out: DerivNotice[] = [];

  if (d.fundingAprPct != null) {
    if (d.fundingAprPct >= FUNDING_EXTREME_APR) {
      out.push({
        key: 'funding-high',
        tone: 'warn',
        title: `Funding extrême : +${d.fundingAprPct.toFixed(1)} %/an`,
        detail: 'Les positions longues à levier paient très cher : un mouvement baissier peut déclencher des liquidations en cascade.',
      });
    } else if (d.fundingAprPct <= -FUNDING_EXTREME_APR) {
      out.push({
        key: 'funding-low',
        tone: 'up',
        title: `Funding négatif marqué : ${d.fundingAprPct.toFixed(1)} %/an`,
        detail: 'Ce sont les shorts qui paient : un rebond peut provoquer un squeeze à la hausse.',
      });
    }
  }

  if (d.longShortRatio != null) {
    if (d.longShortRatio >= LS_LONG) {
      out.push({
        key: 'ls-long',
        tone: 'warn',
        title: `Le marché est très long (ratio ${d.longShortRatio.toFixed(2)}, ${d.longPct?.toFixed(0) ?? '—'} % de comptes acheteurs)`,
        detail: 'Beaucoup de levier acheteur : une baisse peut être amplifiée par les liquidations.',
      });
    } else if (d.longShortRatio <= LS_SHORT) {
      out.push({
        key: 'ls-short',
        tone: 'up',
        title: `Le marché est très short (ratio ${d.longShortRatio.toFixed(2)})`,
        detail: 'Beaucoup de paris à la baisse : un rebond peut être amplifié (squeeze).',
      });
    }
  }

  if (d.fastestFeeSatVb != null && d.fastestFeeSatVb >= MEMPOOL_FEE_HOT || (d.mempoolVsizeMb != null && d.mempoolVsizeMb >= MEMPOOL_VSIZE_HOT_MB)) {
    out.push({
      key: 'mempool-hot',
      tone: 'warn',
      title: `Réseau Bitcoin congestionné (${d.fastestFeeSatVb ?? '—'} sat/vB, ${d.mempoolVsizeMb != null ? `${d.mempoolVsizeMb.toFixed(0)} Mo` : '—'} en attente)`,
      detail: 'Tes transferts on-chain coûtent plus cher et mettent plus de temps à confirmer. Rien d’anormal, c’est le prix de la sécurité du réseau.',
    });
  }

  if (d.oiUsd != null && d.oiUsd >= OI_HIGH_USD) {
    out.push({
      key: 'oi-high',
      tone: 'neutral',
      title: `Open interest élevé : ≈ ${(d.oiUsd / 1e9).toFixed(0)} Md $`,
      detail: 'Le marché est fortement levier-heavy : les mouvements de prix peuvent être amplifiés dans les deux sens. Seuil indicatif, pas un signal.',
    });
  }

  return out;
}
