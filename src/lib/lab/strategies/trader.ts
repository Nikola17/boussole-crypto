// « Trader (setups avec stop) » : entre seulement sur un setup que le banc d'essai valide, avec un signal trader
// haussier et Bitcoin au-dessus de sa moyenne 200 jours ; risque fixe par trade, stop, objectif en R ; sortie au bout
// de 30 jours ou sur « Vente forte » ; pause automatique après −20 % depuis le sommet.

import { analyze, SETUP_KEYS } from '../../signals';
import { SIGNAL_KEYS } from '../events';
import { reliabilityOf } from '../reliability';
import type { Intent, Strategy } from '../types';

export type TraderParams = {
  riskPct: number; maxPositions: number; maxPositionPct: number; targetR: number; maxHoldDays: number; cooldownDays: number;
  maxChasePct: number; regime: boolean; pauseDrawdownPct: number; onlyAvailable: boolean; setups: string[];
};

/** Setups haussiers au verdict « validé » ou « prometteur » dans la table de fiabilité embarquée. */
export function validatedBullSetups(): string[] {
  return SIGNAL_KEYS.filter((k) => k.key.startsWith('setup:') && k.bias === 'bull')
    .filter((k) => ['validé', 'prometteur'].includes(reliabilityOf(k.key)?.verdict ?? ''))
    .map((k) => k.key.slice('setup:'.length));
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);
const signed = (x: number) => `${x > 0 ? '+' : ''}${x}`;

export const trader: Strategy<TraderParams> = {
  id: 'trader',
  version: 1,
  label: 'Trader (setups avec stop)',
  describe: 'Entre sur les seuls setups validés par le banc d’essai, avec un stop et un objectif à 2 R ; risque 1 % par trade, 5 positions au plus, pause après −20 %.',
  defaults: { riskPct: 1, maxPositions: 5, maxPositionPct: 20, targetR: 2, maxHoldDays: 30, cooldownDays: 5, maxChasePct: 3, regime: true, pauseDrawdownPct: 20, onlyAvailable: true, setups: validatedBullSetups() },
  uses: ['signals'],
  replayable: true,
  kind: 'trades',
  deposit: () => 0,
  decide: (ctx, p) => {
    const out: Intent[] = [];
    const pf = ctx.portfolio;
    const analysisOf = (coinId: string) => {
      const cs = ctx.candles(coinId);
      return cs.length >= 30 ? analyze(cs, { temperature: ctx.temperature ?? undefined }, { closedOnly: true }) : null;
    };
    for (const pos of pf.positions) {
      if (daysBetween(pos.openedOn, ctx.execDay) >= p.maxHoldDays) {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: 1, tag: 'time-exit', reason: `Durée maximale atteinte (${p.maxHoldDays} jours)` });
      } else if (analysisOf(pos.coinId)?.trader.label === 'Vente forte') {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: 1, tag: 'signal-exit', reason: 'Signal trader passé à « Vente forte »' });
      }
    }
    const paused = pf.minSincePeakUsd <= pf.peakEquityUsd * (1 - p.pauseDrawdownPct / 100) && pf.equityUsd < pf.peakEquityUsd * (1 - p.pauseDrawdownPct / 200);
    if (paused || (p.regime && ctx.btcAboveSma200 !== true) || !p.setups.length) return out;
    const held = new Set(pf.positions.map((x) => x.coinId));
    let slots = p.maxPositions - pf.positions.length;
    let cash = pf.cashUsd;
    const candidates = ctx.universe
      .filter((u) => !held.has(u.coinId) && !(p.onlyAvailable && u.available === false))
      .filter((u) => { const last = pf.lastFillOn('stop', u.coinId); return last == null || daysBetween(last, ctx.execDay) >= p.cooldownDays; })
      .map((u) => ({ u, a: analysisOf(u.coinId) }))
      .filter((x) => x.a && x.a.trader.tone === 'up' && x.a.plan && x.a.setups.some((s) => p.setups.includes(s.key)))
      .sort((x, y) => y.a!.trader.score - x.a!.trader.score || (x.u.rank ?? Infinity) - (y.u.rank ?? Infinity));
    for (const { u, a } of candidates) {
      if (slots <= 0 || cash < 1) break;
      const setup = a!.setups.find((s) => p.setups.includes(s.key))!;
      const c = a!.price;
      const stop = a!.plan!.stop;
      const maxUsd = Math.min(pf.equityUsd * (p.maxPositionPct / 100), cash);
      const riskUsd = pf.equityUsd * (p.riskPct / 100);
      out.push({
        coinId: u.coinId, symbol: u.symbol, name: u.name, side: 'buy', sizing: { riskUsd, maxUsd }, stop, targetR: p.targetR,
        skipAbove: c * (1 + p.maxChasePct / 100), skipBelow: stop, tag: `setup:${setup.key}`,
        reason: `${SETUP_KEYS[setup.key] ?? setup.label} · signal trader « ${a!.trader.label} » (${signed(a!.trader.score)})`,
      });
      cash -= Math.min(maxUsd, (riskUsd / Math.max(c - stop, 1e-9)) * c);
      slots--;
    }
    return out;
  },
};
