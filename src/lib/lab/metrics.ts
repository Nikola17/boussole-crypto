// Mesures de performance d'un portefeuille simulé : performance pondérée par le temps (insensible aux apports),
// baisse maximale, trades clos, distribution sur fenêtres glissantes, et les deux références Bitcoin.

import type { Candle } from '../indicators';
import { quantile } from './stats';
import { dayOf } from './universe';
import type { CostModel, Fill } from './types';

export interface DayPoint { day: string; valueUsd: number; cashUsd: number; flowUsd: number }

/** Rendements journaliers chaînés, l'apport du jour compté en début de journée. Le premier point sert de base. */
export function twr(series: DayPoint[]): number {
  let idx = 1;
  for (let t = 1; t < series.length; t++) {
    const base = series[t - 1].valueUsd + series[t].flowUsd;
    if (base > 0) idx *= series[t].valueUsd / base;
  }
  return idx - 1;
}

export function annualize(r: number, days: number): number {
  return days > 0 ? Math.pow(1 + r, 365 / days) - 1 : r;
}

function twrIndex(series: DayPoint[]): number[] {
  const out = [1];
  for (let t = 1; t < series.length; t++) {
    const base = series[t - 1].valueUsd + series[t].flowUsd;
    out.push(out[t - 1] * (base > 0 ? series[t].valueUsd / base : 1));
  }
  return out;
}

/** Plus forte baisse de l'indice TWR depuis son sommet, en % (négatif). */
export function maxDrawdownPct(series: DayPoint[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of twrIndex(series)) {
    peak = Math.max(peak, v);
    mdd = Math.min(mdd, v / peak - 1);
  }
  return mdd * 100;
}

export interface ClosedTrade { coinId: string; openedAt: string; closedAt: string; costUsd: number; proceedsUsd: number; pnlUsd: number; pnlPct: number; r: number | null; feesUsd: number }

/** Une vente = un trade clos, apparié aux achats les plus anciens (premier entré, premier sorti), par crypto. */
export function closedTrades(fills: Fill[]): ClosedTrade[] {
  const lots = new Map<string, { qty: number; costPerUnit: number; at: string; riskPerUnit: number | null; feePerUnit: number }[]>();
  const out: ClosedTrade[] = [];
  for (const f of fills) {
    const list = lots.get(f.coinId) ?? [];
    lots.set(f.coinId, list);
    if (f.side === 'buy') {
      if (!(f.quantity > 0)) continue;
      list.push({ qty: f.quantity, costPerUnit: (f.quantity * f.priceUsd + f.feeUsd) / f.quantity, at: f.at, riskPerUnit: f.stop != null ? f.priceUsd - f.stop : null, feePerUnit: f.feeUsd / f.quantity });
      continue;
    }
    let left = f.quantity;
    let cost = 0;
    let risk: number | null = 0;
    let fees = f.feeUsd;
    let openedAt = '';
    while (left > 1e-12 && list.length) {
      const lot = list[0];
      const q = Math.min(lot.qty, left);
      if (!openedAt) openedAt = lot.at;
      cost += q * lot.costPerUnit;
      fees += q * lot.feePerUnit;
      risk = risk == null || lot.riskPerUnit == null || !(lot.riskPerUnit > 0) ? null : risk + q * lot.riskPerUnit;
      lot.qty -= q;
      left -= q;
      if (lot.qty <= 1e-12) list.shift();
    }
    if (!openedAt) continue;
    const proceeds = (f.quantity - left) * f.priceUsd - f.feeUsd;
    const pnl = proceeds - cost;
    out.push({ coinId: f.coinId, openedAt, closedAt: f.at, costUsd: cost, proceedsUsd: proceeds, pnlUsd: pnl, pnlPct: cost > 0 ? (pnl / cost) * 100 : 0, r: risk != null && risk > 0 ? pnl / risk : null, feesUsd: fees });
  }
  return out;
}

