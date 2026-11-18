// Métriques de risque du portefeuille : concentration, corrélation au Bitcoin, répartition par
// plateforme (risque de contrepartie) et scénarios de krach. Fonctions pures, testées.

import type { Bucket } from '../types';
import { concentration, stressTest } from './portfolio';

/** Corrélation de Pearson entre deux séries de prix (mêmes points dans le temps). */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 5) return null;
  const mx = xs.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = ys.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx <= 0 || dy <= 0) return null;
  return num / Math.sqrt(dx * dy);
}

export interface RiskLine {
  symbol: string;
  bucket: Bucket;
  value: number;
  coinId?: string;
  /** Série de prix (sparkline 7 j) pour la corrélation au BTC. */
  series?: number[];
  /** Où est détenue la ligne : compte, wallet, ou « Journal ». */
  source: string;
}

export interface SourceSplit {
  label: string;
  value: number;
  pct: number;
}

export interface RiskScenario {
  label: string;
  changePct: number;
  value: number;
}

export interface RiskMetrics {
  total: number;
  /** Concentration Herfindahl normalisée 0-100 (100 = un seul actif). */
  hhi: number;
  top1Pct: number;
  top3Pct: number;
  /** Corrélation moyenne des lignes non stables avec Bitcoin (-1 à 1) ; null sans assez de données. */
  btcCorr: number | null;
  bySource: SourceSplit[];
  scenarios: RiskScenario[];
}

export function riskMetrics(i: {
  total: number;
  alloc: Record<Bucket, number>;
  lines: RiskLine[];
  btcSeries?: number[];
}): RiskMetrics {
  const { total, alloc, lines } = i;
  const values = lines.map((l) => l.value);
  const sorted = [...values].sort((a, b) => b - a);
  const top1Pct = total > 0 ? (sorted[0] ?? 0) / total * 100 : 0;
  const top3Pct = total > 0 ? sorted.slice(0, 3).reduce((s, v) => s + v, 0) / total * 100 : 0;

  let corrSum = 0;
  let corrN = 0;
  if (i.btcSeries) {
    for (const l of lines) {
      if (l.bucket === 'stable' || !l.series) continue;
      const c = pearson(l.series, i.btcSeries);
      if (c != null) { corrSum += c; corrN++; }
    }
  }

  const bySourceMap = new Map<string, number>();
  for (const l of lines) bySourceMap.set(l.source, (bySourceMap.get(l.source) ?? 0) + l.value);
  const bySource: SourceSplit[] = [...bySourceMap.entries()]
    .map(([label, value]) => ({ label, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  const s30 = stressTest(alloc, -30);
  const s50 = stressTest(alloc, -50);
  const scenarios: RiskScenario[] = [
    { label: 'BTC −30 % (correction forte)', changePct: s30.changePct, value: total * (1 + s30.changePct / 100) },
    { label: 'BTC −50 % (krach, les alts suivent plus fort)', changePct: s50.changePct, value: total * (1 + s50.changePct / 100) },
  ];

  return {
    total,
    hhi: concentration(values),
    top1Pct,
    top3Pct,
    btcCorr: corrN > 0 ? corrSum / corrN : null,
    bySource,
    scenarios,
  };
}
