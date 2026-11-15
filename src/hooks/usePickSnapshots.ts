// Relevé hebdomadaire des pépites (au premier lancement de chaque semaine ISO) et prix à 30 et 90 jours.
// Les petites capis (pages 2 à 5 de CoinGecko) ne sont demandées que lorsqu'un relevé ou un prix est attendu.

import { useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useMarkets, useSmallCaps } from './useMarket';
import { useToday } from './useClock';
import { DEFAULT_SMALLCAP_FILTER, isSmallCapCandidate, scoreSmallCap, smallCapInputOf } from '../lib/gems';
import { fillForward, picksDue, recordWeek, weeklyPicks } from '../lib/pickTracking';
import { isoWeek } from '../lib/lab/clock';
import { isoDay } from '../lib/format';

export function usePickSnapshots(): void {
  const snaps = useStore((s) => s.pickSnapshots);
  const discovery = useStore((s) => s.basket?.discovery);
  const today = isoDay(useToday());
  const week = isoWeek(today);
  const needWeek = !snaps.some((s) => s.id === week);
  const needForward = picksDue(snaps, today);
  const markets = useMarkets();
  const small = useSmallCaps(needWeek || needForward);
  const prices = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of [...(markets.data ?? []), ...(small.data ?? [])]) if (x.current_price > 0 && !m.has(x.id)) m.set(x.id, x.current_price);
    return m;
  }, [markets.data, small.data]);

  useEffect(() => {
    if (!markets.data || !small.data || !(needWeek || needForward)) return;
    const btc = prices.get('bitcoin') ?? null;
    if (!btc) return;
    const st = useStore.getState();
    let next = st.pickSnapshots;
    if (needWeek) {
      const seen = new Set<string>();
      const gems = [...markets.data.slice(100), ...small.data]
        .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
        .map((m) => ({ m, input: smallCapInputOf(m, false) }))
        .filter((r) => isSmallCapCandidate(r.input, DEFAULT_SMALLCAP_FILTER))
        .map((r) => ({ coinId: r.m.id, symbol: r.m.symbol, score: scoreSmallCap(r.input).score, priceUsd: r.m.current_price }));
      const basket = (discovery ?? []).map((c) => ({ coinId: c.coinId, symbol: c.symbol, priceUsd: prices.get(c.coinId) ?? 0 }));
      next = recordWeek(next, weeklyPicks(week, today, gems, basket, btc));
    }
    if (needForward) next = fillForward(next, today, (id) => prices.get(id) ?? null, btc);
    const before = new Map(st.pickSnapshots.map((s) => [s.id, s]));
    for (const s of next) if (before.get(s.id) !== s) st.upsertPickSnapshot(s);
  }, [markets.data, small.data, needWeek, needForward, prices, discovery, week, today]);
}
