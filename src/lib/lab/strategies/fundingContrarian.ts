// « Funding Contrarian (Dérivés) » : exploite les capitulations de levier sur les contrats perpétuels.
// En direct (App & VPS), détecte les taux de funding perpétuels très négatifs (≤ −0,012 % / 8 h) associés à une
// stabilisation haussière (bougie verte / RSI < 42). Au banc d'essai sans historique funding, utilise le proxy
// capitulation technique (RSI 14 < 28 + volume ×1,5 + clôture verte). TP1 50 % à 2 R + breakeven, sortie sur
// surchauffe funding (≥ +0,025 %) ou trailing stop 2 × ATR.

import { atr, last, rsi, volumeRatio } from '../../indicators';
import type { Intent, Strategy } from '../types';

export type FundingContrarianParams = {
  negFundingThreshold: number;
  posFundingExit: number;
  riskPct: number;
  maxPositions: number;
  maxPositionPct: number;
  maxHoldDays: number;
  cooldownDays: number;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

export const fundingContrarian: Strategy<FundingContrarianParams> = {
  id: 'funding-contrarian',
  version: 1,
  label: 'Funding Contrarian (Dérivés)',
  describe: 'Achète les excès de shorts (funding perp ≤ −0,012 %/8 h avec rebond technique) et prend ses profits sur surchauffe du levier (funding ≥ +0,025 %), TP1 50 % à 2 R + breakeven et trailing 2 × ATR.',
  defaults: {
    negFundingThreshold: -0.00012, posFundingExit: 0.00025,
    riskPct: 1, maxPositions: 3, maxPositionPct: 20, maxHoldDays: 14, cooldownDays: 5,
  },
  uses: ['regime'],
  replayable: true,
  universeTop: 60,
  riskOverlay: { maxHeatPct: 4, maxHighCorrPositions: 2, drawdownScaling: true },
  kind: 'trades',
  deposit: () => 0,
  decide: (ctx, p) => {
    const out: Intent[] = [];
    const pf = ctx.portfolio;

    // 1. Sorties sur surchauffe funding ou durée maximale
    for (const pos of pf.positions) {
      const funding = ctx.fundingAt?.(pos.coinId) ?? ctx.metrics?.(pos.coinId)?.fundingRate8h ?? null;
      if (funding != null && funding >= p.posFundingExit) {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: 1, tag: 'funding-hot', reason: `Funding surchauffé (+${(funding * 100).toFixed(3).replace('.', ',')} %/8 h) : prise de profit` });
        continue;
      }
      if (daysBetween(pos.openedOn, ctx.execDay) >= p.maxHoldDays) {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: 1, tag: 'time-exit', reason: `Durée maximale atteinte (${p.maxHoldDays} jours)` });
      }
    }

    const held = new Set(pf.positions.map((x) => x.coinId));
    let slots = p.maxPositions - pf.positions.length;
    let cash = pf.cashUsd;
    if (slots <= 0 || cash < 10) return out;

    type Cand = { u: typeof ctx.universe[number]; price: number; atr14: number; score: number; reason: string };
    const candidates: Cand[] = [];

    for (const u of ctx.universe.slice(0, 60)) {
      if (held.has(u.coinId)) continue;
      const lastStop = pf.lastFillOn('stop', u.coinId);
      if (lastStop != null && daysBetween(lastStop, ctx.execDay) < p.cooldownDays) continue;
      const cs = ctx.candles(u.coinId);
      if (cs.length < 35) continue;
      const closes = cs.map((c) => c.close);
      const lastBar = cs[cs.length - 1];
      const r14 = last(rsi(closes, 14)) ?? NaN;
      const a14 = last(atr(cs, 14)) ?? NaN;
      if (!Number.isFinite(r14) || !Number.isFinite(a14) || a14 <= 0) continue;
      const greenBounce = lastBar.close > lastBar.open;
      if (!greenBounce) continue;

      const funding = ctx.fundingAt?.(u.coinId) ?? ctx.metrics?.(u.coinId)?.fundingRate8h ?? null;
      if (funding != null) {
        if (funding <= p.negFundingThreshold && r14 < 45) {
          candidates.push({
            u, price: lastBar.close, atr14: a14, score: -funding * 10000 + (45 - r14),
            reason: `Capitulation shorts (funding ${(funding * 100).toFixed(3).replace('.', ',')} %/8 h, RSI ${Math.round(r14)}) + rebond`,
          });
        }
      } else {
        // Repli banc d'essai (sans historique funding) : survente extrême + volume de capitulation + bougie verte
        const vr = volumeRatio(cs, 20, { closedOnly: true });
        if (r14 < 28 && Number.isFinite(vr) && vr >= 1.5) {
          candidates.push({
            u, price: lastBar.close, atr14: a14, score: (30 - r14) + vr * 3,
            reason: `Capitulation technique (RSI ${Math.round(r14)}, vol ×${vr.toFixed(1).replace('.', ',')}) + bougie verte`,
          });
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    for (const c of candidates) {
      if (slots <= 0 || cash < 10) break;
      const stop = c.price - 1.8 * c.atr14;
      if (!(stop > 0)) continue;
      const riskUsd = pf.equityUsd * (p.riskPct / 100);
      const maxUsd = Math.min(pf.equityUsd * (p.maxPositionPct / 100), cash);
      out.push({
        coinId: c.u.coinId, symbol: c.u.symbol, name: c.u.name, side: 'buy',
        sizing: { riskUsd, maxUsd },
        stop,
        tpLegs: [{ rMultiple: 2, fraction: 0.5, moveStopToBe: true }],
        trailing: { mode: 'atr', value: 2, activateAfterR: 1.5, atr: c.atr14 },
        skipAbove: c.price * 1.03,
        skipBelow: stop,
        tag: 'funding-entry',
        reason: c.reason,
      });
      cash -= Math.min(maxUsd, (riskUsd / Math.max(c.price - stop, 1e-9)) * c.price);
      slots--;
    }

    return out;
  },
};
