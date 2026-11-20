// Simulation Monte Carlo par bootstrap par blocs (préserve l'autocorrélation des séries de pertes).
// Fonction pure et déterministe (PRNG seeded Mulberry32) : estime le pire drawdown probable à 95 %/99 %,
// la pire série de pertes attendue et la probabilité d'être positif sur N trades.

import { hashSeed, quantile } from './stats';
import type { ClosedTrade } from './metrics';

export interface MonteCarloOptions {
  /** Nombre de trajectoires simulées (défaut : 2000). */
  draws?: number;
  /** Taille de bloc (défaut : 3 trades contigus pour préserver les régimes). */
  blockSize?: number;
  /** Nombre de trades simulés par trajectoire (défaut : trades.length). */
  horizonTrades?: number;
  /** Graine déterministe. */
  seed?: string;
  /** Fraction du capital risquée / engagée par trade si calculé sur pnlPct (défaut : 0.20 = 20 % du capital par trade). */
  positionWeight?: number;
}

export interface MonteCarloResult {
  tradesSample: number;
  draws: number;
  /** Rendement cumulé final (%) aux centiles 5 %, 50 % et 95 %. */
  p5Pct: number;
  p50Pct: number;
  p95Pct: number;
  /** Pire drawdown (%) médian, 95ᵉ centile (sévère) et 99ᵉ centile (extrême), valeurs négatives. */
  mddP50Pct: number;
  mddP95Pct: number;
  mddP99Pct: number;
  /** Probabilité d'être positif en fin de trajectoire (%). */
  probPositivePct: number;
  /** Pire série de pertes consécutives au 95ᵉ centile. */
  worstStreakP95: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function runMonteCarlo(trades: ClosedTrade[], opts: MonteCarloOptions = {}): MonteCarloResult | null {
  if (trades.length < 5) return null;
  const draws = Math.max(100, opts.draws ?? 2000);
  const blockSize = Math.max(1, Math.min(trades.length, opts.blockSize ?? 3));
  const horizon = Math.max(5, opts.horizonTrades ?? trades.length);
  const weight = Math.max(0.02, Math.min(1, opts.positionWeight ?? 0.2));
  const rng = mulberry32(hashSeed(opts.seed ?? `mc:${trades.length}`));

  // Impact en % sur l'équité de chaque trade clos
  const eqDeltas = trades.map((t) => Math.max(-0.95, (t.pnlPct / 100) * weight));
  const n = eqDeltas.length;

  const finals: number[] = [];
  const mdds: number[] = [];
  const streaks: number[] = [];
  let positive = 0;

  for (let d = 0; d < draws; d++) {
    let eq = 1;
    let peak = 1;
    let mdd = 0;
    let streak = 0;
    let maxStreak = 0;
    let step = 0;
    while (step < horizon) {
      const start = Math.floor(rng() * n);
      for (let b = 0; b < blockSize && step < horizon; b++, step++) {
        const r = eqDeltas[(start + b) % n];
        eq *= 1 + r;
        if (eq > peak) peak = eq;
        const dd = peak > 0 ? eq / peak - 1 : -1;
        if (dd < mdd) mdd = dd;
        if (r <= 0) { streak++; if (streak > maxStreak) maxStreak = streak; }
        else streak = 0;
      }
    }
    const retPct = (eq - 1) * 100;
    finals.push(retPct);
    mdds.push(mdd * 100);
    streaks.push(maxStreak);
    if (retPct > 0) positive++;
  }

  return {
    tradesSample: n,
    draws,
    p5Pct: quantile(finals, 0.05),
    p50Pct: quantile(finals, 0.5),
    p95Pct: quantile(finals, 0.95),
    mddP50Pct: quantile(mdds, 0.5),
    mddP95Pct: quantile(mdds, 0.05), // 5ᵉ centile des drawdowns négatifs = 95 % pire baisse
    mddP99Pct: quantile(mdds, 0.01),
    probPositivePct: (positive / draws) * 100,
    worstStreakP95: Math.round(quantile(streaks, 0.95)),
  };
}
