// DCA (investissement programmé) : calendrier, multiplicateurs « intelligents » et backtest.

import { maxDrawdown, sma } from './indicators';
import { FNG } from './thresholds';

export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type DcaStrategy = 'classic' | 'fear_greed' | 'mayer' | 'cycle';

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: 'Chaque jour',
  weekly: 'Chaque semaine',
  biweekly: 'Toutes les 2 semaines',
  monthly: 'Chaque mois',
};

export const STRATEGY_LABEL: Record<DcaStrategy, string> = {
  classic: 'Classique (montant fixe)',
  fear_greed: 'Intelligent — Fear & Greed',
  mayer: 'Intelligent — Multiple de Mayer',
  cycle: 'Intelligent — Température du marché',
};

export const STRATEGY_HELP: Record<DcaStrategy, string> = {
  classic: 'Le même montant à chaque échéance, quoi qu’il arrive. Simple et redoutablement efficace.',
  fear_greed: 'Investit plus quand le marché a peur (×2 en peur extrême, Fear & Greed de 24 ou moins) et moins quand il est avide (×0,25 au-delà de 89).',
  mayer: 'Investit plus quand le prix est sous sa moyenne 200 jours (soldes) et moins quand il s’en éloigne fortement (surchauffe).',
  cycle: 'Suit la température globale du marché calculée par Boussole (peur extrême ×2 → euphorie ×0,25).',
};

export interface DcaPlanLike {
  frequency: Frequency;
  startDate: string; // AAAA-MM-JJ
  dayOfWeek?: number; // 1 = lundi ... 7 = dimanche
  dayOfMonth?: number; // 1-28
}

export function fngMultiplier(fng: number): number {
  if (!Number.isFinite(fng)) return 1;
  if (fng <= FNG.extremeFearMax) return 2;
  if (fng <= FNG.fearMax) return 1.5;
  if (fng <= 55) return 1;
  if (fng <= 75) return 0.75;
  if (fng <= 89) return 0.5;
  return 0.25;
}

export function mayerMultiplier(mayer: number): number {
  if (!Number.isFinite(mayer)) return 1;
  if (mayer < 0.8) return 2;
  if (mayer < 1) return 1.5;
  if (mayer < 1.3) return 1;
  if (mayer < 1.8) return 0.75;
  if (mayer < 2.4) return 0.5;
  return 0.25;
}

export function temperatureMultiplier(t: number): number {
  if (!Number.isFinite(t)) return 1;
  if (t < 20) return 2;
  if (t < 40) return 1.5;
  if (t < 60) return 1;
  if (t < 80) return 0.5;
  return 0.25;
}

export function multiplierFor(strategy: DcaStrategy, ctx: { fng?: number; mayer?: number; temperature?: number }): { mult: number; reason: string } {
  switch (strategy) {
    case 'fear_greed': {
      const m = fngMultiplier(ctx.fng ?? NaN);
      return { mult: m, reason: ctx.fng != null ? `Fear & Greed à ${Math.round(ctx.fng)}` : 'Fear & Greed indisponible' };
    }
    case 'mayer': {
      const m = mayerMultiplier(ctx.mayer ?? NaN);
      return { mult: m, reason: ctx.mayer != null && Number.isFinite(ctx.mayer) ? `Multiple de Mayer ${ctx.mayer.toFixed(2).replace('.', ',')}` : 'Multiple de Mayer indisponible' };
    }
    case 'cycle': {
      const m = temperatureMultiplier(ctx.temperature ?? NaN);
      return { mult: m, reason: ctx.temperature != null ? `Température du marché ${Math.round(ctx.temperature)}/100` : 'Température indisponible' };
    }
    default:
      return { mult: 1, reason: 'Montant fixe' };
  }
}

function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Nombre de jours calendaires entre deux dates, insensible au changement d'heure (une « journée » locale peut durer 23 ou 25 h). */
function daysBetween(from: Date, to: Date): number {
  return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86_400_000);
}

