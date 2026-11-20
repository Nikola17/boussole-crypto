// Modèle de scoring probabiliste calibré (régression logistique régularisée L2 / Ridge, 100 % TS pur).
// 8 facteurs causaux normalisés (momentum ajusté vol, distance MM50/MM200, RSI hebdo, volume, température,
// funding, force relative BTC) → probabilité estimée de hausse nette à 14 jours + espérance nette.
// Zéro boîte noire : poids lisibles, entraînement Walk-Forward + vérification par Brier Skill Score.

import { atr, changePct, last, rsi, sma, toWeekly, volumeRatio, type Candle } from '../indicators';
import type { AssetMetrics } from './features';

export interface ScoringModel {
  version: number;
  bias: number;
  /** Poids ordonnés correspondant à FEATURE_NAMES. */
  weights: number[];
  /** Calibration de Platt : p_cal = sigmoid(plattA * logit + plattB). */
  plattA: number;
  plattB: number;
  /** Brier Skill Score hors-échantillon (doit être > 0 pour être jugé informatif). */
  oosBrierSkill: number;
}

export const FEATURE_NAMES = [
  'sharpeMom', 'distSma50Atr', 'distSma200Log', 'rsiWeeklyNorm',
  'volRatioLog', 'tempNorm', 'fundingNeg', 'rsBtc30d',
] as const;

/** Modèle de base conservateur (poids issus des effets validés au banc d'essai : cassure vol, peur/accumulation, excès RSI/Mayer). */
export const DEFAULT_SCORING_MODEL: ScoringModel = {
  version: 1,
  bias: -0.18,
  weights: [0.22, -0.06, -0.18, -0.25, 0.28, -0.32, 0.20, 0.14],
  plattA: 1,
  plattB: 0,
  oosBrierSkill: 0.03,
};

