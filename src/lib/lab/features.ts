// Feature Store pur & causal pour les stratégies du Labo : force relative, momentum ajusté de la volatilité,
// volatilité annualisée, corrélation au Bitcoin, ADX, ATR et liquidité médiane 30 jours.

import { adx, atr, changePct, ewmaVolatility, last, rollingCorrelation, type Candle } from '../indicators';
import { median } from './stats';

export interface AssetMetrics {
  /** Force relative vs Bitcoin (rendement actif − rendement BTC, en points de %). */
  rs7d: number | null;
  rs30d: number | null;
  rs90d: number | null;
  /** Volatilité annualisée 30 j / EWMA (en %). */
  vol30dAnn: number | null;
  /** Momentum ajusté de la volatilité : (ret30d + ret90d) / vol30dAnn (facteur Sharpe Momentum). */
  sharpeMom: number | null;
  /** Corrélation de Pearson des rendements quotidiens 30 j avec Bitcoin [-1, 1]. */
  corrBtc30d: number | null;
  atr14: number | null;
  atrPct: number | null;
  adx14: number | null;
  fundingRate8h: number | null;
  volumeUsd30dMed: number | null;
}

const finiteOrNull = (v: number): number | null => (Number.isFinite(v) ? v : null);

/** Calcule les indicateurs quantitatifs d'un actif sur ses bougies closes jusqu'à la fin du tableau. */
export function computeAssetMetrics(
  candles: Candle[],
  btcCandles: Candle[],
  fundingRate8h: number | null = null,
): AssetMetrics | null {
  if (candles.length < 30) return null;
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  if (!(price > 0)) return null;
  const btcCloses = btcCandles.map((c) => c.close);

  const r7 = changePct(closes, 7);
  const r30 = changePct(closes, 30);
  const r90 = changePct(closes, 90);
  const b7 = changePct(btcCloses, 7);
  const b30 = changePct(btcCloses, 30);
  const b90 = changePct(btcCloses, 90);

  const rs7d = Number.isFinite(r7) && Number.isFinite(b7) ? r7 - b7 : null;
  const rs30d = Number.isFinite(r30) && Number.isFinite(b30) ? r30 - b30 : null;
  const rs90d = Number.isFinite(r90) && Number.isFinite(b90) ? r90 - b90 : null;

  const vol = ewmaVolatility(closes.slice(-90));
  const vol30dAnn = finiteOrNull(vol);
  const sharpeMom = Number.isFinite(r30) && Number.isFinite(vol) && vol > 1
    ? (r30 + (Number.isFinite(r90) ? r90 * 0.5 : 0)) / vol
    : null;

  const corrBtc30d = btcCloses.length >= 31 ? finiteOrNull(rollingCorrelation(closes, btcCloses, 30)) : null;
  const a14 = last(atr(candles, 14)) ?? NaN;
  const atr14 = finiteOrNull(a14);
  const atrPct = atr14 != null ? (atr14 / price) * 100 : null;
  const adx14 = finiteOrNull(last(adx(candles, 14)) ?? NaN);
  const volumeUsd30dMed = finiteOrNull(median(candles.slice(-30).map((c) => c.volume)));

  return {
    rs7d, rs30d, rs90d, vol30dAnn, sharpeMom, corrBtc30d, atr14, atrPct, adx14,
    fundingRate8h: fundingRate8h != null && Number.isFinite(fundingRate8h) ? fundingRate8h : null,
    volumeUsd30dMed,
  };
}