/** Prochaines échéances à partir de `from` (incluse). */
export function nextOccurrences(plan: DcaPlanLike, from: Date, count = 5): Date[] {
  const out: Date[] = [];
  const start = startOfDay(parseDay(plan.startDate));
  let cursor = startOfDay(from < start ? start : from);
  let guard = 0;
  while (out.length < count && guard < 800) {
    guard++;
    if (isScheduledDay(plan, cursor)) out.push(new Date(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return out;
}

export function isScheduledDay(plan: DcaPlanLike, day: Date): boolean {
  const start = startOfDay(parseDay(plan.startDate));
  const d = startOfDay(day);
  if (d < start) return false;
  const dow = ((d.getDay() + 6) % 7) + 1; // 1 = lundi
  switch (plan.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return dow === (plan.dayOfWeek ?? (((start.getDay() + 6) % 7) + 1));
    case 'biweekly': {
      const target = plan.dayOfWeek ?? (((start.getDay() + 6) % 7) + 1);
      if (dow !== target) return false;
      const weeks = Math.floor(daysBetween(start, d) / 7);
      return weeks % 2 === 0;
    }
    case 'monthly':
      return d.getDate() === Math.min(plan.dayOfMonth ?? start.getDate(), 28);
  }
}

/** Clé de la période en cours (pour savoir si l'achat de la période a été fait). */
export function periodKey(plan: DcaPlanLike, day: Date): string {
  const d = startOfDay(day);
  const start = startOfDay(parseDay(plan.startDate));
  switch (plan.frequency) {
    case 'daily':
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    case 'weekly': {
      const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
      return `w-${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`;
    }
    case 'biweekly': {
      const weeks = Math.floor(daysBetween(start, d) / 7);
      return `b-${Math.floor(weeks / 2)}`;
    }
    case 'monthly':
      return `m-${d.getFullYear()}-${d.getMonth() + 1}`;
  }
}

/** Dernière échéance passée ou du jour (null si le plan n'a pas encore commencé). */
export function lastOccurrence(plan: DcaPlanLike, today: Date): Date | null {
  const start = startOfDay(parseDay(plan.startDate));
  let cursor = startOfDay(today);
  for (let i = 0; i < 400; i++) {
    if (cursor < start) return null;
    if (isScheduledDay(plan, cursor)) return cursor;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return null;
}

// ---------------------------------------------------------------- Backtest

export interface PricePoint {
  time: number; // secondes
  close: number;
}

export interface BacktestPoint {
  time: number;
  invested: number;
  value: number;
}

export interface BacktestSummary {
  strategy: DcaStrategy;
  invested: number;
  value: number;
  units: number;
  roiPct: number;
  avgCost: number;
  buys: number;
  /** Pire perte latente par rapport au capital investi (%) */
  worstPct: number;
  maxDrawdownPct: number;
}

export interface BacktestResult {
  summary: BacktestSummary;
  points: BacktestPoint[];
}

export function dayKeyUTC(tsSec: number): string {
  return new Date(tsSec * 1000).toISOString().slice(0, 10);
}

export function backtestDca(opts: {
  prices: PricePoint[];
  amount: number;
  frequency: Frequency;
  strategy: DcaStrategy;
  startTime: number; // secondes
  fngByDay?: Map<string, number>;
  feePct?: number;
}): BacktestResult {
  const { prices, amount, frequency, strategy, startTime, fngByDay, feePct = 0.1 } = opts;
  const closes = prices.map((p) => p.close);
  const s200 = sma(closes, 200);
  let units = 0;
  let invested = 0;
  let buys = 0;
  let lastBuy: number | null = null;
  const points: BacktestPoint[] = [];
  const startDate = new Date(startTime * 1000);
  const dom = Math.min(startDate.getUTCDate(), 28);

  for (let i = 0; i < prices.length; i++) {
    const p = prices[i];
    if (p.time < startTime) continue;
    const d = new Date(p.time * 1000);
    let due = false;
    if (lastBuy == null) due = true;
    else if (frequency === 'daily') due = true;
    else if (frequency === 'weekly') due = p.time - lastBuy >= 7 * 86400 - 3600;
    else if (frequency === 'biweekly') due = p.time - lastBuy >= 14 * 86400 - 3600;
    else if (frequency === 'monthly') {
      const lb = new Date(lastBuy * 1000);
      due = d.getUTCDate() === dom && (d.getUTCMonth() !== lb.getUTCMonth() || d.getUTCFullYear() !== lb.getUTCFullYear());
    }
    if (due) {
      let mult = 1;
      if (strategy === 'fear_greed') mult = fngMultiplier(fngByDay?.get(dayKeyUTC(p.time)) ?? NaN);
      else if (strategy === 'mayer') mult = mayerMultiplier(Number.isFinite(s200[i]) ? p.close / s200[i] : NaN);
      const spend = amount * mult;
      if (spend > 0) {
        units += (spend * (1 - feePct / 100)) / p.close;
        invested += spend;
        buys++;
      }
      lastBuy = p.time;
    }
    points.push({ time: p.time, invested, value: units * p.close });
  }

  const lastP = points[points.length - 1];
  const value = lastP ? lastP.value : 0;
  return {
    summary: {
      strategy,
      invested,
      value,
      units,
      roiPct: invested > 0 ? (value / invested - 1) * 100 : 0,
      avgCost: units > 0 ? invested / units : 0,
      buys,
      worstPct: worstUnderwater(points),
      maxDrawdownPct: maxDrawdown(points.map((pt) => pt.value)),
    },
    points,
  };
}

/** Pire écart entre la valeur du portefeuille et le total investi (en %, négatif = perte latente). */
export function worstUnderwater(points: BacktestPoint[]): number {
  let worst = 0;
  for (const p of points) {
    if (p.invested > 0) worst = Math.min(worst, (p.value / p.invested - 1) * 100);
  }
  return worst;
}
