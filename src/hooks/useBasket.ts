// Panier DCA : assemble les données (portefeuille, marché, cycle, disponibilité Crypto.com) et calcule l'ordre du jour.

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getMarkets } from '../api/coingecko';
import { useStore } from '../store/useStore';
import { useCycle, useMarkets, useScan, useSmallCaps } from './useMarket';
import { usePortfolio } from './usePortfolio';
import { useCryptoCom } from './useCryptoCom';
import {
  basketPeriodKey, lastBasketOccurrence, nextBasketOccurrences, planBasketOrder, type BasketContext,
} from '../lib/basket';
import { rulesOf } from '../lib/profile';
import { scatterReport } from '../lib/scatter';
import { autoDiscoveryCandidates } from '../lib/discovery';
import type { CoinRef } from '../types';
import { useToday } from './useClock';

/** Échéance du panier (calendrier seulement, sans réseau) : sert au Cockpit et aux rappels. */
export function useBasketDue() {
  const basket = useStore((s) => s.basket);
  const executions = useStore((s) => s.basketExecutions);
  // Le jour courant change à minuit même si l'application reste ouverte (zone de notification) : l'échéance suit.
  const today = useToday();
  return useMemo(() => {
    if (!basket) return { basket: null, last: null as Date | null, periodKey: null as string | null, done: false, due: false, next: null as Date | null };
    const last = lastBasketOccurrence(basket, today);
    const periodKey = last ? basketPeriodKey(last) : null;
    const done = !!periodKey && executions.some((e) => e.basketId === basket.id && e.periodKey === periodKey);
    const next = nextBasketOccurrences(basket, new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1), 1)[0] ?? null;
    return { basket, last, periodKey, done, due: basket.active && !!last && !done, next };
  }, [basket, executions, today]);
}

