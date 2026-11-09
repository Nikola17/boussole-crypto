// DefiLlama — TVL, frais générés et offre de stablecoins (gratuit, sans clé).

import { getJson } from './http';

export interface LlamaProtocol {
  id: string;
  name: string;
  slug: string;
  symbol: string | null;
  category: string;
  chains: string[];
  tvl: number | null;
  change_1d: number | null;
  change_7d: number | null;
  mcap: number | null;
  gecko_id: string | null;
  url?: string;
  logo?: string;
  twitter?: string | null;
  listedAt?: number | null;
  parentProtocol?: string;
  description?: string;
}

export async function getProtocols(): Promise<LlamaProtocol[]> {
  const raw = await getJson<LlamaProtocol[]>('https://api.llama.fi/protocols', { timeoutMs: 60000 });
  // On ne garde que les champs utiles (la réponse brute fait ~10 Mo).
  return raw.map((p) => ({
    id: String(p.id),
    name: p.name,
    slug: p.slug,
    symbol: p.symbol,
    category: p.category,
    chains: p.chains ?? [],
    tvl: p.tvl,
    change_1d: p.change_1d,
    change_7d: p.change_7d,
    mcap: p.mcap,
    gecko_id: p.gecko_id,
    url: p.url,
    logo: p.logo,
    twitter: p.twitter,
    listedAt: p.listedAt,
    parentProtocol: p.parentProtocol,
    description: p.description?.slice(0, 280),
  }));
}

export interface LlamaFees {
  defillamaId: string;
  name: string;
  slug?: string;
  total24h: number | null;
  total7d: number | null;
  total30d: number | null;
  change_1m?: number | null;
}

/** Frais payés par les utilisateurs (`dailyFees`) ou revenus conservés par le protocole (`dailyRevenue`). */
export async function getFees(dataType: 'dailyFees' | 'dailyRevenue' = 'dailyFees'): Promise<Map<string, LlamaFees>> {
  const raw = await getJson<{ protocols: LlamaFees[] }>(
    `https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=${dataType}`,
    { timeoutMs: 60000 },
  );
  const map = new Map<string, LlamaFees>();
  for (const p of raw.protocols) {
    if (p.defillamaId) map.set(String(p.defillamaId), p);
  }
  return map;
}

/** Variation de l'offre totale de stablecoins sur 30 jours (liquidité qui entre ou sort de la crypto). */
export async function getStablecoinChange30d(): Promise<{ total: number; change30dPct: number } | null> {
  const raw = await getJson<{ date: string; totalCirculatingUSD: { peggedUSD?: number } }[]>(
    'https://stablecoins.llama.fi/stablecoincharts/all',
    { timeoutMs: 30000 },
  );
  if (raw.length < 31) return null;
  const last = raw[raw.length - 1].totalCirculatingUSD.peggedUSD ?? 0;
  const prev = raw[raw.length - 31].totalCirculatingUSD.peggedUSD ?? 0;
  if (!last || !prev) return null;
  return { total: last, change30dPct: (last / prev - 1) * 100 };
}
