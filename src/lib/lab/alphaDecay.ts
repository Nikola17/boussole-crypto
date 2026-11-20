// Détecteur d'Alpha Decay (perte d'edge en direct) : compare la performance des N derniers trades clos
// d'un autopilote à sa référence historique (ou à zéro) pour prévenir avant un drawdown prolongé.

import { closedTrades, tradeStatsOf } from './metrics';
import type { Fill } from './types';

export type DecayStatus = 'insuffisant' | 'sain' | 'vigilance' | 'degrade';

export interface AlphaDecayReport {
  status: DecayStatus;
  sample: number;
  recentExpectancyPct: number | null;
  recentExpectancyR: number | null;
  recentWinRatePct: number | null;
  gapR: number | null;
  headline: string;
}

export function detectAlphaDecay(fills: Fill[], historicalExpectancyR: number | null = null, window = 20): AlphaDecayReport {
  const closed = closedTrades(fills);
  if (closed.length < 8) {
    return {
      status: 'insuffisant',
      sample: closed.length,
      recentExpectancyPct: null,
      recentExpectancyR: null,
      recentWinRatePct: null,
      gapR: null,
      headline: `Échantillon insuffisant (${closed.length}/8 trades clos) pour mesurer une dérive.`,
    };
  }
  const recent = closed.slice(-window);
  const st = tradeStatsOf(recent);
  const expR = st.expectancyR;
  const gapR = expR != null && historicalExpectancyR != null ? expR - historicalExpectancyR : null;

  const metric = expR != null ? expR : st.expectancyPct / 5;
  let status: DecayStatus = 'sain';
  let headline = `Edge préservé sur les ${recent.length} derniers trades (${Math.round(st.winRatePct)} % gagnants).`;

  if (metric < -0.15 || (gapR != null && gapR < -0.35 && metric < 0)) {
    status = 'degrade';
    headline = `Alerte dérive d’edge : espérance négative sur les ${recent.length} derniers trades (${st.expectancyPct.toFixed(1).replace('.', ',')} %/trade).`;
  } else if (metric < 0.05 || (gapR != null && gapR < -0.2)) {
    status = 'vigilance';
    headline = `Vigilance : l’edge ralentit sur les ${recent.length} derniers trades (${Math.round(st.winRatePct)} % gagnants).`;
  }

  return {
    status,
    sample: recent.length,
    recentExpectancyPct: st.expectancyPct,
    recentExpectancyR: expR,
    recentWinRatePct: st.winRatePct,
    gapR,
    headline,
  };
}
