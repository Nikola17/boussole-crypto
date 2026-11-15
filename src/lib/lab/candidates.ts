// Candidats du lot 3 (fiche, 10.3) : des critères mesurés sur l'historique avant d'entrer dans les signaux.
// Chaque candidat déclare son intention et ses horizons AVANT la mesure ; les paramètres sont des valeurs rondes.
// F11 (taux de financement) n'est pas mesuré dans cette version : pas d'historique chargé par le banc d'essai.

import { bollinger, highest, lowest, rsi, sma, toWeekly, volumeRatio, type Candle } from '../indicators';
import { zoneFor } from '../cycle';
import type { Bias, Extractor, KeyMeta } from './events';

const meta = (key: string, label: string, bias: Bias, horizons: number[], plan?: KeyMeta['plan']): KeyMeta => ({ key, label, bias, horizon: horizons[0], horizons, ...(plan ? { plan } : {}) });
const ZONES: [string, string, Bias][] = [['capitulation', 'Peur extrême', 'bull'], ['accumulation', 'Accumulation', 'bull'], ['neutre', 'Neutre', 'neutral'], ['chaleur', 'Marché chaud', 'bear'], ['euphorie', 'Euphorie', 'bear']];

export const CANDIDATES: KeyMeta[] = [
  meta('cand:F1:btc200', 'F1 · Bitcoin au-dessus de sa moyenne 200 jours', 'bull', [14, 30]),
  meta('cand:F1:btc200up', 'F1 · Bitcoin au-dessus d’une moyenne 200 jours en hausse', 'bull', [14, 30]),
  meta('cand:F2:trend200', 'F2 · Prix au-dessus d’une moyenne 200 jours en hausse', 'bull', [90, 30]),
  ...[20, 55].flatMap((n) => [1.5, 2].map((v) => meta(`cand:F3:h${n}v${v * 10}`, `F3 · Cassure des plus hauts ${n} j, volume ×${String(v).replace('.', ',')}`, 'bull', [30, 14]))),
  meta('cand:F4:p52', 'F4 · Pression acheteuse > 52 % sur 7 jours', 'bull', [14, 7]),
  meta('cand:F4:p55', 'F4 · Pression acheteuse > 55 % sur 7 jours', 'bull', [14, 7]),
  meta('cand:F5:rs30_90', 'F5 · Plus forte que Bitcoin sur 30 et 90 jours', 'bull', [30, 90]),
  meta('cand:F6:base', 'F6 · Survente (RSI < 30) et clôture en hausse', 'bull', [14, 7]),
  meta('cand:F6:trend', 'F6 · Survente avec rebond, en tendance haussière', 'bull', [14, 7]),
  meta('cand:F7:mayer08', 'F7 · Multiple de Mayer sous 0,8', 'bull', [90, 180]),
  meta('cand:F7:dd60up', 'F7 · −60 % sous le plus haut d’un an, 30 jours positifs', 'bull', [90, 180]),
  ...ZONES.map(([k, l, b]) => meta(`cand:F8:alt:${k}`, `F8 · Altcoins quand la température est « ${l} »`, b, [90, 180])),
  meta('cand:F9:up', 'F9 · Compression de volatilité puis cassure haussière', 'bull', [14, 30]),
  meta('cand:F9:down', 'F9 · Compression de volatilité puis cassure baissière', 'bear', [14, 30]),
  meta('cand:F10:excess', 'F10 · Excès : RSI hebdomadaire > 80 ou Mayer > 2', 'bear', [90, 30]),
  meta('cand:F12:w30', 'F12 · Tendance hebdomadaire haussière et signal trader haussier', 'bull', [30, 14]),
  ...[2, 3].map((r) => meta(`plan:F13:close@${r}`, `F13 · Plan, stop jugé à la clôture, objectif ${r} R`, 'bull', [30], { targetR: r, stop: 'plan', exitOnClose: true })),
  ...[1.5, 2, 3].flatMap((m) => [1.5, 2, 3].map((r) => meta(`plan:F14:atr${m * 10}@${r}`, `F14 · Plan, stop à ${String(m).replace('.', ',')} × la volatilité, objectif ${String(r).replace('.', ',')} R`, 'bull', [30], { targetR: r, stop: { atr: m } }))),
];

