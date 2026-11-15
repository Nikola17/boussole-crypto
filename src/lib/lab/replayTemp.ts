// Température du marché rejouable : pour n'importe quel jour passé, les mêmes indicateurs que l'application
// (computeCycle), avec les seules données disponibles en historique gratuit : bougies Bitcoin, Fear & Greed du
// jour, MVRV avec ses 7 jours de retard. Sans part des stablecoins ni taux de financement (pas d'historique).

import { computeCycle } from '../cycle';
import type { Candle } from '../indicators';
import { dayOf } from './universe';

const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

function tempAtIndex(btc: Candle[], i: number, fngByDay: Map<string, number>, mvrvByDay: Map<string, number>): number | null {
  if (i < 199) return null;
  const day = dayOf(btc[i].time);
  const r = computeCycle({ btcDaily: btc.slice(Math.max(0, i - 1499), i + 1), fng: fngByDay.get(day), mvrv: mvrvByDay.get(addDays(day, -7)) });
  return r ? r.temperature : null;
}

export function temperatureAt(day: string, btc: Candle[], fngByDay: Map<string, number>, mvrvByDay: Map<string, number>): number | null {
  const i = btc.findIndex((c) => dayOf(c.time) === day);
  return i < 0 ? null : tempAtIndex(btc, i, fngByDay, mvrvByDay);
}

export function temperatureSeries(btc: Candle[], fngByDay: Map<string, number>, mvrvByDay: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 199; i < btc.length; i++) {
    const t = tempAtIndex(btc, i, fngByDay, mvrvByDay);
    if (t != null) out.set(dayOf(btc[i].time), t);
  }
  return out;
}