export function tradeStatsOf(trades: ClosedTrade[]): { n: number; winRatePct: number; avgWinPct: number; avgLossPct: number; expectancyPct: number; expectancyR: number | null; profitFactor: number | null; maxLosingStreak: number; feesUsd: number } {
  const wins = trades.filter((t) => t.pnlUsd > 0);
  const losses = trades.filter((t) => t.pnlUsd <= 0);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const rs = trades.map((t) => t.r).filter((r): r is number => r != null);
  const lossSum = -losses.reduce((s, t) => s + t.pnlUsd, 0);
  let streak = 0;
  let maxLosingStreak = 0;
  for (const t of trades) { streak = t.pnlUsd <= 0 ? streak + 1 : 0; maxLosingStreak = Math.max(maxLosingStreak, streak); }
  return {
    n: trades.length,
    winRatePct: trades.length ? (wins.length / trades.length) * 100 : 0,
    avgWinPct: mean(wins.map((t) => t.pnlPct)),
    avgLossPct: mean(losses.map((t) => t.pnlPct)),
    expectancyPct: mean(trades.map((t) => t.pnlPct)),
    expectancyR: rs.length ? mean(rs) : null,
    profitFactor: lossSum > 0 ? wins.reduce((s, t) => s + t.pnlUsd, 0) / lossSum : null,
    maxLosingStreak,
    feesUsd: trades.reduce((s, t) => s + t.feesUsd, 0),
  };
}

/** Distribution (10ᵉ, 50ᵉ, 90ᵉ centiles, en %) du TWR sur toutes les fenêtres de L jours. */
export function rollingWindows(series: DayPoint[], L: number): { p10: number; p50: number; p90: number } | null {
  const idx = twrIndex(series);
  const rs: number[] = [];
  for (let s = 0; s + L < idx.length; s++) rs.push((idx[s + L] / idx[s] - 1) * 100);
  if (!rs.length) return null;
  return { p10: quantile(rs, 0.1), p50: quantile(rs, 0.5), p90: quantile(rs, 0.9) };
}

/** Référence : les mêmes apports, investis en Bitcoin à l'ouverture de leur jour, mêmes frais. */
export function referenceDcaBtc(flows: { day: string; usd: number }[], btc: Candle[], costs: CostModel): DayPoint[] {
  if (!flows.length) return [];
  const byDay = new Map<string, number>();
  for (const fl of flows) byDay.set(fl.day, (byDay.get(fl.day) ?? 0) + fl.usd);
  const first = [...byDay.keys()].sort()[0];
  let qty = 0;
  const out: DayPoint[] = [];
  for (const c of btc) {
    const day = dayOf(c.time);
    if (day < first) continue;
    const usd = byDay.get(day) ?? 0;
    if (usd > 0) qty += (usd * (1 - costs.feePct / 100)) / (c.open * (1 + costs.spreadPct / 100));
    out.push({ day, valueUsd: qty * c.close, cashUsd: 0, flowUsd: usd });
  }
  return out;
}

/** Référence : tout le capital en Bitcoin à l'ouverture du premier jour, gardé. */
export function referenceHoldBtc(capitalUsd: number, from: string, to: string, btc: Candle[], costs: CostModel): DayPoint[] {
  let qty = 0;
  const out: DayPoint[] = [];
  for (const c of btc) {
    const day = dayOf(c.time);
    if (day < from || day > to) continue;
    if (!out.length) qty = (capitalUsd * (1 - costs.feePct / 100)) / (c.open * (1 + costs.spreadPct / 100));
    out.push({ day, valueUsd: qty * c.close, cashUsd: 0, flowUsd: 0 });
  }
  return out;
}

/** Rendements quotidiens TWR (insensibles aux dépôts/retraits). */
export function dailyReturns(series: DayPoint[]): number[] {
  const out: number[] = [];
  for (let t = 1; t < series.length; t++) {
    const base = series[t - 1].valueUsd + series[t].flowUsd;
    if (base > 0) out.push(series[t].valueUsd / base - 1);
  }
  return out;
}

