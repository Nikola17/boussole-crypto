// Tokens on-chain : pools tendance et nouveaux pools (GeckoTerminal), prix temps réel (DexScreener).

import { getJson } from './http';

export interface NetworkInfo {
  key: string; // id GeckoTerminal
  label: string;
  dexscreener: string;
  goplusChainId: string | null; // null = Solana (endpoint dédié)
}

export const NETWORKS: NetworkInfo[] = [
  { key: 'solana', label: 'Solana', dexscreener: 'solana', goplusChainId: null },
  { key: 'base', label: 'Base', dexscreener: 'base', goplusChainId: '8453' },
  { key: 'eth', label: 'Ethereum', dexscreener: 'ethereum', goplusChainId: '1' },
  { key: 'bsc', label: 'BNB Chain', dexscreener: 'bsc', goplusChainId: '56' },
  { key: 'arbitrum', label: 'Arbitrum', dexscreener: 'arbitrum', goplusChainId: '42161' },
];

export function networkByKey(key: string): NetworkInfo | undefined {
  return NETWORKS.find((n) => n.key === key || n.dexscreener === key);
}

export interface DexPool {
  id: string;
  network: string;
  poolAddress: string;
  dex: string;
  name: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenImage?: string;
  coingeckoId?: string | null;
  priceUsd: number;
  fdvUsd: number | null;
  mcapUsd: number | null;
  liquidityUsd: number;
  volume24h: number;
  change1h: number | null;
  change6h: number | null;
  change24h: number | null;
  buys24h: number;
  sells24h: number;
  buyers24h: number | null;
  sellers24h: number | null;
  createdAt: string;
  ageHours: number;
  source: 'trending' | 'new';
}

interface GtTxn { buys?: number; sells?: number; buyers?: number; sellers?: number }
interface GtPool {
  id: string;
  attributes: {
    address: string;
    name: string;
    pool_created_at: string;
    base_token_price_usd: string | null;
    fdv_usd: string | null;
    market_cap_usd: string | null;
    reserve_in_usd: string | null;
    price_change_percentage?: Record<string, string | null>;
    transactions?: Record<string, GtTxn>;
    volume_usd?: Record<string, string | null>;
  };
  relationships?: {
    base_token?: { data?: { id: string } };
    network?: { data?: { id: string } };
    dex?: { data?: { id: string } };
  };
}
interface GtToken {
  id: string;
  attributes: { address: string; name: string; symbol: string; image_url?: string | null; coingecko_coin_id?: string | null };
}

const MAJORS = new Set(['SOL', 'WSOL', 'WETH', 'ETH', 'USDC', 'USDT', 'WBNB', 'BNB', 'DAI', 'CBBTC', 'WBTC', 'USDS', 'USDE', 'FDUSD', 'USD1']);

const n = (v: string | number | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

function parsePools(json: { data: GtPool[]; included?: GtToken[] }, source: 'trending' | 'new'): DexPool[] {
  const tokens = new Map<string, GtToken>();
  for (const t of json.included ?? []) tokens.set(t.id, t);
  const out: DexPool[] = [];
  for (const p of json.data) {
    const a = p.attributes;
    const baseId = p.relationships?.base_token?.data?.id ?? '';
    const tok = tokens.get(baseId);
    const network = p.relationships?.network?.data?.id ?? baseId.split('_')[0];
    const symbol = tok?.attributes.symbol ?? a.name.split(' / ')[0];
    if (MAJORS.has(symbol.toUpperCase())) continue;
    const h24 = a.transactions?.h24 ?? {};
    const created = a.pool_created_at;
    out.push({
      id: p.id,
      network,
      poolAddress: a.address,
      dex: p.relationships?.dex?.data?.id ?? '',
      name: a.name,
      tokenAddress: tok?.attributes.address ?? baseId.slice(network.length + 1),
      tokenSymbol: symbol,
      tokenName: tok?.attributes.name ?? symbol,
      tokenImage: tok?.attributes.image_url && tok.attributes.image_url !== 'missing.png' ? tok.attributes.image_url : undefined,
      coingeckoId: tok?.attributes.coingecko_coin_id ?? null,
      priceUsd: n(a.base_token_price_usd) ?? 0,
      fdvUsd: n(a.fdv_usd),
      mcapUsd: n(a.market_cap_usd),
      liquidityUsd: n(a.reserve_in_usd) ?? 0,
      volume24h: n(a.volume_usd?.h24) ?? 0,
      change1h: n(a.price_change_percentage?.h1),
      change6h: n(a.price_change_percentage?.h6),
      change24h: n(a.price_change_percentage?.h24),
      buys24h: h24.buys ?? 0,
      sells24h: h24.sells ?? 0,
      buyers24h: h24.buyers ?? null,
      sellers24h: h24.sellers ?? null,
      createdAt: created,
      ageHours: created ? (Date.now() - new Date(created).getTime()) / 3600000 : NaN,
      source,
    });
  }
  return out;
}

const GT = 'https://api.geckoterminal.com/api/v2';

export async function getTrendingPools(network: string, page = 1): Promise<DexPool[]> {
  const json = await getJson<{ data: GtPool[]; included?: GtToken[] }>(`${GT}/networks/${network}/trending_pools?include=base_token&page=${page}&duration=24h`);
  return parsePools(json, 'trending');
}

export async function getNewPools(network: string, page = 1): Promise<DexPool[]> {
  const json = await getJson<{ data: GtPool[]; included?: GtToken[] }>(`${GT}/networks/${network}/new_pools?include=base_token&page=${page}`);
  return parsePools(json, 'new');
}

export interface DexPair {
  chainId: string;
  pairAddress: string;
  url: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h1?: number; h6?: number; h24?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string; websites?: { url: string }[]; socials?: { type: string; url: string }[] };
}

/** Meilleure paire (la plus liquide) pour chaque token. Jusqu'à 30 adresses par appel. */
export async function getTokenPairs(dexChain: string, addresses: string[]): Promise<Map<string, DexPair>> {
  const map = new Map<string, DexPair>();
  for (let i = 0; i < addresses.length; i += 30) {
    const chunk = addresses.slice(i, i + 30);
    const pairs = await getJson<DexPair[]>(`https://api.dexscreener.com/tokens/v1/${dexChain}/${chunk.join(',')}`);
    for (const p of pairs) {
      const key = p.baseToken.address.toLowerCase();
      const cur = map.get(key);
      if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) map.set(key, p);
    }
  }
  return map;
}

export function poolLinks(p: { network: string; poolAddress: string }): { dexscreener: string; geckoterminal: string } {
  const net = networkByKey(p.network);
  return {
    dexscreener: `https://dexscreener.com/${net?.dexscreener ?? p.network}/${p.poolAddress}`,
    geckoterminal: `https://www.geckoterminal.com/${p.network}/pools/${p.poolAddress}`,
  };
}
