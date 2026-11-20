// Détecteur de régime de marché (4 états) avec hystérésis anti-whipsaw.
// Fonction pure et causale : n'utilise que les bougies BTC closes jusqu'au jour D et la température connue.

import { adx, ewmaVolatility, last, slopePct, sma, type Candle } from '../indicators';

/** Version du détecteur de régime (entre dans l'empreinte des stratégies qui en dépendent). */
export const REGIME_VERSION = 1;

export type MarketRegime = 'BULL_TREND' | 'BEAR_TREND' | 'RANGE_CHOP' | 'EXTREME_STRESS';

export interface RegimeSnapshot {
  day: string;
  regime: MarketRegime;
  /** Confiance 0..1 dans l'état détecté. */
  confidence: number;
  /** Score de tendance BTC (-100..+100). */
  btcTrendScore: number;
  adx14: number;
  volAnnualizedPct: number;
  temperature: number | null;
  daysInRegime: number;
  /** Candidat en attente de confirmation (hystérésis). */
  pendingRegime?: MarketRegime | null;
  pendingCount?: number;
}

export const REGIME_LABEL: Record<MarketRegime, string> = {
  BULL_TREND: 'Tendance haussière',
  BEAR_TREND: 'Tendance baissière',
  RANGE_CHOP: 'Marché en range',
  EXTREME_STRESS: 'Stress extrême',
};

const HYSTERESIS_DAYS = 3;

function rawRegime(
  price: number, s50: number, s200: number, slope200: number, adx14: number, volAnn: number, temperature: number | null,
): { regime: MarketRegime; confidence: number; btcTrendScore: number } {
  let trendScore = 0;
  if (Number.isFinite(s200) && s200 > 0) {
    trendScore += price > s200 ? 40 : -40;
    if (Number.isFinite(slope200)) trendScore += Math.max(-25, Math.min(25, slope200 * 5));
  }
  if (Number.isFinite(s50) && Number.isFinite(s200) && s200 > 0) {
    trendScore += s50 > s200 ? 25 : -25;
  }
  if (Number.isFinite(s50) && s50 > 0) {
    trendScore += price > s50 ? 10 : -10;
  }
  trendScore = Math.max(-100, Math.min(100, Math.round(trendScore)));

  // Choc extrême (bulle, capitulation ou explosion de volatilité) : prioritaire sans délai.
  if ((temperature != null && (temperature >= 85 || temperature <= 15)) || (Number.isFinite(volAnn) && volAnn >= 95)) {
    return { regime: 'EXTREME_STRESS', confidence: 0.9, btcTrendScore: trendScore };
  }
  const hasTrend = Number.isFinite(adx14) ? adx14 >= 20 : true;
  if (Number.isFinite(s200) && Number.isFinite(s50) && price > s200 && s50 > s200 && hasTrend) {
    const conf = Math.min(1, 0.55 + (Number.isFinite(adx14) ? Math.max(0, adx14 - 20) / 40 : 0.2));
    return { regime: 'BULL_TREND', confidence: Math.round(conf * 100) / 100, btcTrendScore: trendScore };
  }
  if (Number.isFinite(s200) && price < s200 && (!Number.isFinite(slope200) || slope200 <= 0.5) && (!Number.isFinite(adx14) || adx14 >= 18)) {
    const conf = Math.min(1, 0.55 + (Number.isFinite(adx14) ? Math.max(0, adx14 - 18) / 40 : 0.2));
    return { regime: 'BEAR_TREND', confidence: Math.round(conf * 100) / 100, btcTrendScore: trendScore };
  }
  const rangeConf = Number.isFinite(adx14) ? Math.min(1, Math.max(0.4, (28 - adx14) / 20)) : 0.5;
  return { regime: 'RANGE_CHOP', confidence: Math.round(rangeConf * 100) / 100, btcTrendScore: trendScore };
}

