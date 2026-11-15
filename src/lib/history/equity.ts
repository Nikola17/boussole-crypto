// Courbe du vrai portefeuille, reconstituée d'après le journal : quantités détenues jour par jour × clôtures,
// apports et retraits tirés des flux en monnaie classique (les transferts entre tes comptes sont neutres).
// Limite : ce que le journal ne décrit pas (soldes lus sur la blockchain sans transaction) n'est pas reconstituable.

import type { Transaction } from '../../types';
import { fiatFlows } from '../benchmark';
import { priceUsdOf } from '../fees';
import { isStable } from '../portfolio';
import { maxDrawdownPct, twr, type DayPoint } from '../lab/metrics';
import { xirr } from '../lab/stats';

const addDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
const DELTA: Record<Transaction['type'], number> = { buy: 1, deposit: 1, reward: 1, sell: -1, withdraw: -1, transfer: 0 };

export function journalEquity(txs: Transaction[], closes: Map<string, Map<string, number>>, from: string, to: string): { series: DayPoint[]; missing: string[] } {
  const sorted = [...txs].sort((a, b) => (a.time ?? a.date).localeCompare(b.time ?? b.date));
  const flowsByDay = new Map<string, number>();
  for (const f of fiatFlows(txs)) flowsByDay.set(f.date, (flowsByDay.get(f.date) ?? 0) + f.usd);
  const qty = new Map<string, number>();
  const last = new Map<string, number>();
  const stable = new Map<string, boolean>();
  const missing = new Set<string>();
  const series: DayPoint[] = [];
  let k = 0;
  for (let day = from; day <= to; day = addDay(day)) {
    while (k < sorted.length && sorted[k].date <= day) {
      const t = sorted[k++];
      qty.set(t.coinId, (qty.get(t.coinId) ?? 0) + DELTA[t.type] * t.quantity);
      stable.set(t.coinId, isStable(t.symbol, t.coinId));
      if (t.price > 0) last.set(t.coinId, priceUsdOf(t));
    }
    let value = 0;
    for (const [coinId, q] of qty) {
      if (Math.abs(q) < 1e-12) continue;
      const c = closes.get(coinId)?.get(day);
      if (c != null) last.set(coinId, c);
      else if (stable.get(coinId)) last.set(coinId, 1);
      else missing.add(coinId);
      value += q * (last.get(coinId) ?? 0);
    }
    series.push({ day, valueUsd: Math.round(value * 1e6) / 1e6, cashUsd: 0, flowUsd: Math.round((flowsByDay.get(day) ?? 0) * 1e6) / 1e6 });
  }
  return { series, missing: [...missing].sort() };
}

export function periodStats(series: DayPoint[]): { twrPct: number; xirrPct: number | null; maxDrawdownPct: number; bestMonth: { month: string; pct: number } | null; worstMonth: { month: string; pct: number } | null } {
  const flows = series.filter((p) => p.flowUsd !== 0).map((p) => ({ t: Date.parse(`${p.day}T00:00:00Z`), amount: -p.flowUsd }));
  const last = series[series.length - 1];
  const x = last ? xirr([...flows, { t: Date.parse(`${last.day}T00:00:00Z`), amount: last.valueUsd }]) : null;
  const months = new Map<string, DayPoint[]>();
  series.forEach((p, i) => {
    const m = p.day.slice(0, 7);
    if (!months.has(m)) months.set(m, i > 0 ? [series[i - 1]] : []);
    months.get(m)!.push(p);
  });
  const monthly = [...months.entries()].filter(([, pts]) => pts.length > 1).map(([month, pts]) => ({ month, pct: twr(pts) * 100 }));
  const sortedM = [...monthly].sort((a, b) => b.pct - a.pct);
  return {
    twrPct: twr(series) * 100,
    xirrPct: x == null ? null : x * 100,
    maxDrawdownPct: maxDrawdownPct(series),
    bestMonth: sortedM[0] ?? null,
    worstMonth: sortedM[sortedM.length - 1] ?? null,
  };
}
