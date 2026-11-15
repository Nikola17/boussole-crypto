// « DCA Boussole » : le panier automatique de l'application, suivi à la lettre sur un portefeuille papier.
// Mêmes règles que l'écran DCA (buildAutoBasketPlan) ; l'état du papier fournit les montants détenus et la réserve.
// Non rejouable (classement, pépites et disponibilité n'ont pas d'historique) : au banc d'essai, la base seule.

import { analyze } from '../../signals';
import { buildAutoBasketPlan } from '../../autoBasket';
import { ARCHETYPES } from '../../profile';
import type { CgMarket } from '../../../api/coingecko';
import type { Intent, Strategy } from '../types';

export type DcaBoussoleParams = { amountUsd: number; daysOfWeek: number[]; basePct: number; maxBaseLines: number; maxDiscoveryLines: number; discoverySource: string; minOrderUsd: number };

/** Ligne de marché minimale à partir de l'univers figé (banc d'essai, ou données en direct indisponibles). */
const pseudoRow = (u: { coinId: string; symbol: string; name: string; rank: number | null }): CgMarket => ({
  id: u.coinId, symbol: u.symbol, name: u.name, image: '', current_price: 0, market_cap: 0, market_cap_rank: u.rank, fully_diluted_valuation: null, total_volume: 0,
  high_24h: null, low_24h: null, price_change_percentage_24h: null, circulating_supply: null, total_supply: null, max_supply: null, ath: 0, ath_change_percentage: 0, ath_date: '', last_updated: '',
});

export const dcaBoussole: Strategy<DcaBoussoleParams> = {
  id: 'dca-boussole',
  version: 1,
  label: 'DCA Boussole',
  describe: 'Le panier automatique de Boussole : jusqu’à 3 cryptos du top 20 et 3 découvertes à chaque échéance, montant modulé par la température, réserve et règles du panier.',
  defaults: { amountUsd: 25, daysOfWeek: [2, 5], basePct: 70, maxBaseLines: 3, maxDiscoveryLines: 3, discoverySource: 'both', minOrderUsd: 5 },
  uses: ['signals', 'cycle', 'autoBasket'],
  replayable: false,
  kind: 'deposits',
  deposit: (ctx, p) => (ctx.scheduled(p.daysOfWeek) ? p.amountUsd : 0),
  decide: (ctx, p) => {
    if (!ctx.scheduled(p.daysOfWeek)) return [];
    const live = ctx.live;
    const markets = live?.markets ?? ctx.universe.map(pseudoRow);
    const scores: Record<string, number> = {};
    const change7d: Record<string, number | null> = {};
    for (const u of ctx.universe) {
      const cs = ctx.candles(u.coinId);
      if (!cs.length) continue;
      change7d[u.coinId] = cs.length > 7 ? (cs[cs.length - 1].close / cs[cs.length - 8].close - 1) * 100 : null;
      const a = cs.length >= 30 ? analyze(cs, { temperature: ctx.temperature ?? undefined, isBitcoin: u.coinId === 'bitcoin' }, { closedOnly: true }) : null;
      if (a) scores[u.coinId] = a.investor.score;
    }
    const heldUsd: Record<string, number> = {};
    for (const pos of ctx.portfolio.positions) {
      const cs = ctx.candles(pos.coinId);
      heldUsd[pos.coinId] = pos.quantity * (cs[cs.length - 1]?.close ?? 0);
    }
    const baseIds = new Set(ctx.universe.map((u) => u.coinId));
    const known = ctx.universe.length > 0 && ctx.universe.every((u) => u.available != null);
    const plan = buildAutoBasketPlan({
      basket: {
        amountUsd: p.amountUsd, basePct: live ? p.basePct : 100, maxBaseLines: p.maxBaseLines, maxDiscoveryLines: p.maxDiscoveryLines, minOrderUsd: p.minOrderUsd,
        reserveUsd: Math.max(0, ctx.portfolio.cashUsd - p.amountUsd), discoverySource: p.discoverySource as 'gems' | 'mid' | 'both',
      },
      markets, smallCaps: live?.smallCaps ?? null, scores, change7d,
      cdc: known ? Object.fromEntries(ctx.universe.map((u) => [u.coinId, u.available ? 'app' : 'unknown'])) : null,
      temperature: ctx.temperature, heldUsd, totalValueUsd: ctx.portfolio.equityUsd, rules: live?.rules ?? ARCHETYPES['Ma stratégie'].rules,
      linesOpen: ctx.portfolio.positions.length, discoveryLinesOpen: ctx.portfolio.positions.filter((x) => !baseIds.has(x.coinId)).length,
    });
    return plan.orders.map((o): Intent => ({ coinId: o.coinId, symbol: o.symbol, name: o.name, side: 'buy', sizing: { usd: o.usd }, reason: o.reason, tag: 'dca' }));
  },
};