/** Détecte le régime au dernier jour de `btcCandles` (nécessite au moins 60 bougies, idéalement 200+). */
export function detectRegime(btcCandles: Candle[], temperature: number | null, prev?: RegimeSnapshot | null): RegimeSnapshot | null {
  if (btcCandles.length < 60) return null;
  const closes = btcCandles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const day = new Date(btcCandles[btcCandles.length - 1].time * 1000).toISOString().slice(0, 10);
  const s50 = last(sma(closes, 50)) ?? NaN;
  const s200Arr = sma(closes, 200);
  const s200 = last(s200Arr) ?? NaN;
  const slope200 = slopePct(s200Arr, 20);
  const adx14 = last(adx(btcCandles, 14)) ?? NaN;
  const volAnnualizedPct = ewmaVolatility(closes.slice(-120));
  const raw = rawRegime(price, s50, s200, slope200, adx14, volAnnualizedPct, temperature);

  let regime = raw.regime;
  let daysInRegime = 1;
  let pendingRegime: MarketRegime | null = null;
  let pendingCount = 0;

  if (prev) {
    if (raw.regime === prev.regime) {
      regime = prev.regime;
      daysInRegime = prev.daysInRegime + 1;
    } else if (raw.regime === 'EXTREME_STRESS') {
      // Le stress extrême s'active immédiatement (sécurité prioritaire).
      regime = 'EXTREME_STRESS';
      daysInRegime = 1;
    } else {
      const count = prev.pendingRegime === raw.regime ? (prev.pendingCount ?? 0) + 1 : 1;
      if (count >= HYSTERESIS_DAYS) {
        regime = raw.regime;
        daysInRegime = count;
      } else {
        regime = prev.regime;
        daysInRegime = prev.daysInRegime + 1;
        pendingRegime = raw.regime;
        pendingCount = count;
      }
    }
  }

  return {
    day,
    regime,
    confidence: raw.confidence,
    btcTrendScore: raw.btcTrendScore,
    adx14: Number.isFinite(adx14) ? Math.round(adx14 * 10) / 10 : 0,
    volAnnualizedPct: Number.isFinite(volAnnualizedPct) ? Math.round(volAnnualizedPct * 10) / 10 : 0,
    temperature,
    daysInRegime,
    pendingRegime,
    pendingCount,
  };
}

/** Série causale des régimes jour par jour sur tout l'historique BTC (O(N), utilisée au banc d'essai et en autopilote). */
export function buildRegimeSeries(btcCandles: Candle[], temperatureByDay: (day: string) => number | null): Map<string, RegimeSnapshot> {
  const out = new Map<string, RegimeSnapshot>();
  if (btcCandles.length < 60) return out;
  const closes = btcCandles.map((c) => c.close);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const adxArr = adx(btcCandles, 14);
  // Volatilité EWMA incrémentale O(N)
  const lambda = 0.94;
  let ewmaVar = 0;
  let prev: RegimeSnapshot | null = null;
  for (let i = 1; i < btcCandles.length; i++) {
    const r = closes[i - 1] > 0 && closes[i] > 0 ? Math.log(closes[i] / closes[i - 1]) : 0;
    ewmaVar = i === 1 ? r * r : lambda * ewmaVar + (1 - lambda) * r * r;
    if (i < 59) continue;
    const day = new Date(btcCandles[i].time * 1000).toISOString().slice(0, 10);
    const slope200 = i >= 20 && Number.isFinite(s200[i]) && Number.isFinite(s200[i - 20]) && s200[i - 20] !== 0
      ? ((s200[i] - s200[i - 20]) / s200[i - 20]) * 100 : NaN;
    const volAnn = Math.sqrt(ewmaVar * 365) * 100;
    const temp = temperatureByDay(day);
    const raw = rawRegime(closes[i], s50[i], s200[i], slope200, adxArr[i], volAnn, temp);

    let regime = raw.regime;
    let daysInRegime = 1;
    let pendingRegime: MarketRegime | null = null;
    let pendingCount = 0;
    if (prev) {
      if (raw.regime === prev.regime) {
        regime = prev.regime;
        daysInRegime = prev.daysInRegime + 1;
      } else if (raw.regime === 'EXTREME_STRESS') {
        regime = 'EXTREME_STRESS';
        daysInRegime = 1;
      } else {
        const count = prev.pendingRegime === raw.regime ? (prev.pendingCount ?? 0) + 1 : 1;
        if (count >= HYSTERESIS_DAYS) {
          regime = raw.regime;
          daysInRegime = count;
        } else {
          regime = prev.regime;
          daysInRegime = prev.daysInRegime + 1;
          pendingRegime = raw.regime;
          pendingCount = count;
        }
      }
    }
    const snap: RegimeSnapshot = {
      day, regime, confidence: raw.confidence, btcTrendScore: raw.btcTrendScore,
      adx14: Number.isFinite(adxArr[i]) ? Math.round(adxArr[i] * 10) / 10 : 0,
      volAnnualizedPct: Number.isFinite(volAnn) ? Math.round(volAnn * 10) / 10 : 0,
      temperature: temp, daysInRegime, pendingRegime, pendingCount,
    };
    out.set(day, snap);
    prev = snap;
  }
  return out;
}
