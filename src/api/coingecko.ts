// CoinGecko (API publique ou clé « Demo » gratuite). Toutes les valeurs en USD.

import { getJson } from './http';

const BASE = 'https://api.coingecko.com/api/v3';
let demoKey = '';

export function setCoinGeckoKey(k: string) {
  demoKey = k.trim();
}

function url(path: string, params: Record<string, string | number | boolean | undefined> = {}): string {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.searchParams.set(k, String(v));
  if (demoKey) u.searchParams.set('x_cg_demo_api_key', demoKey);
  return u.toString();
}

export interface CgMarket {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number | null;
  fully_diluted_valuation: number | null;
  total_volume: number;
  high_24h: number | null;
  low_24h: number | null;
  price_change_percentage_24h: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  sparkline_in_7d?: { price: number[] };
  price_change_percentage_1h_in_currency?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
  price_change_percentage_200d_in_currency?: number | null;
  price_change_percentage_1y_in_currency?: number | null;
  last_updated: string;
}

export function getMarkets(opts: { page?: number; perPage?: number; category?: string; ids?: string[]; sparkline?: boolean } = {}): Promise<CgMarket[]> {
  return getJson<CgMarket[]>(url('/coins/markets', {
    vs_currency: 'usd',
    order: 'market_cap_desc',
    per_page: opts.perPage ?? 250,
    page: opts.page ?? 1,
    sparkline: opts.sparkline ?? false,
    price_change_percentage: '1h,24h,7d,30d,200d,1y',
    category: opts.category,
    ids: opts.ids?.join(','),
  }));
}

export interface CgGlobal {
  data: {
    active_cryptocurrencies: number;
    total_market_cap: Record<string, number>;
    total_volume: Record<string, number>;
    market_cap_percentage: Record<string, number>;
    market_cap_change_percentage_24h_usd: number;
  };
}

export function getGlobal(): Promise<CgGlobal> {
  return getJson<CgGlobal>(url('/global'));
}

export interface CgTrending {
  coins: {
    item: {
      id: string;
      name: string;
      symbol: string;
      market_cap_rank: number | null;
      thumb: string;
      small: string;
      data?: { price?: number; price_change_percentage_24h?: Record<string, number>; market_cap?: string; total_volume?: string };
    };
  }[];
  categories?: { id: number; name: string; slug?: string; data?: { market_cap_change_percentage_24h?: Record<string, number> } }[];
}

export function getTrending(): Promise<CgTrending> {
  return getJson<CgTrending>(url('/search/trending'));
}

export interface CgCategory {
  id: string;
  name: string;
  market_cap: number | null;
  market_cap_change_24h: number | null;
  volume_24h: number | null;
  top_3_coins: string[];
  top_3_coins_id?: string[];
}

export function getCategories(): Promise<CgCategory[]> {
  return getJson<CgCategory[]>(url('/coins/categories'));
}

export interface CgCoin {
  id: string;
  symbol: string;
  name: string;
  categories: string[];
  description: { en?: string; fr?: string };
  links: {
    homepage: string[];
    blockchain_site: string[];
    twitter_screen_name?: string;
    subreddit_url?: string;
    repos_url?: { github?: string[] };
  };
  image: { large?: string; small?: string; thumb?: string };
  genesis_date: string | null;
  market_cap_rank: number | null;
  platforms?: Record<string, string>;
  market_data: {
    current_price: Record<string, number>;
    market_cap: Record<string, number>;
    fully_diluted_valuation: Record<string, number>;
    total_volume: Record<string, number>;
    ath: Record<string, number>;
    ath_change_percentage: Record<string, number>;
    atl: Record<string, number>;
    price_change_percentage_24h: number | null;
    price_change_percentage_7d: number | null;
    price_change_percentage_30d: number | null;
    price_change_percentage_1y: number | null;
    circulating_supply: number | null;
    total_supply: number | null;
    max_supply: number | null;
  };
}

export function getCoin(id: string): Promise<CgCoin> {
  return getJson<CgCoin>(url(`/coins/${encodeURIComponent(id)}`, {
    localization: false,
    tickers: false,
    market_data: true,
    community_data: false,
    developer_data: false,
    sparkline: false,
  }));
}

export interface CgTicker {
  base: string;
  target: string;
  market: { name: string; identifier: string };
  converted_volume: { usd: number };
  cost_to_move_up_usd?: number | null;
  cost_to_move_down_usd?: number | null;
  is_anomaly?: boolean;
  is_stale?: boolean;
}

/** Paires d'une crypto (plus gros volumes d'abord) ; `depth` ajoute le coût pour déplacer le prix de 2 % dans le carnet. */
export async function getCoinTickers(id: string, opts: { exchangeId?: string; depth?: boolean } = {}): Promise<CgTicker[]> {
  const r = await getJson<{ tickers?: CgTicker[] }>(url(`/coins/${encodeURIComponent(id)}/tickers`, { exchange_ids: opts.exchangeId, depth: opts.depth, order: 'volume_desc' }));
  return r.tickers ?? [];
}

export interface CgDeveloper {
  commit_count_4_weeks: number | null;
  stars: number | null;
  forks: number | null;
}

/** Activité du code public (GitHub) de la crypto, quand CoinGecko la suit. */
export async function getCoinDeveloper(id: string): Promise<CgDeveloper | null> {
  const r = await getJson<{ developer_data?: CgDeveloper }>(url(`/coins/${encodeURIComponent(id)}`, {
    localization: false, tickers: false, market_data: false, community_data: false, developer_data: true, sparkline: false,
  }));
  return r.developer_data ?? null;
}

export interface CgChart {
  prices: [number, number][];
  total_volumes: [number, number][];
}

export function getMarketChart(id: string, days: number): Promise<CgChart> {
  return getJson<CgChart>(url(`/coins/${encodeURIComponent(id)}/market_chart`, { vs_currency: 'usd', days, interval: 'daily' }));
}

export interface CgSearchCoin {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number | null;
  thumb: string;
  large: string;
}

export async function searchCoins(q: string): Promise<CgSearchCoin[]> {
  const r = await getJson<{ coins: CgSearchCoin[] }>(url('/search', { query: q }));
  return r.coins.slice(0, 20);
}

export type SimplePrices = Record<string, { usd?: number; usd_24h_change?: number }>;

export async function getSimplePrices(ids: string[]): Promise<SimplePrices> {
  if (!ids.length) return {};
  const out: SimplePrices = {};
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    Object.assign(out, await getJson<SimplePrices>(url('/simple/price', { ids: chunk.join(','), vs_currencies: 'usd', include_24hr_change: true })));
  }
  return out;
}

/** Nombre d'euros pour 1 dollar. */
export async function getEurPerUsd(): Promise<number> {
  const r = await getJson<{ rates: Record<string, { value: number }> }>(url('/exchange_rates'));
  const eur = r.rates.eur?.value;
  const usd = r.rates.usd?.value;
  if (!eur || !usd) throw new Error('Taux de change indisponible');
  return eur / usd;
}