/** Ratio de Sharpe annualisé (365 j crypto), taux sans risque annuel `rfAnnual` (ex. 0 ou 0.04). */
export function sharpeRatio(series: DayPoint[], rfAnnual = 0): number | null {
  const rets = dailyReturns(series);
  if (rets.length < 5) return null;
  const rfDay = rfAnnual / 365;
  const excess = rets.map((r) => r - rfDay);
  const mean = excess.reduce((s, r) => s + r, 0) / excess.length;
  const variance = excess.reduce((s, r) => s + (r - mean) ** 2, 0) / (excess.length - 1);
  const sd = Math.sqrt(variance);
  return sd > 1e-12 ? (mean / sd) * Math.sqrt(365) : null;
}

/** Ratio de Sortino annualisé : ne pénalise que la volatilité baissière (sous le taux sans risque). */
export function sortinoRatio(series: DayPoint[], rfAnnual = 0): number | null {
  const rets = dailyReturns(series);
  if (rets.length < 5) return null;
  const rfDay = rfAnnual / 365;
  const excess = rets.map((r) => r - rfDay);
  const mean = excess.reduce((s, r) => s + r, 0) / excess.length;
  const downSq = excess.reduce((s, r) => s + (r < 0 ? r * r : 0), 0) / excess.length;
  const downDev = Math.sqrt(downSq);
  return downDev > 1e-12 ? (mean / downDev) * Math.sqrt(365) : null;
}

/** Ratio de Calmar : rendement annualisé divisé par la pire baisse absolue. */
export function calmarRatio(series: DayPoint[]): number | null {
  if (series.length < 5) return null;
  const mdd = Math.abs(maxDrawdownPct(series));
  if (!(mdd > 1e-6)) return null;
  const annPct = annualize(twr(series), series.length) * 100;
  return annPct / mdd;
}

/** Ulcer Index : racine de la moyenne des carrés des drawdowns quotidiens (en %). Mesure profondeur et durée des pertes. */
export function ulcerIndex(series: DayPoint[]): number | null {
  if (series.length < 5) return null;
  const idx = twrIndex(series);
  let peak = -Infinity;
  let sumSq = 0;
  for (const v of idx) {
    peak = Math.max(peak, v);
    const ddPct = peak > 0 ? Math.min(0, (v / peak - 1) * 100) : 0;
    sumSq += ddPct * ddPct;
  }
  return Math.sqrt(sumSq / idx.length);
}

/** Part du temps où le portefeuille est effectivement investi (> 5 % hors cash), en %. */
export function exposurePct(series: DayPoint[]): number | null {
  if (!series.length) return null;
  let investedDays = 0;
  for (const p of series) {
    if (p.valueUsd > 0 && (p.valueUsd - p.cashUsd) / p.valueUsd > 0.05) investedDays++;
  }
  return (investedDays / series.length) * 100;
}

/** Alpha annualisé (%) et Beta de la stratégie face à une série de référence (ex. Bitcoin). */
export function alphaBetaVsRef(series: DayPoint[], ref: DayPoint[]): { alphaAnnPct: number; beta: number } | null {
  const byDay = new Map(ref.map((p, idx) => [p.day, idx]));
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const cur = series[i];
    const prev = series[i - 1];
    const j = byDay.get(cur.day);
    const jPrev = byDay.get(prev.day);
    if (j == null || jPrev == null || jPrev >= j) continue;
    const baseA = prev.valueUsd + cur.flowUsd;
    const baseB = ref[jPrev].valueUsd + ref[j].flowUsd;
    if (baseA > 0 && baseB > 0) {
      ra.push(cur.valueUsd / baseA - 1);
      rb.push(ref[j].valueUsd / baseB - 1);
    }
  }
  if (ra.length < 10) return null;
  const ma = ra.reduce((s, x) => s + x, 0) / ra.length;
  const mb = rb.reduce((s, x) => s + x, 0) / rb.length;
  let cov = 0, varB = 0;
  for (let i = 0; i < ra.length; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    varB += (rb[i] - mb) ** 2;
  }
  if (!(varB > 1e-12)) return null;
  const beta = cov / varB;
  const alphaAnnPct = (ma - beta * mb) * 365 * 100;
  return { alphaAnnPct, beta };
}