export function useBasket() {
  const basket = useStore((s) => s.basket);
  const profile = useStore((s) => s.profile);
  const pf = usePortfolio();
  const cycle = useCycle();
  const markets = useMarkets();

  // Découverte automatique : tu ne choisis plus rien — les candidates viennent du scan des pépites.
  const autoMode = basket?.discoveryMode === 'auto';
  const smalls = useSmallCaps(autoMode);
  const autoPicks = useMemo(() => {
    if (!autoMode || !basket || !smalls.data) return [];
    const inputs = smalls.data.map((m) => ({
      id: m.id, symbol: m.symbol, name: m.name, marketCap: m.market_cap, fdv: m.fully_diluted_valuation, volume24h: m.total_volume,
      change7d: m.price_change_percentage_7d_in_currency ?? null, change30d: m.price_change_percentage_30d_in_currency ?? null,
      athChangePct: m.ath_change_percentage, rank: m.market_cap_rank,
    }));
    return autoDiscoveryCandidates(inputs, {
      excluded: new Set(basket.core.map((c) => c.coinId)),
      excludedSymbols: new Set(basket.core.map((c) => c.symbol.toUpperCase())),
    });
  }, [autoMode, basket, smalls.data]);

  const ids = useMemo(() => (basket ? [...new Set([...basket.core.map((c) => c.coinId), ...basket.discovery.map((c) => c.coinId), ...(autoPicks.map((p) => p.coin.coinId))])] : []), [basket, autoPicks]);
  // On réutilise les cours déjà chargés (top 250) et on ne demande à CoinGecko que les cryptos manquantes.
  const marketMap = useMemo(() => new Map((markets.data ?? []).map((m) => [m.id, m])), [markets.data]);
  const missing = useMemo(() => ids.filter((id) => !marketMap.has(id)), [ids, marketMap]);
  const bm = useQuery({
    queryKey: ['basket-markets', missing.join(',')],
    enabled: missing.length > 0 && !!markets.data,
    staleTime: 3 * 60_000,
    queryFn: () => getMarkets({ ids: missing, perPage: 250 }),
  });
  const coins = useMemo(() => [...ids.map((id) => marketMap.get(id)).filter((m): m is NonNullable<typeof m> => !!m), ...(bm.data ?? [])], [ids, marketMap, bm.data]);
  const scan = useScan(coins, cycle.data?.temperature);
  const cdc = useCryptoCom(coins);

  // Le cycle peut manquer (Binance injoignable) : l'ordre est alors calculé à ×1 avec un avertissement, au lieu de disparaître un jour de DCA.
  const cycleSettled = !!cycle.data || !!cycle.error;
  // En mode auto, le scan des pépites doit avoir répondu (même vide) : jamais de plan « sans regarder ».
  const autoSettled = !autoMode || !!smalls.data || !!smalls.isError;
  const ready = !!basket && !pf.loading && cycleSettled && autoSettled && !!markets.data && (missing.length === 0 || !!bm.data || bm.isError);
  const loadError = (markets.error ?? cycle.error ?? null) as Error | null;

  const ctx = useMemo((): BasketContext | null => {
    if (!basket || !ready) return null;
    const rules = rulesOf(profile);
    const values: Record<string, number> = {};
    for (const h of pf.holdings) if (h.coinId) values[h.coinId] = (values[h.coinId] ?? 0) + h.valueUsd;
    const totalValueUsd = pf.holdings.reduce((s, h) => s + h.valueUsd, 0);
    const allocTotal = Object.values(pf.alloc).reduce((s, v) => s + v, 0);
    const tt = Object.values(profile.target).reduce((s, v) => s + v, 0) || 100;
    const change7d: Record<string, number | null> = {};
    for (const m of coins) change7d[m.id] = m.price_change_percentage_7d_in_currency ?? null;
    const scores: Record<string, number> = {};
    for (const id of ids) { const a = scan.data?.get(id); if (a) scores[id] = a.investor.score; }
    const cdcMap = cdc.ready ? Object.fromEntries(ids.map((id) => [id, cdc.status(id)])) : null;
    return {
      temperature: cycle.data?.temperature ?? null,
      totalValueUsd,
      altTargetPct: ((profile.target.large + profile.target.mid + profile.target.small) / tt) * 100,
      altCurrentPct: allocTotal > 0 ? ((pf.alloc.large + pf.alloc.mid + pf.alloc.small) / allocTotal) * 100 : 0,
      values,
      change7d,
      cdc: cdcMap,
      scores,
      autoDiscovery: autoPicks.length ? autoPicks.map((p) => p.coin) : undefined,
      rules: { maxPerGemPct: rules.maxPerGemPct, minLinePct: rules.minLinePct, maxDiscoveryLines: rules.maxDiscoveryLines },
      discoveryLinesOpen: scatterReport(pf.holdings, rules).discoveryLines,
    };
  }, [basket, ready, profile, pf.holdings, pf.alloc, coins, ids, scan.data, cdc, cycle.data, autoPicks]);

  const plan = useMemo(() => (basket && ctx ? planBasketOrder(basket, ctx) : null), [basket, ctx]);

  const { last, periodKey, done, due, next } = useBasketDue();

  /** Symbole (majuscules) → crypto : panier, positions, puis marché (la mieux classée en cas d'homonymes). */
  const known = useMemo(() => {
    const m: Record<string, CoinRef> = {};
    for (const c of (markets.data ?? [])) { const k = c.symbol.toUpperCase(); if (!m[k]) m[k] = { coinId: c.id, symbol: c.symbol, name: c.name, image: c.image }; }
    for (const c of coins) m[c.symbol.toUpperCase()] = { coinId: c.id, symbol: c.symbol, name: c.name, image: c.image };
    for (const h of pf.holdings) if (h.coinId) m[h.symbol.toUpperCase()] = { coinId: h.coinId, symbol: h.symbol, name: h.name, image: h.image };
    if (basket) for (const c of [...basket.core, ...basket.discovery]) m[c.symbol.toUpperCase()] = { coinId: c.coinId, symbol: c.symbol, name: c.name, image: c.image };
    return m;
  }, [markets.data, coins, pf.holdings, basket]);

  const priceOf = (id: string): number | null => coins.find((c) => c.id === id)?.current_price ?? markets.data?.find((c) => c.id === id)?.current_price ?? null;

  return {
    loadError, missingCoins: bm.isError && missing.length > 0, retry: () => { void markets.refetch(); void bm.refetch(); },
    basket, ctx, plan, ready, loading: !!basket && !ready && !loadError, markets: coins, known, priceOf, rate: pf.rate, currency: pf.currency, cycle: cycle.data, temperature: cycle.data?.temperature ?? null, holdings: pf.holdings, last, periodKey, done, due, next,
    autoCandidates: autoPicks,
  };
}
