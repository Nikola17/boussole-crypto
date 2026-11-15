// « DCA Bitcoin simple » : la référence. Chaque échéance, le montant entier en Bitcoin, sans modulation.

import type { Strategy } from '../types';

export type DcaBtcParams = { amountUsd: number; daysOfWeek: number[] };

export const dcaBtc: Strategy<DcaBtcParams> = {
  id: 'dca-btc',
  version: 1,
  label: 'DCA Bitcoin simple',
  describe: 'À chaque échéance, tout le montant en Bitcoin. C’est la référence : une stratégie qui ne fait pas mieux ne mérite pas d’être suivie.',
  defaults: { amountUsd: 25, daysOfWeek: [2, 5] },
  uses: [],
  replayable: true,
  kind: 'deposits',
  deposit: (ctx, p) => (ctx.scheduled(p.daysOfWeek) ? p.amountUsd : 0),
  decide: (ctx, p) => (ctx.scheduled(p.daysOfWeek)
    ? [{ coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', side: 'buy', sizing: { usd: p.amountUsd }, reason: 'Échéance : Bitcoin, sans modulation', tag: 'dca' }]
    : []),
};