const lastOf = (xs: number[]) => xs[xs.length - 1];
const ret = (cs: Candle[], n: number) => (cs.length > n ? cs[cs.length - 1].close / cs[cs.length - 1 - n].close - 1 : NaN);

/** Les clés de candidats actives ce jour-là. */
export const candidateExtractor: Extractor = (o) => {
  const w = o.window;
  const n = w.length;
  if (n < 30) return [];
  const out: string[] = [];
  const closes = w.map((c) => c.close);
  const highs = w.map((c) => c.high);
  const lows = w.map((c) => c.low);
  const price = closes[n - 1];
  const s200 = sma(closes, 200);
  const m200 = lastOf(s200);
  // F1 — régime
  if (o.btcAboveSma200) {
    out.push('cand:F1:btc200');
    const bs = sma(o.btc.map((c) => c.close), 200);
    if (bs.length > 21 && lastOf(bs) > bs[bs.length - 21]) out.push('cand:F1:btc200up');
  }
  // F2 — tendance propre
  if (Number.isFinite(m200) && price > m200 && m200 > s200[n - 21]) out.push('cand:F2:trend200');
  // F3 — cassure avec volume
  const vr = volumeRatio(w, 20, { closedOnly: true });
  for (const h of [20, 55]) if (n > h + 1 && price > highest(highs, h, n - 2)) for (const v of [1.5, 2]) if (vr >= v) out.push(`cand:F3:h${h}v${v * 10}`);
  // F4 — pression acheteuse (part des achats au marché dans le volume, sur 7 jours)
  const last7 = w.slice(-7);
  if (last7.length === 7 && last7.every((c) => c.takerBuyQuote != null && c.volume > 0)) {
    const share = last7.reduce((s, c) => s + (c.takerBuyQuote as number) / c.volume, 0) / 7;
    if (share > 0.52) out.push('cand:F4:p52');
    if (share > 0.55) out.push('cand:F4:p55');
  }
  // F5 — force relative face à Bitcoin
  if (o.asset.id !== 'BTC' && o.btc.length > 91 && ret(w, 30) > ret(o.btc, 30) && ret(w, 90) > ret(o.btc, 90)) out.push('cand:F5:rs30_90');
  // F6 — survente avec rebond
  const r14 = lastOf(rsi(closes, 14));
  if (r14 < 30 && price > closes[n - 2]) {
    out.push('cand:F6:base');
    if (Number.isFinite(m200) && price > m200) out.push('cand:F6:trend');
  }
  // F7 — valorisation profonde
  if (Number.isFinite(m200) && price / m200 < 0.8) out.push('cand:F7:mayer08');
  if (n > 31 && price <= 0.4 * highest(highs, 365, n - 1) && price > closes[n - 31]) out.push('cand:F7:dd60up');
  // F8 — zone de température, appliquée aux altcoins
  if (o.asset.id !== 'BTC' && o.temperature != null) out.push(`cand:F8:alt:${zoneFor(o.temperature).key}`);
  // F9 — compression puis cassure dans les 5 jours
  const width = bollinger(closes, 20, 2).width;
  const recent = width.slice(-120).filter(Number.isFinite);
  if (recent.length > 60) {
    const min = Math.min(...recent);
    if (width.slice(-6, -1).some((x) => x <= min * 1.08)) {
      if (price > highest(highs, 20, n - 2)) out.push('cand:F9:up');
      else if (price < lowest(lows, 20, n - 2)) out.push('cand:F9:down');
    }
  }
  // F10 — excès
  const weekly = toWeekly(w).map((c) => c.close);
  const rw = lastOf(rsi(weekly, 14));
  if (rw > 80 || (Number.isFinite(m200) && price / m200 > 2)) out.push('cand:F10:excess');
  // F12 — deux horizons
  const w30 = lastOf(sma(weekly, 30));
  if (o.analysis.trader.tone === 'up' && Number.isFinite(w30) && lastOf(weekly) > w30) out.push('cand:F12:w30');
  // F13 et F14 — variantes du plan de trade, sur signal trader haussier
  if (o.analysis.trader.tone === 'up' && o.analysis.plan) {
    out.push('plan:F13:close@2', 'plan:F13:close@3');
    for (const m of [1.5, 2, 3]) for (const r of [1.5, 2, 3]) out.push(`plan:F14:atr${m * 10}@${r}`);
  }
  return out;
};