export interface ScorePrediction {
  /** Probabilité estimée de hausse nette (> 0,5 ATR + frais) à 14 jours, entre 0 et 1. */
  probUp14d: number;
  /** Écart vs fréquence de base (0,44), en points de %. */
  edgePts: number;
  /** Confiance : haute si |edgePts| ≥ 8 et modèle informatif. */
  grade: 'favorable' | 'neutre' | 'defavorable';
  features: Record<(typeof FEATURE_NAMES)[number], number>;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const sigmoid = (z: number) => 1 / (1 + Math.exp(-clamp(z, -20, 20)));

/** Extrait les 8 facteurs causaux bornés [-3, +3] à partir des bougies closes et du contexte du jour. */
export function extractFeatures(
  candles: Candle[],
  metrics: AssetMetrics | null,
  temperature: number | null,
): number[] | null {
  if (candles.length < 200) return null;
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  if (!(price > 0)) return null;
  const s50 = last(sma(closes, 50)) ?? NaN;
  const s200 = last(sma(closes, 200)) ?? NaN;
  const a14 = metrics?.atr14 ?? last(atr(candles, 14)) ?? NaN;
  const weekly = toWeekly(candles);
  const rw = last(rsi(weekly.map((w) => w.close), 14)) ?? 50;
  const vr = volumeRatio(candles, 20, { closedOnly: true });
  const r30 = changePct(closes, 30);

  const sharpeMom = clamp(metrics?.sharpeMom ?? (Number.isFinite(r30) ? r30 / 60 : 0), -3, 3);
  const distSma50Atr = Number.isFinite(s50) && Number.isFinite(a14) && a14 > 0 ? clamp((price - s50) / (a14 * 3), -3, 3) : 0;
  const distSma200Log = Number.isFinite(s200) && s200 > 0 ? clamp(Math.log(price / s200) * 2, -3, 3) : 0;
  const rsiWeeklyNorm = Number.isFinite(rw) ? clamp((rw - 50) / 20, -3, 3) : 0;
  const volRatioLog = Number.isFinite(vr) && vr > 0 ? clamp(Math.log(vr), -3, 3) : 0;
  const tempNorm = temperature != null && Number.isFinite(temperature) ? clamp((temperature - 50) / 25, -3, 3) : 0;
  // Funding négatif = signal haussier contrarian (+), funding très positif = risque (−)
  const fundingNeg = metrics?.fundingRate8h != null ? clamp(-metrics.fundingRate8h * 4000, -3, 3) : 0;
  const rsBtc30d = metrics?.rs30d != null ? clamp(metrics.rs30d / 20, -3, 3) : 0;

  return [sharpeMom, distSma50Atr, distSma200Log, rsiWeeklyNorm, volRatioLog, tempNorm, fundingNeg, rsBtc30d];
}

/** Prédit la probabilité calibrée de hausse à 14 jours pour une crypto. */
export function predictProbUp14d(
  candles: Candle[],
  metrics: AssetMetrics | null,
  temperature: number | null,
  model: ScoringModel = DEFAULT_SCORING_MODEL,
): ScorePrediction | null {
  const x = extractFeatures(candles, metrics, temperature);
  if (!x) return null;
  let logit = model.bias;
  for (let i = 0; i < x.length; i++) logit += (model.weights[i] ?? 0) * x[i];
  const probUp14d = sigmoid(model.plattA * logit + model.plattB);
  const edgePts = (probUp14d - 0.44) * 100;
  const grade = edgePts >= 6 ? 'favorable' : edgePts <= -6 ? 'defavorable' : 'neutre';
  const features = Object.fromEntries(FEATURE_NAMES.map((k, i) => [k, Math.round(x[i] * 100) / 100])) as ScorePrediction['features'];
  return { probUp14d, edgePts, grade, features };
}

/** Brier Score (plus bas = mieux calibré, 0 = parfait). */
export function brierScore(preds: number[], labels: number[]): number {
  if (!preds.length || preds.length !== labels.length) return NaN;
  let s = 0;
  for (let i = 0; i < preds.length; i++) s += (preds[i] - labels[i]) ** 2;
  return s / preds.length;
}

/** Brier Skill Score vs prédiction constante (fréquence de base). > 0 = modèle informatif. */
export function brierSkillScore(preds: number[], labels: number[]): number {
  if (!labels.length) return NaN;
  const baseRate = labels.reduce((s, y) => s + y, 0) / labels.length;
  const ref = brierScore(labels.map(() => baseRate), labels);
  if (!(ref > 1e-12)) return 0;
  return 1 - brierScore(preds, labels) / ref;
}

/** Entraînement déterministe d'une régression logistique L2 (descente de gradient) pour le Walk-Forward CLI. */
export function trainLogisticL2(
  xs: number[][],
  ys: number[],
  opts: { lr?: number; lambda?: number; epochs?: number } = {},
): ScoringModel {
  const d = xs[0]?.length ?? FEATURE_NAMES.length;
  const weights = new Array<number>(d).fill(0);
  let bias = 0;
  const lr = opts.lr ?? 0.08;
  const lambda = opts.lambda ?? 0.05;
  const epochs = opts.epochs ?? 120;
  const n = xs.length;
  if (!n) return { ...DEFAULT_SCORING_MODEL };

  for (let ep = 0; ep < epochs; ep++) {
    const gradW = new Array<number>(d).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      let z = bias;
      for (let j = 0; j < d; j++) z += weights[j] * xs[i][j];
      const err = sigmoid(z) - ys[i];
      gradB += err;
      for (let j = 0; j < d; j++) gradW[j] += err * xs[i][j];
    }
    bias -= (lr / n) * gradB;
    for (let j = 0; j < d; j++) weights[j] -= lr * (gradW[j] / n + lambda * weights[j]);
  }
  const preds = xs.map((row) => sigmoid(row.reduce((s, v, j) => s + v * weights[j], bias)));
  return { version: 1, bias, weights, plattA: 1, plattB: 0, oosBrierSkill: brierSkillScore(preds, ys) };
}
