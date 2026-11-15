// Courbe de valeur d'un portefeuille papier : calculée, jamais enregistrée, à partir de ses ordres et des clôtures
// journalières. Une crypto sans clôture un jour donné garde son dernier prix connu (valorisation partielle, signalée).

import type { PaperTrade } from '../../types';
import type { DayPoint } from './metrics';
import type { Fill } from './types';

const addDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);

export function paperEquitySeries(startingUsd: number, trades: PaperTrade[], closes: Map<string, Map<string, number>>, from: string, to: string): { series: DayPoint[]; partial: boolean } {
  const sorted = [...trades].sort((a, b) => (a.time ?? a.date).localeCompare(b.time ?? b.date));
  let cash = startingUsd;
  const qty = new Map<string, number>();
  const last = new Map<string, number>();
  let partial = false;
  let k = 0;
  const series: DayPoint[] = [];
  for (let day = from; day <= to; day = addDay(day)) {
    while (k < sorted.length && sorted[k].date <= day) {
      const t = sorted[k++];
      const fee = t.feeUsd ?? 0;
      if (t.type === 'buy') { cash -= t.quantity * t.priceUsd + fee; qty.set(t.coinId, (qty.get(t.coinId) ?? 0) + t.quantity); }
      else { cash += t.quantity * t.priceUsd - fee; qty.set(t.coinId, Math.max(0, (qty.get(t.coinId) ?? 0) - t.quantity)); }
      last.set(t.coinId, t.marketUsd ?? t.priceUsd);
    }
    let value = cash;
    for (const [coinId, q] of qty) {
      if (!(q > 1e-12)) continue;
      const c = closes.get(coinId)?.get(day);
      if (c != null) last.set(coinId, c);
      else partial = true;
      value += q * (last.get(coinId) ?? 0);
    }
    series.push({ day, valueUsd: value, cashUsd: cash, flowUsd: 0 });
  }
  return { series, partial };
}

export function tradesToFills(trades: PaperTrade[]): Fill[] {
  return [...trades].sort((a, b) => (a.time ?? a.date).localeCompare(b.time ?? b.date)).map((t) => ({
    coinId: t.coinId, symbol: t.symbol, name: t.name, side: t.type, kind: t.orderType === 'stop' ? 'stop' : t.orderType === 'target' ? 'target' : t.orderType === 'limit' ? 'limit' : 'market',
    quantity: t.quantity, marketUsd: t.marketUsd ?? t.priceUsd, priceUsd: t.priceUsd, feeUsd: t.feeUsd ?? 0, at: t.time ?? t.date, reason: t.reason ?? '',
  }));
}
