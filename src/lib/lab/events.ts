// Étude de signal : ce que le prix a fait après chaque signal de Boussole, sur l'historique.
// Conventions (fiche, 8.5) : observation = (actif, jour t) dans l'univers du jour ; entrée à l'ouverture de t+1 ;
// rendement = clôture[t+H] ÷ ouverture[t+1] − 1 ; un épisode (jours consécutifs actifs) compte une fois ;
// période de réglage jusqu'au 31/12/2022, période de contrôle ensuite. Fonction pure, sans réseau.

import { analyze, SETUP_KEYS, type Analysis } from '../signals';
import { zoneFor } from '../cycle';
import { sma, type Candle } from '../indicators';
import { median, wilson } from './stats';
import { pendingHit } from './fills';
import { COSTS } from './types';
import { dayOf, universeAt, type Asset } from './universe';

export type Bias = 'bull' | 'bear' | 'neutral';
export interface KeyMeta { key: string; label: string; bias: Bias; horizon: number; horizons: number[] }
export interface ObsCtx { asset: Asset; i: number; window: Candle[]; analysis: Analysis; temperature: number | null; btcAboveSma200: boolean | null }
export type Extractor = (o: ObsCtx) => string[];
export type Verdict = 'validé' | 'prometteur' | 'sans effet' | 'inversé' | 'trop peu de cas';

export interface PeriodStats {
  days: number; episodes: number;
  hitPct: number; hitLow: number; hitHigh: number;
  medianPct: number; meanPct: number; excessMedianPct: number; worstMedianPct: number;
  baselineHitPct: number; baselineMedianPct: number;
  expectancyR?: number;
}
export interface HorizonStats { all: PeriodStats; tuning: PeriodStats; control: PeriodStats }
export interface KeyStats { meta: KeyMeta; byHorizon: Record<number, HorizonStats>; verdict: Verdict; frequencyPct: number; forcedExits: number }

export const TUNING_END = '2022-12-31';
export const PLAN_TARGETS = [1.5, 2, 3] as const;
const INV = ['Accumuler fort', 'Accumuler', 'Conserver', 'Alléger', 'Prendre des profits'];
const INV_BIAS: Bias[] = ['bull', 'bull', 'neutral', 'bear', 'bear'];
const TR = ['Achat fort', 'Achat', 'Neutre', 'Vente', 'Vente forte'];
const SETUP_BIAS: Record<string, Bias> = { pullback: 'bull', golden: 'bull', breakout: 'bull', squeeze: 'neutral', oversold: 'bull', macd: 'bull', death: 'bear', breakdown: 'bear', overbought: 'bear' };
const ZONES: [string, string, Bias][] = [['capitulation', 'Peur extrême', 'bull'], ['accumulation', 'Accumulation', 'bull'], ['neutre', 'Neutre', 'neutral'], ['chaleur', 'Marché chaud', 'bear'], ['euphorie', 'Euphorie', 'bear']];

/** Toutes les clés mesurées par défaut, avec leur intention et leurs horizons (fiche, tableau de 8.5). */
export const SIGNAL_KEYS: KeyMeta[] = [
  ...INV.map((l, i) => ({ key: `inv:${l}`, label: `Investisseur « ${l} »`, bias: INV_BIAS[i], horizon: 90, horizons: [30, 90, 180, 365] })),
  ...TR.map((l, i) => ({ key: `tr:${l}`, label: `Trader « ${l} »`, bias: INV_BIAS[i], horizon: 14, horizons: [7, 14, 30] })),
  ...Object.entries(SETUP_KEYS).map(([k, l]) => ({ key: `setup:${k}`, label: l, bias: SETUP_BIAS[k] ?? 'neutral', horizon: 30, horizons: [7, 14, 30] })),
  ...ZONES.map(([k, l, b]) => ({ key: `temp:${k}`, label: `Température : ${l} (Bitcoin)`, bias: b, horizon: 365, horizons: [90, 180, 365] })),
  ...TR.flatMap((l) => PLAN_TARGETS.map((r) => ({ key: `plan:${l}@${r}`, label: `Plan de trade, signal « ${l} », objectif ${String(r).replace('.', ',')} R`, bias: 'bull' as Bias, horizon: 30, horizons: [30] }))),
];

