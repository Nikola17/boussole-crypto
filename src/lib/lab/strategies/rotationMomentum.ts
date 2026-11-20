// « Rotation Momentum (Dual Momentum) » : détient en permanence les 4 leaders du marché classés par
// momentum ajusté de la volatilité (Sharpe Momentum), pondérés à l'inverse de leur volatilité.
// Rééquilibrage bi-hebdomadaire (lundi & jeudi) + mise à l'abri 100 % USDC immédiate en tendance baissière BTC.

import { last, rsi, sma } from '../../indicators';
import type { Intent, Strategy } from '../types';

export type RotationMomentumParams = {
  topN: number;
  rebalanceDays: number[];
  maxWeightPct: number;
  minSharpeMom: number;
  minVolumeUsd: number;
};

export const rotationMomentum: Strategy<RotationMomentumParams> = {
  id: 'rotation-momentum',
  version: 1,
  label: 'Rotation Momentum (Leaders)',
  describe: 'Détient les 4 cryptos au meilleur momentum ajusté de la volatilité (au-dessus de leur MM50), pondérées à l’inverse de la volatilité ; rééquilibrage lundi & jeudi, bascule 100 % en USDC dès que Bitcoin passe en tendance baissière.',
  defaults: { topN: 4, rebalanceDays: [1, 4], maxWeightPct: 30, minSharpeMom: 0.1, minVolumeUsd: 5_000_000 },
  uses: ['regime'],
  replayable: true,
  universeTop: 100,
  kind: 'trades',
  deposit: () => 0,
  decide: (ctx, p) => {
    const out: Intent[] = [];
    const pf = ctx.portfolio;

    // Mise à l'abri immédiate (même hors jour de rééquilibrage) si bear market confirmé
    if (ctx.regime?.regime === 'BEAR_TREND') {
      for (const pos of pf.positions) {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: 1, tag: 'bear-cash', reason: 'Régime baissier BTC confirmé : passage en USDC refuge' });
      }
      return out;
    }

    if (!ctx.scheduled(p.rebalanceDays)) return out;

    // Sélection des leaders liquides en tendance (prix > MM50, RSI14 < 82, sharpeMom > seuil)
    type Pick = { u: typeof ctx.universe[number]; score: number; vol: number; price: number };
    const picks: Pick[] = [];
    for (const u of ctx.universe) {
      const cs = ctx.candles(u.coinId);
      if (cs.length < 95) continue;
      const m = ctx.metrics?.(u.coinId);
      if (!m || m.sharpeMom == null || m.vol30dAnn == null || m.sharpeMom < p.minSharpeMom) continue;
      if (m.volumeUsd30dMed != null && m.volumeUsd30dMed < p.minVolumeUsd) continue;
      const closes = cs.map((c) => c.close);
      const price = closes[closes.length - 1];
      const s50 = last(sma(closes, 50)) ?? NaN;
      const r14 = last(rsi(closes, 14)) ?? NaN;
      if (!Number.isFinite(s50) || price <= s50) continue;
      if (Number.isFinite(r14) && r14 > 82) continue;
      picks.push({ u, score: m.sharpeMom, vol: Math.max(20, m.vol30dAnn), price });
    }
    picks.sort((a, b) => b.score - a.score || (a.u.rank ?? Infinity) - (b.u.rank ?? Infinity));
    const chosen = picks.slice(0, p.topN);
    const chosenIds = new Set(chosen.map((x) => x.u.coinId));

    // Poids cibles inverses à la volatilité, plafonnés à maxWeightPct (réduits de moitié en EXTREME_STRESS)
    const stressFactor = ctx.regime?.regime === 'EXTREME_STRESS' ? 0.5 : 1;
    const invSum = chosen.reduce((s, x) => s + 1 / x.vol, 0);
    const targetWeight = new Map<string, number>();
    for (const x of chosen) {
      const raw = invSum > 0 ? (1 / x.vol) / invSum : 0;
      targetWeight.set(x.u.coinId, Math.min(p.maxWeightPct / 100, raw) * stressFactor);
    }

    // 1. Ventes : positions sorties du top N ou en surpoids > 5 pts
    let freedCash = pf.cashUsd;
    const heldValue = new Map<string, number>();
    for (const pos of pf.positions) {
      const cs = ctx.candles(pos.coinId);
      const px = cs.length ? cs[cs.length - 1].close : 0;
      const val = pos.quantity * px;
      heldValue.set(pos.coinId, val);
      const tgtUsd = (targetWeight.get(pos.coinId) ?? 0) * pf.equityUsd;
      if (!chosenIds.has(pos.coinId)) {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: 1, tag: 'rot-out', reason: 'Sorti du top momentum ou sous MM50 : rotation' });
        freedCash += val;
      } else if (val > tgtUsd + pf.equityUsd * 0.05 && val > 0) {
        const frac = Math.min(1, (val - tgtUsd) / val);
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: frac, tag: 'rot-trim', reason: 'Rééquilibrage vers la cible inverse-volatilité' });
        freedCash += val * frac;
      }
    }

    // 2. Achats / renforcements sur les leaders sélectionnés
    for (const x of chosen) {
      const tgtUsd = (targetWeight.get(x.u.coinId) ?? 0) * pf.equityUsd;
      const curUsd = heldValue.get(x.u.coinId) ?? 0;
      const delta = tgtUsd - curUsd;
      if (delta < Math.max(10, pf.equityUsd * 0.03) || freedCash < 10) continue;
      const usd = Math.min(delta, freedCash);
      out.push({
        coinId: x.u.coinId, symbol: x.u.symbol, name: x.u.name, side: 'buy',
        sizing: { usd },
        tag: 'rot-in',
        reason: `Leader momentum (SharpeMom ${x.score.toFixed(2).replace('.', ',')}, cible ${Math.round((targetWeight.get(x.u.coinId) ?? 0) * 100)} %)`,
      });
      freedCash -= usd;
    }

    return out;
  },
};
