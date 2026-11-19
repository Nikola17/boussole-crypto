// Comparateur de rendements : fusionne les sources (Binance Simple Earn, pools DeFi) en une table triée,
// avec tier de risque et gain annuel estimé sur la ligne détenue. Fonction pure, testée.

import { riskTierOf, type RiskTier } from './riskTier';
import type { EnrichedPool } from '../api/yields';

export interface EarnProductLite {
  asset: string;
  apy: number | null;
}

export interface CompareRow {
  source: string;
  asset: string;
  apyPct: number | null;
  tvlUsd: number | null;
  risk: RiskTier;
  url?: string;
  /** Montant détenu pour cet actif (USD) — sert au gain estimé. */
  heldUsd: number;
  /** Gain annuel estimé en USD sur la ligne détenue. */
  gainYearUsd: number | null;
}

export function compareRows(
  binance: EarnProductLite[] | null,
  pools: { label: string; url?: string; list: EnrichedPool[] | null }[],
  heldByAsset: Record<string, number>,
): CompareRow[] {
  const rows: CompareRow[] = [];
  const held = (asset: string) => heldByAsset[asset.toUpperCase()] ?? 0;
  for (const p of binance ?? []) {
    // Simple Earn flexible : protocole Binance, TVL implicite énorme → tier 1 pour stablecoins, 2 sinon.
    const stable = ['USDC', 'USDT', 'BUSD', 'EUR', 'FDUSD', 'DAI'].includes(p.asset.toUpperCase());
    rows.push({
      source: 'Binance Simple Earn',
      asset: p.asset,
      apyPct: p.apy,
      tvlUsd: null,
      risk: stable ? 1 : 2,
      url: 'https://www.binance.com/fr/earn/simple-earn',
      heldUsd: held(p.asset),
      gainYearUsd: p.apy != null ? (held(p.asset) * p.apy) / 100 : null,
    });
  }
  for (const proj of pools) {
    for (const pool of proj.list ?? []) {
      const asset = pool.symbol.split('/')[0] || pool.symbol;
      const risk = riskTierOf({ tvlUsd: pool.tvlUsd, audited: pool.audited, stablecoin: pool.stablecoin, ilRisk: pool.ilRisk, singleExposure: pool.singleExposure });
      rows.push({
        source: proj.label,
        asset,
        apyPct: pool.apy,
        tvlUsd: pool.tvlUsd,
        risk,
        url: proj.url,
        heldUsd: held(asset),
        gainYearUsd: pool.apy != null ? (held(asset) * pool.apy) / 100 : null,
      });
    }
  }
  return rows
    .filter((r) => r.apyPct != null)
    .sort((a, b) => (b.apyPct ?? 0) - (a.apyPct ?? 0));
}
