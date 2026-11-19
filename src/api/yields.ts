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

/** Projets DEX suivis dans l'onglet Earn (Solana + Hyperliquid). */
export const DEFI_PROJECTS: { slug: string; label: string; url: string }[] = [
  { slug: 'jupiter', label: 'Jupiter (Solana)', url: 'https://jup.ag' },
  { slug: 'orca', label: 'Orca (Solana)', url: 'https://www.orca.so' },
  { slug: 'raydium', label: 'Raydium (Solana)', url: 'https://raydium.io' },
  { slug: 'hyperliquid', label: 'Hyperliquid (HYPE)', url: 'https://app.hyperliquid.xyz' },
];

// ---------------------------------------------------------------- comparateur

/** Projets de lending/lido suivis pour le comparateur de rendements (DefiLlama). */
export const LENDING_PROJECTS: { slug: string; label: string; url: string }[] = [
  { slug: 'aave-v3', label: 'Aave V3', url: 'https://app.aave.com' },
  { slug: 'lido', label: 'Lido (stETH)', url: 'https://lido.fi' },
  { slug: 'spark', label: 'Spark', url: 'https://spark.fi' },
  { slug: 'morpho-blue', label: 'Morpho Blue', url: 'https://morpho.org' },
  { slug: 'compound-v3', label: 'Compound V3', url: 'https://compound.finance' },
  { slug: 'benqi', label: 'Benqi', url: 'https://www.benqi.fi' },
];

export interface EnrichedPool {
  pool: string;
  project: string;
  symbol: string;
  chain: string;
  apy: number | null;
  tvlUsd: number | null;
  audited: boolean;
  stablecoin: boolean;
  ilRisk: boolean;
  singleExposure: boolean;
}

/** Top pools d'un projet, enrichis des métadonnées de risque (audit, stablecoin, IL, exposition). */
export async function getProjectPoolsEnriched(project: string, limit = 5): Promise<EnrichedPool[] | null> {
  try {
    const r = await getJson<{ data?: Record<string, unknown>[] }>(
      `https://yields.llama.fi/poolsEnriched?project=${encodeURIComponent(project)}`,
      { timeoutMs: 20000, retries: 1 },
    );
    const list = Array.isArray(r.data) ? r.data : [];
    return list
      .map((p) => {
        const audit = p.audit;
        return {
          pool: String(p.pool ?? ''),
          project: String(p.project ?? project),
          symbol: String(p.symbol ?? ''),
          chain: String(p.chain ?? ''),
          apy: p.apy != null && Number.isFinite(Number(p.apy)) ? Number(p.apy) : null,
          tvlUsd: p.tvlUsd != null && Number.isFinite(Number(p.tvlUsd)) ? Number(p.tvlUsd) : null,
          audited: Array.isArray(audit) && audit.length > 0 && !audit.map(String).includes('No'),
          stablecoin: p.stablecoin === true,
          ilRisk: p.ilRisk === true || p.il7d != null,
          singleExposure: p.exposure === 'single',
        };
      })
      .filter((p) => p.pool && p.symbol)
      .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))
      .slice(0, limit);
  } catch {
    return null;
  }
}
