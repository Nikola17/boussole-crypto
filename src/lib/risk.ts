// Calculateur de taille de position et statistiques de journal de trading.

import type { TradeEntry } from '../types';

export interface SizingInput {
  capital: number;
  riskPct: number;
  entry: number;
  stop: number;
  takeProfit?: number;
  leverage?: number;
  side?: 'long' | 'short';
  feePct?: number; // frais par côté, en %
  maintenancePct?: number; // marge de maintenance, en %
}

export interface SizingResult {
  quantity: number;
  notional: number;
  margin: number;
  riskAmount: number;
  stopDistancePct: number;
  rr: number | null;
  potentialGain: number | null;
  liquidationPrice: number | null;
  fees: number;
  warnings: string[];
}

export function positionSize(i: SizingInput): SizingResult | null {
  const side = i.side ?? 'long';
  const lev = Math.max(1, i.leverage ?? 1);
  if (!(i.capital > 0) || !(i.entry > 0) || !(i.stop > 0) || !(i.riskPct > 0)) return null;
  const perUnitRisk = side === 'long' ? i.entry - i.stop : i.stop - i.entry;
  if (perUnitRisk <= 0) return null;
  const riskAmount = (i.capital * i.riskPct) / 100;
  let quantity = riskAmount / perUnitRisk;
  let notional = quantity * i.entry;
  const warnings: string[] = [];
  const maxNotional = i.capital * lev;
  if (notional > maxNotional) {
    quantity = maxNotional / i.entry;
    notional = maxNotional;
    warnings.push(`Position plafonnée par ton capital × levier : le risque réel est inférieur à ${i.riskPct} %.`);
  }
  const margin = notional / lev;
  const feePct = i.feePct ?? 0.1;
  const fees = notional * (feePct / 100) * 2;
  const mm = (i.maintenancePct ?? 0.5) / 100;
  let liquidationPrice: number | null = null;
  if (lev > 1) {
    liquidationPrice = side === 'long' ? i.entry * (1 - 1 / lev + mm) : i.entry * (1 + 1 / lev - mm);
    const stopBeyondLiq = side === 'long' ? i.stop <= liquidationPrice : i.stop >= liquidationPrice;
    if (stopBeyondLiq) warnings.push('Ton stop est au-delà du prix de liquidation : tu seras liquidé avant que le stop ne se déclenche.');
    if (lev >= 10) warnings.push('Levier ≥ 10 : une variation de quelques % suffit à te liquider. Réservé aux traders expérimentés.');
  }
  let rr: number | null = null;
  let potentialGain: number | null = null;
  if (i.takeProfit && i.takeProfit > 0) {
    const perUnitGain = side === 'long' ? i.takeProfit - i.entry : i.entry - i.takeProfit;
    if (perUnitGain > 0) {
      rr = perUnitGain / perUnitRisk;
      potentialGain = perUnitGain * quantity;
      if (rr < 1.5) warnings.push('Ratio gain/risque < 1,5 : il te faut un taux de réussite élevé pour être rentable.');
    } else warnings.push('L’objectif est du mauvais côté du prix d’entrée.');
  }
  const stopDistancePct = (perUnitRisk / i.entry) * 100;
  if (i.riskPct > 3) warnings.push('Risquer plus de 3 % du capital par trade expose à une série de pertes destructrice.');
  return { quantity, notional, margin, riskAmount, stopDistancePct, rr, potentialGain, liquidationPrice, fees, warnings };
}

export interface TradeStats {
  closed: number;
  open: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number | null;
  expectancy: number;
  avgR: number | null;
  equity: { time: number; value: number }[];
  bySetup: { setup: string; count: number; pnl: number; winRate: number }[];
  /** Plus forte baisse de la courbe de résultats cumulés, depuis son dernier sommet ($, valeur positive). */
  maxDrawdown: number;
  /** Plus longue série de trades perdants consécutifs. */
  maxLosingStreak: number;
}

export function tradePnl(t: TradeEntry): number | null {
  if (t.status !== 'closed' || t.exitPrice == null) return null;
  const dir = t.side === 'long' ? 1 : -1;
  return (t.exitPrice - t.entryPrice) * t.quantity * dir - (t.fees || 0);
}

export function tradeR(t: TradeEntry): number | null {
  const pnl = tradePnl(t);
  if (pnl == null || t.stopLoss == null) return null;
  const risk = Math.abs(t.entryPrice - t.stopLoss) * t.quantity;
  return risk > 0 ? pnl / risk : null;
}

