// « Swing 4H Actif (4×/jour) » : autopilote intraday/swing exécuté à 8 h, 12 h, 16 h et 20 h (heure de Paris)
// — uniquement à des heures humaines copiables. Analyse les bougies 4H closes (repli propre sur 1D au banc d'essai) :
// tendance alignée EMA21 > EMA55 + cassure 20 bougies avec volume ou pullback sur EMA21 avec rejet haussier.
// Gestion pro : TP1 50 % à 1,5 R + passage du stop à l'équilibre, puis trailing stop 2 × ATR sur les 50 % restants.

import { atr, ema, highest, last, volumeRatio } from '../../indicators';
import type { Intent, Strategy } from '../types';

export type Swing4hParams = {
  riskPct: number;
  maxPositions: number;
  maxPositionPct: number;
  maxHoldDays: number;
  cooldownDays: number;
  minVolumeUsd: number;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

export const swing4h: Strategy<Swing4hParams> = {
  id: 'swing-4h-multi',
  version: 1,
  label: 'Swing 4H Actif (4×/jour)',
  describe: 'Tourne 4 fois par jour à heures copiables (8 h, 12 h, 16 h, 20 h Paris) sur bougies 4H : cassures et pullbacks EMA21 en tendance haussière, TP1 50 % à 1,5 R + breakeven, trailing stop 2 × ATR, sortie max 10 j.',
  defaults: { riskPct: 0.75, maxPositions: 4, maxPositionPct: 22, maxHoldDays: 10, cooldownDays: 2, minVolumeUsd: 5_000_000 },
  uses: ['regime'],
  replayable: true,
  universeTop: 40,
  executionHours: [8, 12, 16, 20],
  riskOverlay: { maxHeatPct: 4.5, maxHighCorrPositions: 2, drawdownScaling: true },
  kind: 'trades',
  deposit: () => 0,
  decide: (ctx, p) => {
    const out: Intent[] = [];
    const pf = ctx.portfolio;

    // 1. Sortie temporelle sur positions ouvertes (stop, TP1 et trailing gérés sur bougies 1H par settleBar)
    for (const pos of pf.positions) {
      if (daysBetween(pos.openedOn, ctx.execDay) >= p.maxHoldDays) {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: 1, tag: 'time-exit', reason: `Swing 4H : durée maximale atteinte (${p.maxHoldDays} j)` });
      }
    }

    if (ctx.regime?.regime === 'BEAR_TREND' || ctx.regime?.regime === 'EXTREME_STRESS') return out;

    // Filtre de tendance court terme BTC (4H si disponible, sinon 1D)
    const btcBars = (ctx.candles4h?.('bitcoin')?.length ?? 0) >= 60 ? ctx.candles4h!('bitcoin') : ctx.candles('bitcoin');
    if (btcBars.length >= 60) {
      const btcCloses = btcBars.map((c) => c.close);
      const btcE55 = last(ema(btcCloses, 55)) ?? NaN;
      if (Number.isFinite(btcE55) && btcCloses[btcCloses.length - 1] < btcE55) return out;
    }

    const held = new Set(pf.positions.map((x) => x.coinId));
    let slots = p.maxPositions - pf.positions.length;
    let cash = pf.cashUsd;
    if (slots <= 0 || cash < 10) return out;

    type Cand = { u: typeof ctx.universe[number]; price: number; atr14: number; score: number; kind: string };
    const candidates: Cand[] = [];

    for (const u of ctx.universe.slice(0, 40)) {
      if (held.has(u.coinId)) continue;
      const lastStop = pf.lastFillOn('stop', u.coinId);
      if (lastStop != null && daysBetween(lastStop, ctx.execDay) < p.cooldownDays) continue;
      const m = ctx.metrics?.(u.coinId);
      if (m?.volumeUsd30dMed != null && m.volumeUsd30dMed < p.minVolumeUsd) continue;

      const bars4h = ctx.candles4h?.(u.coinId);
      const cs = bars4h && bars4h.length >= 60 ? bars4h : ctx.candles(u.coinId);
      if (cs.length < 60) continue;
      const closes = cs.map((c) => c.close);
      const c = cs[cs.length - 1];
      const e21 = last(ema(closes, 21)) ?? NaN;
      const e55 = last(ema(closes, 55)) ?? NaN;
      const a14 = last(atr(cs, 14)) ?? NaN;
      if (!Number.isFinite(e21) || !Number.isFinite(e55) || !Number.isFinite(a14) || a14 <= 0) continue;
      if (!(e21 > e55 && c.close > e21)) continue; // tendance 4H haussière alignée

      const prevHigh = highest(cs.map((k) => k.high), 20, cs.length - 2);
      const vr = volumeRatio(cs, 20, { closedOnly: true });
      const isBreakout = c.close > prevHigh && Number.isFinite(vr) && vr >= 1.4;
      const isPullback = c.low <= e21 * 1.006 && c.close > c.open && c.close > e21 && (c.close - c.low) > (c.high - c.close);
      if (!isBreakout && !isPullback) continue;

      candidates.push({
        u, price: c.close, atr14: a14,
        score: (isBreakout ? 2 : 1) + (Number.isFinite(vr) ? vr : 1),
        kind: isBreakout ? `Cassure 4H (vol ×${vr.toFixed(1).replace('.', ',')})` : 'Pullback rejet EMA21 4H',
      });
    }

    candidates.sort((a, b) => b.score - a.score);

    for (const x of candidates) {
      if (slots <= 0 || cash < 10) break;
      const stop = x.price - 1.8 * x.atr14;
      if (!(stop > 0) || stop >= x.price) continue;
      const riskUsd = pf.equityUsd * (p.riskPct / 100);
      const maxUsd = Math.min(pf.equityUsd * (p.maxPositionPct / 100), cash);
      out.push({
        coinId: x.u.coinId, symbol: x.u.symbol, name: x.u.name, side: 'buy',
        sizing: { riskUsd, maxUsd },
        stop,
        tpLegs: [{ rMultiple: 1.5, fraction: 0.5, moveStopToBe: true }],
        trailing: { mode: 'atr', value: 2, activateAfterR: 1.5, atr: x.atr14 },
        skipAbove: x.price * 1.025,
        skipBelow: stop,
        tag: 'swing4h-entry',
        reason: `${x.kind} · TP1 50 % à 1,5 R + breakeven, trailing 2× ATR`,
      });
      cash -= Math.min(maxUsd, (riskUsd / Math.max(x.price - stop, 1e-9)) * x.price);
      slots--;
    }

    return out;
  },
};
