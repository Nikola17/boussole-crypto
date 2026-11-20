// « Smart Money Shadow (On-Chain) » : réplique en papier les achats convergents des actifs liquides en traction
// (et des mouvements Smart Money suivis), avec plafond strict 5 % par ligne, retrait de la mise à ×1,8 et trailing 20 %.
// En direct, combine momentum volume + filtre anti-FOMO (+50 %/7 j bloqué) et coupe-circuit bear market.

import { atr, changePct, last, volumeRatio } from '../../indicators';
import type { Intent, Strategy } from '../types';

export type SmartShadowParams = {
  maxLinePct: number;
  maxPositions: number;
  takeInitialMultiple: number;
  trailingPct: number;
  maxHoldDays: number;
  minVolumeUsd: number;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

export const smartShadow: Strategy<SmartShadowParams> = {
  id: 'smart-money-shadow',
  version: 1,
  label: 'Smart Money Shadow (Traction)',
  describe: 'Repère les accélérations de flux acheteurs (pression acheteuse > 58 %, volume ×2, hors FOMO +50 %/7 j) dans le top 500 ; plafond strict 5 % par ligne, retrait de mise à ×1,8 et stop suiveur 20 %.',
  defaults: { maxLinePct: 5, maxPositions: 4, takeInitialMultiple: 1.8, trailingPct: 20, maxHoldDays: 21, minVolumeUsd: 3_000_000 },
  uses: ['regime'],
  replayable: true,
  universeTop: 500,
  riskOverlay: { maxHeatPct: 4, maxHighCorrPositions: 2, drawdownScaling: true },
  kind: 'trades',
  deposit: () => 0,
  decide: (ctx, p) => {
    const out: Intent[] = [];
    const pf = ctx.portfolio;

    for (const pos of pf.positions) {
      if (daysBetween(pos.openedOn, ctx.execDay) >= p.maxHoldDays) {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: 1, tag: 'time-exit', reason: `Smart Shadow : durée max atteinte (${p.maxHoldDays} j)` });
      }
    }

    if (ctx.regime?.regime === 'BEAR_TREND' || ctx.regime?.regime === 'EXTREME_STRESS') return out;

    const held = new Set(pf.positions.map((x) => x.coinId));
    let slots = p.maxPositions - pf.positions.length;
    let cash = pf.cashUsd;
    if (slots <= 0 || cash < 10) return out;

    type Cand = { u: typeof ctx.universe[number]; price: number; atr14: number; score: number; vr: number; buyRatio: number };
    const candidates: Cand[] = [];

    for (const u of ctx.universe) {
      if (held.has(u.coinId) || u.coinId === 'bitcoin' || u.coinId === 'ethereum') continue;
      const cs = ctx.candles(u.coinId);
      if (cs.length < 40) continue;
      const m = ctx.metrics?.(u.coinId);
      if (m?.volumeUsd30dMed != null && m.volumeUsd30dMed < p.minVolumeUsd) continue;
      const closes = cs.map((c) => c.close);
      const ch7 = changePct(closes, 7);
      if (Number.isFinite(ch7) && ch7 > 50) continue; // anti-FOMO strict
      const vr = volumeRatio(cs, 20, { closedOnly: true });
      if (!Number.isFinite(vr) || vr < 2.0) continue;
      const lastBar = cs[cs.length - 1];
      if (lastBar.close <= lastBar.open) continue;
      // Pression acheteuse réelle (takerBuyQuote / volume Binance) si disponible, sinon corps haussier fort
      const buyRatio = lastBar.takerBuyQuote != null && lastBar.volume > 0
        ? lastBar.takerBuyQuote / lastBar.volume
        : (lastBar.close - lastBar.low) / Math.max(lastBar.high - lastBar.low, 1e-9);
      if (buyRatio < 0.58) continue;
      const a14 = m?.atr14 ?? last(atr(cs, 14)) ?? NaN;
      if (!Number.isFinite(a14) || a14 <= 0) continue;
      candidates.push({ u, price: lastBar.close, atr14: a14, score: vr * buyRatio, vr, buyRatio });
    }

    candidates.sort((a, b) => b.score - a.score);

    for (const c of candidates) {
      if (slots <= 0 || cash < 10) break;
      const stop = c.price * 0.85; // stop dur −15 % sur mid/small cap
      const usd = Math.min((pf.equityUsd * p.maxLinePct) / 100, cash);
      if (usd < 10) break;
      out.push({
        coinId: c.u.coinId, symbol: c.u.symbol, name: c.u.name, side: 'buy',
        sizing: { usd },
        stop,
        tpLegs: [{ rMultiple: (p.takeInitialMultiple - 1) / 0.15, fraction: 0.5, moveStopToBe: true }],
        trailing: { mode: 'pct', value: p.trailingPct, activateAfterR: 1 },
        skipAbove: c.price * 1.04,
        tag: 'smart-shadow',
        reason: `Afflux acheteur détecté (vol ×${c.vr.toFixed(1).replace('.', ',')}, achats ${Math.round(c.buyRatio * 100)} %) · plafond ${p.maxLinePct} %`,
      });
      cash -= usd;
      slots--;
    }

    return out;
  },
};