export function tradeStats(trades: TradeEntry[]): TradeStats {
  const closed = trades.filter((t) => t.status === 'closed' && t.exitPrice != null)
    .sort((a, b) => (a.exitDate ?? a.entryDate).localeCompare(b.exitDate ?? b.entryDate));
  const pnls = closed.map((t) => tradePnl(t) ?? 0);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p <= 0);
  const sumWin = wins.reduce((s, p) => s + p, 0);
  const sumLoss = Math.abs(losses.reduce((s, p) => s + p, 0));
  const rs = closed.map(tradeR).filter((r): r is number => r != null);
  let cum = 0;
  const equity = closed.map((t, i) => {
    cum += pnls[i];
    return { time: new Date(t.exitDate ?? t.entryDate).getTime() / 1000, value: cum };
  });
  const setups = new Map<string, { count: number; pnl: number; wins: number }>();
  closed.forEach((t, i) => {
    const k = t.setup?.trim() || 'Sans setup';
    const s = setups.get(k) ?? { count: 0, pnl: 0, wins: 0 };
    s.count++;
    s.pnl += pnls[i];
    if (pnls[i] > 0) s.wins++;
    setups.set(k, s);
  });
  let peak = 0;
  let maxDrawdown = 0;
  for (const e of equity) {
    peak = Math.max(peak, e.value);
    maxDrawdown = Math.max(maxDrawdown, peak - e.value);
  }
  let streak = 0;
  let maxLosingStreak = 0;
  for (const p of pnls) {
    streak = p <= 0 ? streak + 1 : 0;
    maxLosingStreak = Math.max(maxLosingStreak, streak);
  }
  return {
    maxDrawdown,
    maxLosingStreak,
    closed: closed.length,
    open: trades.filter((t) => t.status === 'open').length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    totalPnl: pnls.reduce((s, p) => s + p, 0),
    avgWin: wins.length ? sumWin / wins.length : 0,
    avgLoss: losses.length ? -sumLoss / losses.length : 0,
    profitFactor: sumLoss > 0 ? sumWin / sumLoss : wins.length ? null : null,
    expectancy: closed.length ? pnls.reduce((s, p) => s + p, 0) / closed.length : 0,
    avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
    equity,
    bySetup: [...setups.entries()].map(([setup, s]) => ({ setup, count: s.count, pnl: s.pnl, winRate: (s.wins / s.count) * 100 }))
      .sort((a, b) => b.pnl - a.pnl),
  };
}

export interface OpenTradeStatus {
  /** Résultat latent au cours donné, frais d'entrée déduits ($). */
  pnl: number;
  /** Résultat latent exprimé en R (multiples du risque initial) ; null sans stop. */
  r: number | null;
  /** Le cours a franchi le stop : la position aurait dû être coupée. */
  stopHit: boolean;
  /** Le cours a atteint l'objectif. */
  targetHit: boolean;
  /** Distance au stop et à l'objectif, en % du cours (positive = encore de la marge). */
  toStopPct: number | null;
  toTargetPct: number | null;
}

/** Un trade ouvert, valorisé au cours du moment : où en est-il par rapport à son stop et à son objectif ? */
export function openTradeStatus(t: TradeEntry, price: number): OpenTradeStatus | null {
  if (t.status !== 'open' || !(price > 0) || !(t.entryPrice > 0) || !(t.quantity > 0)) return null;
  const dir = t.side === 'long' ? 1 : -1;
  const pnl = (price - t.entryPrice) * t.quantity * dir - (t.fees || 0);
  const risk = t.stopLoss != null ? Math.abs(t.entryPrice - t.stopLoss) * t.quantity : 0;
  const stopHit = t.stopLoss != null && (dir === 1 ? price <= t.stopLoss : price >= t.stopLoss);
  const targetHit = t.takeProfit != null && (dir === 1 ? price >= t.takeProfit : price <= t.takeProfit);
  return {
    pnl,
    r: risk > 0 ? pnl / risk : null,
    stopHit,
    targetHit,
    toStopPct: t.stopLoss != null ? ((price - t.stopLoss) / price) * 100 * dir : null,
    toTargetPct: t.takeProfit != null ? ((t.takeProfit - price) / price) * 100 * dir : null,
  };
}
