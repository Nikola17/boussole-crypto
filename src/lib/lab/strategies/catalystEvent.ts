// « Catalyseur & Probabilités (Scoring Calibré) » : combine le modèle probabiliste calibré (scoring.ts)
// et l'accélération de force relative (RS 7j > +5 % vs BTC) pour capter les catalyseurs haussiers validés
// par le flux, avec gestion serrée (stop 1,5 × ATR, TP 2 R, sortie max 10 j).

import { atr, last } from '../../indicators';
import { predictProbUp14d } from '../scoring';
import type { Intent, Strategy } from '../types';

export type CatalystEventParams = {
  minProbUp: number;
  minRs7dPct: number;
  riskPct: number;
  maxPositions: number;
  maxPositionPct: number;
  maxHoldDays: number;
  cooldownDays: number;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

export const catalystEvent: Strategy<CatalystEventParams> = {
  id: 'catalyst-event',
  version: 1,
  label: 'Catalyseur & Scoring Probabiliste',
  describe: 'Entre lorsque le modèle probabiliste calibré dépasse 52 % de hausse à 14 j avec force relative 7 j > +5 % vs BTC ; stop 1,5 × ATR, TP1 50 % à 1,5 R + breakeven, objectif 2,5 R, durée max 10 j.',
  defaults: { minProbUp: 0.52, minRs7dPct: 5, riskPct: 0.75, maxPositions: 3, maxPositionPct: 18, maxHoldDays: 10, cooldownDays: 5 },
  uses: ['regime'],
  replayable: true,
  universeTop: 150,
  riskOverlay: { maxHeatPct: 4, maxHighCorrPositions: 2, drawdownScaling: true },
  kind: 'trades',
  deposit: () => 0,
  decide: (ctx, p) => {
    const out: Intent[] = [];
    const pf = ctx.portfolio;

    for (const pos of pf.positions) {
      if (daysBetween(pos.openedOn, ctx.execDay) >= p.maxHoldDays) {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: 1, tag: 'time-exit', reason: `Catalyseur : durée maximale atteinte (${p.maxHoldDays} j)` });
      }
    }

    if (ctx.regime?.regime === 'BEAR_TREND') return out;

    const held = new Set(pf.positions.map((x) => x.coinId));
    let slots = p.maxPositions - pf.positions.length;
    let cash = pf.cashUsd;
    if (slots <= 0 || cash < 10) return out;

    type Cand = { u: typeof ctx.universe[number]; price: number; atr14: number; prob: number; rs7d: number };
    const candidates: Cand[] = [];

    for (const u of ctx.universe) {
      if (held.has(u.coinId)) continue;
      const lastStop = pf.lastFillOn('stop', u.coinId);
      if (lastStop != null && daysBetween(lastStop, ctx.execDay) < p.cooldownDays) continue;
      const cs = ctx.candles(u.coinId);
      if (cs.length < 200) continue;
      const m = ctx.metrics?.(u.coinId) ?? null;
      if (!m || m.rs7d == null || m.rs7d < p.minRs7dPct) continue;
      const pred = predictProbUp14d(cs, m, ctx.temperature);
      if (!pred || pred.probUp14d < p.minProbUp) continue;
      const a14 = m.atr14 ?? last(atr(cs, 14)) ?? NaN;
      if (!Number.isFinite(a14) || a14 <= 0) continue;
      candidates.push({ u, price: cs[cs.length - 1].close, atr14: a14, prob: pred.probUp14d, rs7d: m.rs7d });
    }

    candidates.sort((a, b) => b.prob - a.prob || b.rs7d - a.rs7d);

    for (const c of candidates) {
      if (slots <= 0 || cash < 10) break;
      const stop = c.price - 1.5 * c.atr14;
      if (!(stop > 0)) continue;
      const riskUsd = pf.equityUsd * (p.riskPct / 100);
      const maxUsd = Math.min(pf.equityUsd * (p.maxPositionPct / 100), cash);
      out.push({
        coinId: c.u.coinId, symbol: c.u.symbol, name: c.u.name, side: 'buy',
        sizing: { riskUsd, maxUsd },
        stop,
        tpLegs: [
          { rMultiple: 1.5, fraction: 0.5, moveStopToBe: true },
          { rMultiple: 2.5, fraction: 0.5 },
        ],
        skipAbove: c.price * 1.03,
        skipBelow: stop,
        tag: 'catalyst',
        reason: `Prob. calibrée ${Math.round(c.prob * 100)} % (14 j) · RS 7 j +${c.rs7d.toFixed(1).replace('.', ',')} % vs BTC`,
      });
      cash -= Math.min(maxUsd, (riskUsd / Math.max(c.price - stop, 1e-9)) * c.price);
      slots--;
    }

    return out;
  },
};
