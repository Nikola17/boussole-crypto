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

export interface ProjectPool {
  pool: string;
  project: string;
  symbol: string;
  chain: string;
  apy: number | null;
  tvlUsd: number | null;
}

/**
 * Top pools d'un projet DefiLlama (jupiter, orca, raydium, hyperliquid…) triés par TVL.
 * Renvoie null si la requête échoue : l'interface affiche alors « données indisponibles ».
 */
export async function getProjectTopPools(project: string, limit = 4): Promise<ProjectPool[] | null> {
  try {
    const r = await getJson<{ data?: Record<string, unknown>[] }>(
      `https://yields.llama.fi/poolsEnriched?project=${encodeURIComponent(project)}`,
      { timeoutMs: 20000, retries: 1 },
    );
    const list = Array.isArray(r.data) ? r.data : [];
    return list
      .map((p) => ({
        pool: String(p.pool ?? ''),
        project: String(p.project ?? project),
        symbol: String(p.symbol ?? ''),
        chain: String(p.chain ?? ''),
        apy: p.apy != null && Number.isFinite(Number(p.apy)) ? Number(p.apy) : null,
        tvlUsd: p.tvlUsd != null && Number.isFinite(Number(p.tvlUsd)) ? Number(p.tvlUsd) : null,
      }))
      .filter((p) => p.pool && p.symbol)
      .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))
      .slice(0, limit);
  } catch {
    return null;
  }
}
