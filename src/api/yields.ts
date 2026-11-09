// DefiLlama Yields : rendement d'un pool précis (une requête légère, ≈ 1 Ko) plutôt que la liste complète (≈ 11 Mo).

import { getJson } from './http';
import type { YieldQuote } from '../lib/staking';

export async function getPoolQuote(id: string): Promise<YieldQuote | null> {
  const r = await getJson<{ data?: { apy?: number | null; apyBase?: number | null; tvlUsd?: number | null }[] }>(
    `https://yields.llama.fi/poolsEnriched?pool=${encodeURIComponent(id)}`,
    { timeoutMs: 20000, retries: 1 },
  );
  const p = r.data?.[0];
  if (!p) return null;
  return { apy: p.apy ?? null, apyBase: p.apyBase ?? null, tvlUsd: p.tvlUsd ?? null };
}
