// Hooks de données de marché (mise en cache par TanStack Query).

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useMemo } from 'react';
import * as cg from '../api/coingecko';
import { binanceSymbolFor, getAllPrices, getBtcFunding, getDailyHistory, getKlines, type Interval } from '../api/binance';
import { getFearGreed } from '../api/feargreed';
import { getFees, getProtocols, getStablecoinChange30d } from '../api/defillama';
import { getNewPools, getTrendingPools, type DexPool } from '../api/dex';
import { pool } from '../api/http';
import { altSeasonIndex, computeCycle } from '../lib/cycle';
import { analyze, type Analysis } from '../lib/signals';
import type { Candle } from '../lib/indicators';
import { isStable, isWrappedOrStaked } from '../lib/portfolio';

const MIN = 60_000;

// ------------------------------------------------------------------ Devise

const FX_KEY = 'boussole-fx';
function readFx(): number {
  try {
    const v = Number(localStorage.getItem(FX_KEY));
    return v > 0.3 && v < 3 ? v : 0.86;
  } catch {
    return 0.86;
  }
}

export function useFx(): number {
  const q = useQuery({
    queryKey: ['fx'],
    queryFn: async () => {
      const v = await cg.getEurPerUsd();
      try { localStorage.setItem(FX_KEY, String(v)); } catch { /* stockage indisponible */ }
      return v;
    },
    staleTime: 60 * MIN,
    retry: 1,
  });
  return q.data ?? readFx();
}

// ------------------------------------------------------------------ Marché global

export function useMarkets() {
  return useQuery({
    queryKey: ['markets', 1],
    queryFn: () => cg.getMarkets({ page: 1, perPage: 250, sparkline: true }),
    staleTime: 3 * MIN,
    refetchInterval: 4 * MIN,
    placeholderData: keepPreviousData,
  });
}

export function useGlobal() {
  return useQuery({ queryKey: ['global'], queryFn: cg.getGlobal, staleTime: 10 * MIN, refetchInterval: 10 * MIN });
}

export function useFearGreed(limit = 60) {
  return useQuery({ queryKey: ['fng', limit], queryFn: () => getFearGreed(limit), staleTime: 30 * MIN });
}

export function useTrending() {
  return useQuery({ queryKey: ['trending'], queryFn: cg.getTrending, staleTime: 10 * MIN });
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: cg.getCategories, staleTime: 15 * MIN });
}

export function useBtcHistory() {
  return useQuery({
    queryKey: ['btc-history'],
    queryFn: () => getDailyHistory('BTCUSDT', Date.UTC(2017, 7, 17)),
    staleTime: 60 * MIN,
    gcTime: 120 * MIN,
  });
}

export function useFunding() {
  return useQuery({ queryKey: ['funding'], queryFn: getBtcFunding, staleTime: 30 * MIN, retry: 0 });
}

export function useStablecoins() {
  return useQuery({ queryKey: ['stables'], queryFn: getStablecoinChange30d, staleTime: 60 * MIN, retry: 1 });
}

export function useCycle() {
  const btc = useBtcHistory();
  const fng = useFearGreed(60);
  const funding = useFunding();
  const data = useMemo(() => {
    if (!btc.data) return null;
    const lastFng = fng.data?.[fng.data.length - 1]?.value;
    return computeCycle({ btcDaily: btc.data, fng: lastFng, fundingRate: funding.data ?? undefined });
  }, [btc.data, fng.data, funding.data]);
  return { data, isLoading: btc.isLoading, error: btc.error };
}

export function useAltSeason() {
  const markets = useMarkets();
  return useMemo(() => {
    const rows = (markets.data ?? [])
      .filter((m) => !isStable(m.symbol, m.id) && !isWrappedOrStaked(m.symbol, m.name, m.id))
      .slice(0, 51);
    const btc = rows.find((r) => r.id === 'bitcoin');
    if (!btc) return null;
    return altSeasonIndex(
      rows.map((r) => ({ id: r.id, change30d: r.price_change_percentage_30d_in_currency })),
      btc.price_change_percentage_30d_in_currency ?? NaN,
    );
  }, [markets.data]);
}

// ------------------------------------------------------------------ Bougies & analyses

export interface CoinCandles {
  candles: Candle[];
  source: 'binance' | 'coingecko';
  symbol: string | null;
}