/** Extracteur par défaut : les libellés investisseur et trader, les setups, la zone de température (Bitcoin seul), les plans. */
export const DEFAULT_EXTRACTORS: Extractor[] = [(o) => {
  const keys = [`inv:${o.analysis.investor.label}`, `tr:${o.analysis.trader.label}`, ...o.analysis.setups.map((s) => `setup:${s.key}`)];
  if (o.asset.id === 'BTC' && o.temperature != null) keys.push(`temp:${zoneFor(o.temperature).key}`);
  if (o.analysis.plan) for (const r of PLAN_TARGETS) keys.push(`plan:${o.analysis.trader.label}@${r}`);
  return keys;
}];

/** Rendement (en %) de l'ouverture de t+1 à la clôture de t+h, et pire baisse intermédiaire ; null si non observable. */
export function forwardReturn(c: Candle[], t: number, h: number, opts: { seriesEnded: boolean }): { ret: number; worst: number; forced: boolean } | null {
  const entry = c[t + 1]?.open;
  if (!(entry > 0)) return null;
  let end = t + h;
  let forced = false;
  if (end >= c.length) {
    if (!opts.seriesEnded) return null;
    end = c.length - 1;
    forced = true;
  }
  let low = Infinity;
  for (let k = t + 1; k <= end; k++) low = Math.min(low, c[k].low);
  return { ret: (c[end].close / entry - 1) * 100, worst: (low / entry - 1) * 100, forced };
}

export function episodeStarts(activeIdx: number[]): number[] {
  return activeIdx.filter((x, k) => k === 0 || activeIdx[k - 1] !== x - 1);
}

/**
 * Résultat en R d'un plan : entrée à l'ouverture de t+1, stop, objectif à `targetR` R, sortie à la clôture du
 * `maxDays`-ième jour ; stop prioritaire ; frais aller-retour `costPct` (en % du prix) retirés. Null si l'entrée est sous le stop.
 */
export function planR(c: Candle[], t: number, stop: number, targetR: number, maxDays = 30, costPct = 0): number | null {
  const entry = c[t + 1]?.open;
  if (!(entry > stop)) return null;
  const risk = entry - stop;
  const target = entry + targetR * risk;
  const fee = (costPct / 100) * entry / risk;
  const last = Math.min(c.length - 1, t + maxDays);
  for (let k = t + 1; k <= last; k++) {
    const gapRule = k > t + 1;
    const s = pendingHit('stop', stop, c[k], { gapRule });
    if (s != null) return (s - entry) / risk - fee;
    const g = pendingHit('target', target, c[k], { gapRule });
    if (g != null) return (g - entry) / risk - fee;
  }
  return (c[last].close - entry) / risk - fee;
}

const isPlan = (key: string) => key.startsWith('plan:');

/** Verdict d'une clé sur son horizon principal (fiche, 8.5). */
export function verdictOf(s: HorizonStats, meta: KeyMeta): Verdict {
  if (s.all.episodes < 30 || s.control.episodes < 12) return 'trop peu de cas';
  if (isPlan(meta.key)) {
    const c = s.control.expectancyR ?? NaN;
    const t = s.tuning.expectancyR ?? NaN;
    if (c > 0.15 && t > 0) return 'validé';
    if (c < 0 && t < 0) return 'inversé';
    return 'sans effet';
  }
  if (meta.bias === 'neutral') return 'sans effet';
  const sign = meta.bias === 'bull' ? 1 : -1;
  // Écart de médiane avec la référence de la même période : un signal de moment (investisseur, température) gagne
  // souvent avec tout le marché ; l'excès du jour, qui retire le mouvement du marché, l'effacerait par construction.
  const ex = (p: PeriodStats) => sign * (p.medianPct - p.baselineMedianPct);
  const c = s.control;
  const ctrlEdge = sign * (c.hitPct - c.baselineHitPct);
  const bound = sign === 1 ? c.hitLow > c.baselineHitPct : c.hitHigh < c.baselineHitPct;
  if (ctrlEdge >= 5 && bound && ex(s.tuning) > 0 && ex(s.control) > 0) return 'validé';
  if (ctrlEdge <= -5 && ex(s.tuning) < 0 && ex(s.control) < 0) return 'inversé';
  if (sign * (s.all.hitPct - s.all.baselineHitPct) > 3 && ex(s.tuning) > 0 && ex(s.control) > 0) return 'prometteur';
  return 'sans effet';
}

// ------------------------------------------------------------------ accumulation

