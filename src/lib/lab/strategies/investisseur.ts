// « Investisseur (température) » : la partie de Boussole que la mesure valide. L'échéance est modulée par la
// température du marché (×2 en peur extrême … ×0,25 en euphorie), le reste attend en cash (la réserve), et une
// tranche est allégée en euphorie, au plus une fois tous les 30 jours.

import { temperatureMultiplier } from '../../dca';
import type { Intent, Strategy } from '../types';

export type InvestisseurParams = { amountUsd: number; daysOfWeek: number[]; btcPct: number; trimPct: number; trimMinDays: number };

const fr = (x: number) => String(x).replace('.', ',');
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

export const investisseur: Strategy<InvestisseurParams> = {
  id: 'investisseur',
  version: 1,
  label: 'Investisseur (température)',
  describe: 'Bitcoin et Ethereum, échéance modulée par la température du marché ; une tranche allégée en euphorie.',
  defaults: { amountUsd: 25, daysOfWeek: [2, 5], btcPct: 75, trimPct: 7.5, trimMinDays: 30 },
  uses: ['cycle'],
  replayable: true,
  kind: 'deposits',
  deposit: (ctx, p) => (ctx.scheduled(p.daysOfWeek) ? p.amountUsd : 0),
  decide: (ctx, p) => {
    const t = ctx.temperature;
    const out: Intent[] = [];
    if (t != null && t >= 80) {
      const last = ctx.portfolio.lastFillOn('trim');
      if (last == null || daysBetween(last, ctx.execDay) >= p.trimMinDays) {
        for (const pos of ctx.portfolio.positions) {
          out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: p.trimPct / 100, tag: 'trim', reason: `Euphorie (${Math.round(t)}/100) : une tranche de ${fr(p.trimPct)} %` });
        }
      }
    }
    if (!ctx.scheduled(p.daysOfWeek)) return out;
    const mult = t == null ? 1 : temperatureMultiplier(t);
    const budget = Math.min(p.amountUsd * mult, ctx.portfolio.cashUsd);
    const reason = t == null ? 'Température indisponible : échéance ×1' : `Température ${Math.round(t)}/100 : échéance ×${fr(mult)}`;
    const btc = Math.round(budget * p.btcPct) / 100;
    out.push({ coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', side: 'buy', sizing: { usd: btc }, reason, tag: 'dca' });
    out.push({ coinId: 'ethereum', symbol: 'eth', name: 'Ethereum', side: 'buy', sizing: { usd: Math.round((budget - btc) * 100) / 100 }, reason, tag: 'dca' });
    return out;
  },
};