export async function fetchCoinCandles(coin: { id: string; symbol: string; priceUsd: number }, interval: Interval = '1d', limit = 500): Promise<CoinCandles> {
  try {
    const prices = await getAllPrices();
    const sym = binanceSymbolFor(coin, prices);
    if (sym) return { candles: await getKlines(sym, interval, limit), source: 'binance', symbol: sym };
  } catch {
    /* repli CoinGecko */
  }
  if (interval !== '1d') return { candles: [], source: 'coingecko', symbol: null };
  const chart = await cg.getMarketChart(coin.id, 365);
  const vols = new Map(chart.total_volumes.map(([t, v]) => [Math.floor(t / 86400000), v]));
  const candles: Candle[] = chart.prices.map(([t, p], i, arr) => {
    const prev = i > 0 ? arr[i - 1][1] : p;
    return {
      time: Math.floor(t / 1000),
      open: prev,
      high: Math.max(prev, p),
      low: Math.min(prev, p),
      close: p,
      volume: vols.get(Math.floor(t / 86400000)) ?? 0,
    };
  });
  // Dédoublonne par jour (CoinGecko ajoute un point « maintenant »)
  const byDay = new Map<number, Candle>();
  for (const c of candles) byDay.set(Math.floor(c.time / 86400), c);
  return { candles: [...byDay.values()], source: 'coingecko', symbol: null };
}

export function useCoinCandles(coin: { id: string; symbol: string; priceUsd: number } | null, interval: Interval = '1d') {
  return useQuery({
    queryKey: ['candles', coin?.id, interval],
    queryFn: () => fetchCoinCandles(coin!, interval, interval === '1d' ? 1000 : 500),
    enabled: !!coin && coin.priceUsd > 0,
    staleTime: 5 * MIN,
    placeholderData: keepPreviousData,
  });
}

export interface ScanRow {
  id: string;
  analysis: Analysis | null;
}

/** Analyse technique d'une liste de cryptos (bougies Binance, concurrence limitée). */
export function useScan(coins: cg.CgMarket[], temperature: number | undefined, enabled = true) {
  const ids = coins.map((c) => c.id).join(',');
  return useQuery({
    queryKey: ['scan', ids, temperature != null ? Math.round(temperature / 5) : null],
    enabled: enabled && coins.length > 0,
    staleTime: 20 * MIN,
    gcTime: 60 * MIN,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const prices = await getAllPrices().catch(() => new Map<string, number>());
      const results = await pool(coins, 6, async (c) => {
        const sym = binanceSymbolFor({ id: c.id, symbol: c.symbol, priceUsd: c.current_price }, prices);
        if (!sym) return { id: c.id, analysis: null } as ScanRow;
        const candles = await getKlines(sym, '1d', 400);
        return { id: c.id, analysis: analyze(candles, { temperature, athChangePct: c.ath_change_percentage }) } as ScanRow;
      });
      const map = new Map<string, Analysis | null>();
      results.forEach((r, i) => map.set(coins[i].id, r?.analysis ?? null));
      return map;
    },
  });
}

export function useCoin(id: string | null) {
  return useQuery({ queryKey: ['coin', id], queryFn: () => cg.getCoin(id!), enabled: !!id, staleTime: 10 * MIN });
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: () => cg.searchCoins(q),
    enabled: q.trim().length >= 2,
    staleTime: 30 * MIN,
  });
}

export function usePrices(ids: string[]) {
  const key = [...new Set(ids)].sort().join(',');
  return useQuery({
    queryKey: ['prices', key],
    queryFn: () => cg.getSimplePrices(key.split(',').filter(Boolean)),
    enabled: key.length > 0,
    staleTime: 3 * MIN,
    refetchInterval: 5 * MIN,
    placeholderData: keepPreviousData,
  });
}

// ------------------------------------------------------------------ Pépites

export function useSmallCaps(enabled: boolean) {
  return useQuery({
    queryKey: ['smallcaps'],
    enabled,
    staleTime: 20 * MIN,
    queryFn: async () => {
      const pages = await pool([2, 3, 4, 5], 1, (p) => cg.getMarkets({ page: p, perPage: 250 }));
      return pages.flatMap((p) => p ?? []);
    },
  });
}

export function useDexPools(networks: string[], includeNew: boolean, enabled: boolean) {
  return useQuery({
    queryKey: ['dex', networks.join(','), includeNew],
    enabled: enabled && networks.length > 0,
    staleTime: 5 * MIN,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const jobs: (() => Promise<DexPool[]>)[] = [];
      for (const n of networks) {
        jobs.push(() => getTrendingPools(n, 1));
        if (includeNew) jobs.push(() => getNewPools(n, 1));
      }
      const res = await pool(jobs, 2, (job) => job());
      const all = res.flatMap((r) => r ?? []);
      const seen = new Set<string>();
      return all.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    },
  });
}

export function useDefi(enabled: boolean) {
  return useQuery({
    queryKey: ['defillama'],
    enabled,
    staleTime: 60 * MIN,
    gcTime: 90 * MIN,
    queryFn: async () => {
      const [protocols, fees, revenue] = await Promise.all([
        getProtocols(),
        getFees('dailyFees').catch(() => new Map()),
        getFees('dailyRevenue').catch(() => new Map()),
      ]);
      return { protocols, fees, revenue };
    },
  });
}