interface Bucket { ret: number[]; worst: number[]; excess: number[]; planR: number[]; days: number }
const emptyBucket = (): Bucket => ({ ret: [], worst: [], excess: [], planR: [], days: 0 });
const periodOf = (day: string): 'tuning' | 'control' => (day <= TUNING_END ? 'tuning' : 'control');
const pct = (xs: number[]) => (xs.length ? (xs.filter((x) => x > 0).length / xs.length) * 100 : NaN);
const meanOf = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

export interface StudyInput {
  assets: Asset[];
  btc: Asset;
  temperature: Map<string, number>;
  top: number;
  extractors?: Extractor[];
  metas?: KeyMeta[];
  from?: string; to?: string;
  onProgress?: (done: number, total: number) => void;
}

export function studySignals(input: StudyInput): { keys: KeyStats[]; observations: number; dataThrough: string } {
  const metas = new Map((input.metas ?? SIGNAL_KEYS).map((m) => [m.key, m]));
  const extractors = input.extractors ?? DEFAULT_EXTRACTORS;
  const horizons = [...new Set([...metas.values()].flatMap((m) => m.horizons))].sort((a, b) => a - b);
  const dataThrough = input.assets.reduce((m, a) => { const d = dayOf(a.candles[a.candles.length - 1]?.time ?? 0); return d > m ? d : m; }, '');
  const ended = new Map(input.assets.map((a) => [a.id, dayOf(a.candles[a.candles.length - 1].time) < dataThrough]));
  const athPrefix = new Map(input.assets.map((a) => { let m = 0; return [a.id, a.candles.map((c) => (m = Math.max(m, c.high)))]; }));
  const btcSma = sma(input.btc.candles.map((c) => c.close), 200);

  const days = [...new Set(input.assets.flatMap((a) => [...a.dayIndex.keys()]))].sort().filter((d) => (!input.from || d >= input.from) && (!input.to || d <= input.to));
  // Références : toutes les observations (par horizon et période), et Bitcoin seul pour les clés de température.
  const base: Record<'all' | 'btc' | 'plan', Record<string, Record<'tuning' | 'control', number[]>>> = { all: {}, btc: {}, plan: {} };
  const push = (kind: 'all' | 'btc' | 'plan', k: string, p: 'tuning' | 'control', v: number) => { ((base[kind][k] ??= { tuning: [], control: [] })[p]).push(v); };
  const buckets = new Map<string, Record<'tuning' | 'control', Record<number, Bucket>>>();
  const freq = new Map<string, number>();
  const forced = new Map<string, number>();
  const lastActive = new Map<string, number>();
  let observations = 0;
  let btcObservations = 0;

  days.forEach((day, n) => {
    if (input.onProgress && n % 50 === 0) input.onProgress(n, days.length);
    const uni = universeAt(input.assets, day, { top: input.top });
    if (!uni.length) return;
    const period = periodOf(day);
    const bi = input.btc.dayIndex.get(day);
    const btcAbove = bi != null && Number.isFinite(btcSma[bi]) ? input.btc.candles[bi].close > btcSma[bi] : null;
    const temperature = input.temperature.get(day) ?? null;
    // Rendements de tout l'univers du jour : la référence, et la moyenne du jour pour l'excès.
    const fwd = new Map<string, Record<number, ReturnType<typeof forwardReturn>>>();
    for (const a of uni) {
      const i = a.dayIndex.get(day)!;
      const r: Record<number, ReturnType<typeof forwardReturn>> = {};
      for (const h of horizons) r[h] = forwardReturn(a.candles, i, h, { seriesEnded: ended.get(a.id)! });
      fwd.set(a.id, r);
    }
    const dayMean: Record<number, number> = {};
    for (const h of horizons) {
      const xs = uni.map((a) => fwd.get(a.id)![h]?.ret).filter((x): x is number => x != null);
      // Médiane et non moyenne : quelques envolées tireraient la moyenne vers le haut et rendraient tout « excès » négatif.
      dayMean[h] = xs.length >= 5 ? median(xs) : NaN;
    }
    for (const a of uni) {
      const i = a.dayIndex.get(day)!;
      const window = a.candles.slice(Math.max(0, i - 399), i + 1);
      const athChangePct = (a.candles[i].close / athPrefix.get(a.id)![i] - 1) * 100;
      const analysis = analyze(window, { temperature: temperature ?? undefined, athChangePct }, { closedOnly: true });
      if (!analysis) continue;
      observations++;
      if (a.id === 'BTC' || uni.length === 1) btcObservations++;
      const r = fwd.get(a.id)!;
      for (const h of horizons) {
        const x = r[h];
        if (!x) continue;
        push('all', String(h), period, x.ret);
        if (a.id === input.btc.id) push('btc', String(h), period, x.ret);
      }
      const keys = [...new Set(extractors.flatMap((e) => e({ asset: a, i, window, analysis, temperature, btcAboveSma200: btcAbove })))].filter((k) => metas.has(k));
      if (analysis.plan) for (const t of PLAN_TARGETS) {
        const pr = planR(a.candles, i, analysis.plan.stop, t, 30, 2 * (COSTS.exchange.feePct + COSTS.exchange.spreadPct));
        if (pr != null) push('plan', String(t), period, pr);
      }
      for (const key of keys) {
        const meta = metas.get(key)!;
        freq.set(key, (freq.get(key) ?? 0) + 1);
        const lk = `${key}|${a.id}`;
        const isStart = lastActive.get(lk) !== i - 1;
        lastActive.set(lk, i);
        const bk = buckets.get(key) ?? { tuning: {}, control: {} };
        buckets.set(key, bk);
        for (const h of meta.horizons) {
          const b = (bk[period][h] ??= emptyBucket());
          b.days++;
          if (!isStart) continue;
          if (isPlan(key)) {
            const target = Number(key.split('@')[1]);
            const pr = analysis.plan ? planR(a.candles, i, analysis.plan.stop, target, 30, 2 * (COSTS.exchange.feePct + COSTS.exchange.spreadPct)) : null;
            if (pr != null) { b.planR.push(pr); b.ret.push(pr); }
            continue;
          }
          const x = r[h];
          if (!x) continue;
          b.ret.push(x.ret);
          b.worst.push(x.worst);
          if (Number.isFinite(dayMean[h])) b.excess.push(x.ret - dayMean[h]);
          if (x.forced) forced.set(key, (forced.get(key) ?? 0) + 1);
        }
      }
    }
  });

  const keys: KeyStats[] = [];
  for (const [key, bk] of buckets) {
    const meta = metas.get(key)!;
    const refKind: 'all' | 'btc' = key.startsWith('temp:') ? 'btc' : 'all';
    const byHorizon: Record<number, HorizonStats> = {};
    for (const h of meta.horizons) {
      const stat = (p: 'tuning' | 'control' | 'all'): PeriodStats => {
        const parts = p === 'all' ? [bk.tuning[h], bk.control[h]] : [bk[p][h]];
        const b = parts.reduce<Bucket>((acc, x) => (x ? { ret: [...acc.ret, ...x.ret], worst: [...acc.worst, ...x.worst], excess: [...acc.excess, ...x.excess], planR: [...acc.planR, ...x.planR], days: acc.days + x.days } : acc), emptyBucket());
        const ref = (kind: 'all' | 'btc' | 'plan', k: string) => (p === 'all' ? [...(base[kind][k]?.tuning ?? []), ...(base[kind][k]?.control ?? [])] : base[kind][k]?.[p] ?? []);
        const baseline = isPlan(key) ? ref('plan', key.split('@')[1]) : ref(refKind, String(h));
        const w = wilson(b.ret.filter((x) => x > 0).length, b.ret.length);
        const med = median(b.ret);
        const baseMed = median(baseline);
        return {
          days: b.days, episodes: b.ret.length,
          hitPct: pct(b.ret), hitLow: w.low * 100, hitHigh: w.high * 100,
          medianPct: med, meanPct: meanOf(b.ret),
          // Sans univers du jour suffisant (une seule crypto), l'excès est l'écart de médiane avec la référence.
          excessMedianPct: b.excess.length ? median(b.excess) : med - baseMed,
          worstMedianPct: median(b.worst),
          baselineHitPct: pct(baseline), baselineMedianPct: baseMed,
          ...(isPlan(key) ? { expectancyR: meanOf(b.planR) } : {}),
        };
      };
      byHorizon[h] = { all: stat('all'), tuning: stat('tuning'), control: stat('control') };
    }
    const denom = key.startsWith('temp:') ? btcObservations : observations;
    keys.push({ meta, byHorizon, verdict: verdictOf(byHorizon[meta.horizon] ?? byHorizon[meta.horizons[0]], meta), frequencyPct: denom ? ((freq.get(key) ?? 0) / denom) * 100 : 0, forcedExits: forced.get(key) ?? 0 });
  }
  keys.sort((a, b) => a.meta.key.localeCompare(b.meta.key));
  return { keys, observations, dataThrough };
}
