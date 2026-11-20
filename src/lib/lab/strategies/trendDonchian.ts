// « Trend Donchian + Trailing » : suivi de tendance pur sur cassure des plus hauts 20 jours (avec ADX ≥ 20),
// dimensionné par volatilité cible (Volatility Targeting), prise de profit partielle TP1 (30 % à 2 R + stop à l'équilibre)
// et Trailing Stop dynamique à 2,5 × ATR sur le reste — sans plafond fixe pour laisser courir les grands cycles.

import { adx, atr, highest, last, lowest, volumeRatio } from '../../indicators';
import type { Intent, Strategy } from '../types';

export type TrendDonchianParams = {
  entryPeriod: number;
  exitPeriod: number;
  adxMin: number;
  volTargetPct: number;
  maxPositions: number;
  maxPositionPct: number;
  trailAtrMult: number;
  cooldownDays: number;
  minVolumeUsd: number;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

export const trendDonchian: Strategy<TrendDonchianParams> = {
  id: 'trend-donchian-vol',
  version: 1,
  label: 'Trend Donchian + Trailing',
  describe: 'Suivi de tendance sur cassure des plus hauts 20 j (ADX ≥ 20) sur le top 500 ; taille adaptée à la volatilité, TP1 partiel (30 % à 2 R + breakeven) et stop suiveur 2,5 × ATR pour laisser courir les gros mouvements.',
  defaults: {
    entryPeriod: 20, exitPeriod: 10, adxMin: 20, volTargetPct: 18,
    maxPositions: 5, maxPositionPct: 22, trailAtrMult: 2.5, cooldownDays: 5, minVolumeUsd: 2_000_000,
  },
  uses: ['regime'],
  replayable: true,
  riskOverlay: { maxHeatPct: 6, maxHighCorrPositions: 3, drawdownScaling: true },
  kind: 'trades',
  deposit: () => 0,
  decide: (ctx, p) => {
    const out: Intent[] = [];
    const pf = ctx.portfolio;

    // 1. Sortie de tendance si cassure du plus bas Donchian 10 jours à la clôture
    for (const pos of pf.positions) {
      const cs = ctx.candles(pos.coinId);
      if (cs.length <= p.exitPeriod + 2) continue;
      const price = cs[cs.length - 1].close;
      const exitLow = lowest(cs.map((c) => c.low), p.exitPeriod, cs.length - 2);
      if (price < exitLow) {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: 1, tag: 'donchian-exit', reason: `Cassure du plus bas ${p.exitPeriod} j : fin de tendance` });
      }
    }

    // Pas de nouvelles cassures en bear market
    if (ctx.regime?.regime === 'BEAR_TREND') return out;

    const held = new Set(pf.positions.map((x) => x.coinId));
    let slots = p.maxPositions - pf.positions.length;
    let cash = pf.cashUsd;
    if (slots <= 0 || cash < 10) return out;

    type Cand = { u: typeof ctx.universe[number]; price: number; atr14: number; adx14: number; vr: number; volAnn: number };
    const candidates: Cand[] = [];

    for (const u of ctx.universe) {
      if (held.has(u.coinId)) continue;
      const lastStop = pf.lastFillOn('stop', u.coinId) ?? pf.lastFillOn('trailing-stop', u.coinId);
      if (lastStop != null && daysBetween(lastStop, ctx.execDay) < p.cooldownDays) continue;
      const cs = ctx.candles(u.coinId);
      if (cs.length < 60) continue;
      const m = ctx.metrics?.(u.coinId);
      if (m?.volumeUsd30dMed != null && m.volumeUsd30dMed < p.minVolumeUsd) continue;
      const price = cs[cs.length - 1].close;
      const prevHigh = highest(cs.map((c) => c.high), p.entryPeriod, cs.length - 2);
      if (!(price > prevHigh)) continue;
      const adx14 = m?.adx14 ?? last(adx(cs, 14)) ?? NaN;
      const atr14 = m?.atr14 ?? last(atr(cs, 14)) ?? NaN;
      const vr = volumeRatio(cs, 20, { closedOnly: true });
      if (!Number.isFinite(adx14) || adx14 < p.adxMin || !Number.isFinite(atr14) || atr14 <= 0) continue;
      if (Number.isFinite(vr) && vr < 1.2) continue;
      candidates.push({ u, price, atr14, adx14, vr: Number.isFinite(vr) ? vr : 1.2, volAnn: Math.max(25, m?.vol30dAnn ?? 60) });
    }

    candidates.sort((a, b) => b.vr - a.vr || b.adx14 - a.adx14);

    for (const c of candidates) {
      if (slots <= 0 || cash < 10) break;
      const stop = c.price - 2 * c.atr14;
      if (!(stop > 0)) continue;
      const maxUsd = Math.min(pf.equityUsd * (p.maxPositionPct / 100), cash);
      out.push({
        coinId: c.u.coinId, symbol: c.u.symbol, name: c.u.name, side: 'buy',
        sizing: { targetVolPct: p.volTargetPct / p.maxPositions, assetVolAnnPct: c.volAnn, equityUsd: pf.equityUsd, maxUsd },
        stop,
        tpLegs: [{ rMultiple: 2, fraction: 0.3, moveStopToBe: true }],
        trailing: { mode: 'atr', value: p.trailAtrMult, activateAfterR: 1, atr: c.atr14 },
        skipAbove: c.price * 1.035,
        skipBelow: stop,
        tag: 'donchian-breakout',
        reason: `Cassure Donchian ${p.entryPeriod} j · ADX ${Math.round(c.adx14)} · vol ×${c.vr.toFixed(1).replace('.', ',')} (TP1 2R + trailing ${p.trailAtrMult}× ATR)`,
      });
      cash -= Math.min(maxUsd, pf.equityUsd * ((p.volTargetPct / p.maxPositions) / c.volAnn));
      slots--;
    }

    return out;
  },
};
