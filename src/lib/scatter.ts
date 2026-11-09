// Éparpillement : trop de petites lignes ne rapportent presque rien et coûtent un écart de prix à chaque achat.

import type { Bucket } from '../types';

export interface ScatterLine {
  key: string;
  symbol: string;
  value: number;
  pct: number;
  bucket: Bucket;
}

export interface ScatterReport {
  total: number;
  lines: ScatterLine[];
  /** Lignes qui pèsent moins que `minLinePct` du portefeuille. */
  tiny: ScatterLine[];
  tinyValue: number;
  tinyPct: number;
  discoveryLines: number;
  tooMany: boolean;
  tooManyDiscovery: boolean;
}

export interface ScatterRules {
  maxLines: number;
  minLinePct: number;
  maxDiscoveryLines: number;
}

/** Lignes = cryptos distinctes (une même crypto détenue à deux endroits ne compte qu'une fois), hors stablecoins. */
export function scatterReport(
  holdings: { key: string; coinId?: string; symbol: string; value: number; bucket: Bucket }[],
  rules: ScatterRules,
): ScatterReport {
  const byCoin = new Map<string, { symbol: string; value: number; bucket: Bucket }>();
  for (const h of holdings) {
    if (h.bucket === 'stable' || !(h.value > 0)) continue;
    const k = h.coinId ?? h.key;
    const cur = byCoin.get(k);
    if (cur) cur.value += h.value;
    else byCoin.set(k, { symbol: h.symbol, value: h.value, bucket: h.bucket });
  }
  const total = [...byCoin.values()].reduce((s, l) => s + l.value, 0);
  const lines: ScatterLine[] = [...byCoin.entries()]
    .map(([key, l]) => ({ key, symbol: l.symbol, value: l.value, pct: total > 0 ? (l.value / total) * 100 : 0, bucket: l.bucket }))
    .sort((a, b) => b.value - a.value);
  const tiny = lines.filter((l) => l.pct < rules.minLinePct);
  const tinyValue = tiny.reduce((s, l) => s + l.value, 0);
  const discoveryLines = lines.filter((l) => l.bucket === 'mid' || l.bucket === 'small').length;
  return {
    total,
    lines,
    tiny,
    tinyValue,
    tinyPct: total > 0 ? (tinyValue / total) * 100 : 0,
    discoveryLines,
    tooMany: lines.length > rules.maxLines,
    tooManyDiscovery: discoveryLines > rules.maxDiscoveryLines,
  };
}
