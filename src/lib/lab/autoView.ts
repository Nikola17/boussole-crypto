// Ce qu'affiche un autopilote : sa courbe jour par jour (rejouée depuis ses journaux, aux clôtures), la référence
// « mêmes apports en Bitcoin », ses exécutions, et ce que l'historique attend d'une période de même durée.

import bench from '../../data/strategies-bench.json';
import type { PaperDayLog, PaperPortfolio } from '../../types';
import type { DayPoint } from './metrics';
import type { CostModel, Fill } from './types';

const addDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);

export function autoEquitySeries(p: PaperPortfolio, logs: PaperDayLog[], closes: Map<string, Map<string, number>>, from: string, to: string): DayPoint[] {
  const sorted = logs.filter((l) => l.portfolioId === p.id).sort((a, b) => a.day.localeCompare(b.day));
  let cash = p.startingUsd;
  const qty = new Map<string, number>();
  const last = new Map<string, number>();
  let k = 0;
  const out: DayPoint[] = [];
  for (let day = sorted.length && sorted[0].day < from ? sorted[0].day : from; day <= to; day = addDay(day)) {
    let flow = 0;
    while (k < sorted.length && sorted[k].day <= day) {
      const l = sorted[k++];
      cash += l.depositUsd;
      flow += l.depositUsd;
      for (const f of l.fills) {
        last.set(f.coinId, f.marketUsd);
        if (f.side === 'buy') { cash -= f.quantity * f.priceUsd + f.feeUsd; qty.set(f.coinId, (qty.get(f.coinId) ?? 0) + f.quantity); }
        else { cash += f.quantity * f.priceUsd - f.feeUsd; qty.set(f.coinId, Math.max(0, (qty.get(f.coinId) ?? 0) - f.quantity)); }
      }
    }
    let value = cash;
    for (const [coinId, q] of qty) {
      const c = closes.get(coinId)?.get(day);
      if (c != null) last.set(coinId, c);
      value += q * (last.get(coinId) ?? 0);
    }
    if (day >= from) out.push({ day, valueUsd: Math.round(value * 1e8) / 1e8, cashUsd: cash, flowUsd: flow });
  }
  return out;
}

/** Les mêmes apports investis en Bitcoin à la clôture de leur jour, mêmes frais. */
export function dcaReferenceFromCloses(flows: { day: string; usd: number }[], btc: Map<string, number>, costs: CostModel): DayPoint[] {
  const byDay = new Map<string, number>();
  for (const f of flows) byDay.set(f.day, (byDay.get(f.day) ?? 0) + f.usd);
  const days = [...btc.keys()].sort().filter((d) => d >= ([...byDay.keys()].sort()[0] ?? '9999'));
  let qty = 0;
  let last = 0;
  return days.map((day) => {
    const px = btc.get(day) ?? last;
    last = px;
    const usd = byDay.get(day) ?? 0;
    if (usd > 0 && px > 0) qty += (usd * (1 - costs.feePct / 100)) / (px * (1 + costs.spreadPct / 100));
    return { day, valueUsd: Math.round(qty * px * 1e8) / 1e8, cashUsd: 0, flowUsd: usd };
  });
}

export function logsToFills(logs: PaperDayLog[]): Fill[] {
  return [...logs].sort((a, b) => a.day.localeCompare(b.day)).flatMap((l) => l.fills.map((f) => ({ ...f })));
}

type BenchFile = { entries: Record<string, { runs: { fill: string; costs: string; windows: Record<string, { p10: number }> }[] }> };

/** 10ᵉ centile historique (en %) de la performance sur la plus longue fenêtre ≤ `days` ; null si inconnu ou trop court. */
export function benchP10(strategyId: string, days: number): number | null {
  const run = (bench as BenchFile).entries[strategyId]?.runs.find((r) => r.fill === 'nextOpen' && r.costs === 'exchange');
  if (!run) return null;
  const L = [365, 180, 90, 60, 30].find((x) => x <= days && run.windows[String(x)]);
  return L ? run.windows[String(L)].p10 : null;
}
