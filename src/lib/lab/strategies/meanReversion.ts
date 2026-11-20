// « Retour à la moyenne (Quotidien) » : stratégie active quasi-quotidienne qui achète les replis violents
// court-terme (RSI(2) < 15 ou prix sous EMA20 − 1,6 × ATR) sur des actifs liquides en tendance de fond haussière
// (prix > MM200), hors tendance baissière BTC. Entrée par ordre limite maker (−0,5 %) pour minimiser les frais,
// sortie rapide au retour sur EMA10 ou RSI(2) > 70, stop 2,2 × ATR, durée maximale 7 jours.

import { atr, ema, last, rsi, sma } from '../../indicators';
import type { Intent, Strategy } from '../types';

export type MeanReversionParams = {
  rsi2Max: number;
  atrPullback: number;
  limitDiscountPct: number;
  riskPct: number;
  maxPositions: number;
  maxPositionPct: number;
  maxHoldDays: number;
  cooldownDays: number;
  minVolumeUsd: number;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

export const meanReversion: Strategy<MeanReversionParams> = {
  id: 'mean-reversion-daily',
  version: 1,
  label: 'Retour à la moyenne (Quotidien)',
  describe: 'Achète les replis violents court terme (RSI 2 j < 15 ou −1,6 ATR) sur des actifs en tendance haussière (au-dessus de MM200) via ordre limite maker ; sortie rapide dès le rebond (EMA10 / RSI 2 j > 70) ou à 7 jours.',
  defaults: {
    rsi2Max: 15, atrPullback: 1.6, limitDiscountPct: 0.5, riskPct: 1,
    maxPositions: 5, maxPositionPct: 20, maxHoldDays: 7, cooldownDays: 3, minVolumeUsd: 2_000_000,
  },
  uses: ['regime'],
  replayable: true,
  universeTop: 150,
  riskOverlay: { maxHeatPct: 5, maxHighCorrPositions: 3, drawdownScaling: true },
  kind: 'trades',
  deposit: () => 0,
  decide: (ctx, p) => {
    const out: Intent[] = [];
    const pf = ctx.portfolio;

    // 1. Sorties rapides sur les positions ouvertes (retour sur EMA10, surachat court terme, stop clôture ou durée max)
    for (const pos of pf.positions) {
      const cs = ctx.candles(pos.coinId);
      if (cs.length < 25) continue;
      const closes = cs.map((c) => c.close);
      const price = closes[closes.length - 1];
      const e10 = last(ema(closes, 10)) ?? NaN;
      const r2 = last(rsi(closes, 2)) ?? NaN;
      if (pos.stopOnClose && pos.stop != null && price <= pos.stop) {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: 1, tag: 'stop', reason: 'Clôture sous le stop : sortie retour à la moyenne' });
        continue;
      }
      if ((Number.isFinite(e10) && price >= e10) || (Number.isFinite(r2) && r2 >= 70)) {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: 1, tag: 'mr-exit', reason: `Rebond capté (RSI2 ${Number.isFinite(r2) ? Math.round(r2) : '—'} / retour EMA10)` });
        continue;
      }
      if (daysBetween(pos.openedOn, ctx.execDay) >= p.maxHoldDays) {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: 1, tag: 'time-exit', reason: `Durée maximale atteinte (${p.maxHoldDays} jours)` });
      }
    }

    // 2. Pas de nouveaux achats en bear market confirmé ou stress extrême
    if (ctx.regime?.regime === 'BEAR_TREND' || ctx.regime?.regime === 'EXTREME_STRESS') return out;

    const held = new Set(pf.positions.map((x) => x.coinId));
    let slots = p.maxPositions - pf.positions.length;
    let cash = pf.cashUsd;
    if (slots <= 0 || cash < 10) return out;

    type Cand = { u: typeof ctx.universe[number]; price: number; atr14: number; r2: number; zDrop: number };
    const candidates: Cand[] = [];

    for (const u of ctx.universe) {
      if (held.has(u.coinId)) continue;
      const lastStop = pf.lastFillOn('stop', u.coinId);
      if (lastStop != null && daysBetween(lastStop, ctx.execDay) < p.cooldownDays) continue;
      const cs = ctx.candles(u.coinId);
      if (cs.length < 205) continue;
      const m = ctx.metrics?.(u.coinId);
      if (m?.volumeUsd30dMed != null && m.volumeUsd30dMed < p.minVolumeUsd) continue;
      const closes = cs.map((c) => c.close);
      const price = closes[closes.length - 1];
      const s200 = last(sma(closes, 200)) ?? NaN;
      const e20 = last(ema(closes, 20)) ?? NaN;
      const r2 = last(rsi(closes, 2)) ?? NaN;
      const a14 = last(atr(cs, 14)) ?? NaN;
      if (!Number.isFinite(s200) || !Number.isFinite(e20) || !Number.isFinite(r2) || !Number.isFinite(a14) || a14 <= 0) continue;
      if (price <= s200) continue; // uniquement en tendance de fond haussière
      const zDrop = (e20 - price) / a14;
      if (r2 <= p.rsi2Max || zDrop >= p.atrPullback) {
        candidates.push({ u, price, atr14: a14, r2, zDrop });
      }
    }

    // Les excès les plus marqués d'abord (RSI 2 j le plus bas)
    candidates.sort((a, b) => a.r2 - b.r2 || b.zDrop - a.zDrop || (a.u.rank ?? Infinity) - (b.u.rank ?? Infinity));

    for (const c of candidates) {
      if (slots <= 0 || cash < 10) break;
      const limitPrice = c.price * (1 - p.limitDiscountPct / 100);
      const stop = limitPrice - 2.2 * c.atr14;
      if (!(stop > 0) || stop >= limitPrice) continue;
      const riskUsd = pf.equityUsd * (p.riskPct / 100);
      const maxUsd = Math.min(pf.equityUsd * (p.maxPositionPct / 100), cash);
      out.push({
        coinId: c.u.coinId, symbol: c.u.symbol, name: c.u.name, side: 'buy',
        orderType: 'limit', limitPrice, expiresAfterHours: 24,
        sizing: { riskUsd, maxUsd }, stop, stopOnClose: true,
        tpLegs: [{ rMultiple: 1.5, fraction: 0.5, moveStopToBe: true }],
        tag: 'mr-entry',
        reason: `Repli court terme en tendance haussière (RSI2 ${Math.round(c.r2)}, −${c.zDrop.toFixed(1).replace('.', ',')} ATR) · ordre limite maker`,
      });
      cash -= Math.min(maxUsd, (riskUsd / Math.max(limitPrice - stop, 1e-9)) * limitPrice);
      slots--;
    }
    return out;
  },
};
