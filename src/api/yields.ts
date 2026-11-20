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

/** Projets DEX suivis par défaut dans l'onglet Earn (Solana, Base, EVM & Hyperliquid). */
export const DEFI_PROJECTS: { slug: string; label: string; url: string }[] = [
  { slug: 'uniswap-v3', label: 'Uniswap V3 (EVM)', url: 'https://app.uniswap.org' },
  { slug: 'pancakeswap-amm-v3', label: 'PancakeSwap V3 (BNB / EVM)', url: 'https://pancakeswap.finance' },
  { slug: 'aerodrome-slipstream', label: 'Aerodrome (Base)', url: 'https://aerodrome.finance' },
  { slug: 'jupiter', label: 'Jupiter (Solana)', url: 'https://jup.ag' },
  { slug: 'orca-dex', label: 'Orca (Solana)', url: 'https://www.orca.so' },
  { slug: 'raydium-amm', label: 'Raydium (Solana)', url: 'https://raydium.io' },
  { slug: 'hyperliquid', label: 'Hyperliquid (HYPE)', url: 'https://app.hyperliquid.xyz' },
  { slug: 'curve-dex', label: 'Curve (EVM)', url: 'https://curve.fi' },
];

/** Catalogue étendu de DEX compatibles DefiLlama (sélectionnables à la demande dans l'onglet Earn). */
export const EXTRA_DEFI_PROJECTS: { slug: string; label: string; url: string }[] = [
  { slug: 'meteora-dlmm', label: 'Meteora (Solana)', url: 'https://app.meteora.ag' },
  { slug: 'gmx-v2-perps', label: 'GMX V2 (Arbitrum / Avax)', url: 'https://app.gmx.io' },
  { slug: 'balancer-v2', label: 'Balancer V2 (EVM)', url: 'https://app.balancer.fi' },
  { slug: 'sushiswap', label: 'SushiSwap (EVM)', url: 'https://www.sushi.com' },
  { slug: 'trader-joe-dex', label: 'LFJ / Trader Joe (Avax / Arb)', url: 'https://lfj.gg' },
  { slug: 'velodrome-v2', label: 'Velodrome (Optimism)', url: 'https://velodrome.finance' },
  { slug: 'fluid-dex', label: 'Fluid (EVM)', url: 'https://fluid.io' },
  { slug: 'drift', label: 'Drift (Solana)', url: 'https://app.drift.trade' },
  { slug: 'camelot-v3', label: 'Camelot (Arbitrum)', url: 'https://app.camelot.exchange' },
  { slug: 'quickswap-v3', label: 'QuickSwap (Polygon)', url: 'https://quickswap.exchange' },
  { slug: 'ekubo', label: 'Ekubo (Starknet / ETH)', url: 'https://app.ekubo.org' },
  { slug: 'ambient', label: 'Ambient (EVM)', url: 'https://ambient.finance' },
  { slug: 'maverick-v2', label: 'Maverick (EVM)', url: 'https://app.mav.xyz' },
  { slug: 'dodo', label: 'DODO (EVM)', url: 'https://app.dodoex.io' },
  { slug: 'cetus-amm', label: 'Cetus (Sui / Aptos)', url: 'https://app.cetus.zone' },
  { slug: 'bluefin-amm', label: 'Bluefin (Sui)', url: 'https://trade.bluefin.io' },
  { slug: 'thala-lsd', label: 'Thala (Aptos)', url: 'https://app.thala.fi' },
  { slug: 'ston.fi', label: 'STON.fi (TON)', url: 'https://app.ston.fi' },
  { slug: 'dedust', label: 'DeDust (TON)', url: 'https://dedust.io' },
  { slug: 'osmosis-dex', label: 'Osmosis (Cosmos)', url: 'https://app.osmosis.zone' },
  { slug: 'syncswap', label: 'SyncSwap (zkSync)', url: 'https://syncswap.xyz' },
  { slug: 'gains-network', label: 'Gains Network / gTrade', url: 'https://gains.trade' },
  { slug: 'synthetix', label: 'Synthetix (Optimism / Base)', url: 'https://www.synthetix.io' },
  { slug: 'woofi-earn', label: 'WOOFi (Multi-chain)', url: 'https://fi.woo.org' },
  { slug: 'shadow-exchange', label: 'Shadow (Sonic)', url: 'https://www.shadow.so' },
  { slug: 'bancor-v3', label: 'Bancor (Ethereum)', url: 'https://bancor.network' },
  { slug: 'spookyswap', label: 'SpookySwap (Sonic / Fantom)', url: 'https://spooky.fi' },
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
