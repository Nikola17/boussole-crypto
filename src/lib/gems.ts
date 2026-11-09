// Détection de « pépites » : trois univers, trois grilles de lecture.
//  1. Petites capitalisations cotées (CoinGecko)
//  2. Protocoles DeFi sous-évalués par rapport à leur usage (DefiLlama)
//  3. Nouveaux tokens on-chain (DEX : GeckoTerminal / DexScreener) — très spéculatif

import { clamp } from './format';
import { piecewise } from './cycle';
import { isGold, isStable, isWrappedOrStaked } from './portfolio';

export interface GemFlag {
  label: string;
  tone: 'good' | 'warn' | 'bad';
}

export interface GemScore {
  score: number; // 0-100
  flags: GemFlag[];
}

// ------------------------------------------------------------ 1. Small caps

export interface SmallCapInput {
  id: string;
  symbol: string;
  name: string;
  marketCap: number;
  fdv: number | null;
  volume24h: number;
  change7d: number | null;
  change30d: number | null;
  athChangePct: number | null;
  rank: number | null;
  trending?: boolean;
}

export interface SmallCapFilter {
  minCap: number;
  maxCap: number;
  minVolume: number;
}

export const DEFAULT_SMALLCAP_FILTER: SmallCapFilter = { minCap: 5e6, maxCap: 500e6, minVolume: 300e3 };

export function isSmallCapCandidate(c: SmallCapInput, f: SmallCapFilter): boolean {
  if (!(c.marketCap >= f.minCap && c.marketCap <= f.maxCap)) return false;
  if (!(c.volume24h >= f.minVolume)) return false;
  if (isStable(c.symbol, c.id) || isWrappedOrStaked(c.symbol, c.name, c.id) || isGold(c.symbol)) return false;
  if (looksLikeNonGem(c.name, c.symbol)) return false;
  // Trop stable pour être une pépite (stablecoins exotiques, tokens adossés à un actif)
  if (c.change7d != null && c.change30d != null && Math.abs(c.change7d) < 1.5 && Math.abs(c.change30d) < 3) return false;
  if (c.change30d != null && c.change30d < -40) return false;
  return true;
}

/** Noms typiques de stablecoins, actions tokenisées et actifs adossés (pas des pépites crypto). */
export function looksLikeNonGem(name: string, symbol: string): boolean {
  return /\busd\b|dollar|\beur\b|euro|coinvertible|tokenized|xstock|\(ondo|backed |\bcorporation\b|\binc\.?$|\bstock\b|treasury|\bgold\b/i.test(name)
    || /^(usd|eur)/i.test(symbol);
}

export function scoreSmallCap(c: SmallCapInput): GemScore {
  const flags: GemFlag[] = [];
  const volRatio = c.marketCap > 0 ? c.volume24h / c.marketCap : 0;
  // Attention / liquidité : un volume élevé par rapport à la capi = intérêt réel
  let sVol = piecewise(volRatio, [[0.02, 0], [0.08, 40], [0.2, 80], [0.4, 100]]);
  if (volRatio > 1.5) { sVol = 40; flags.push({ label: 'Volume anormal (possible wash trading)', tone: 'warn' }); }
  else if (volRatio >= 0.2) flags.push({ label: 'Forte activité', tone: 'good' });

  // Momentum sain : positif sans être parabolique
  const c7 = c.change7d ?? 0;
  const c30 = c.change30d ?? 0;
  let sMom = piecewise(c30, [[-30, 0], [0, 35], [25, 75], [80, 100], [200, 70], [400, 30]]) * 0.6
    + piecewise(c7, [[-15, 0], [0, 40], [15, 85], [40, 100], [100, 50]]) * 0.4;
  if (c30 > 200 || c7 > 80) flags.push({ label: 'Déjà fortement monté — risque FOMO', tone: 'warn' });
  else if (c30 > 15 && c7 > 0) flags.push({ label: 'Momentum sain', tone: 'good' });
  sMom = clamp(sMom, 0, 100);

  // Dilution : FDV / capitalisation
  let sDil = 60;
  if (c.fdv && c.marketCap > 0) {
    const r = c.fdv / c.marketCap;
    sDil = piecewise(r, [[1, 100], [1.5, 80], [2, 55], [3, 25], [5, 0]]);
    if (r <= 1.3) flags.push({ label: 'Faible dilution future', tone: 'good' });
    else if (r >= 3) flags.push({ label: `FDV ${r.toFixed(1).replace('.', ',')}× la capi : gros déblocages à venir`, tone: 'bad' });
  }

  // Taille : sweet spot 10-150 M$ (potentiel de multiplication, déjà une liquidité)
  const sSize = piecewise(c.marketCap, [[5e6, 60], [15e6, 90], [60e6, 100], [150e6, 85], [500e6, 50]]);

  // Décote vs ATH avec reprise
  let sAth = 50;
  if (c.athChangePct != null) {
    if (c.athChangePct < -90) { sAth = 25; flags.push({ label: 'À plus de -90 % de son ATH', tone: 'warn' }); }
    else if (c.athChangePct < -60 && c30 > 0) { sAth = 75; flags.push({ label: 'Rebond depuis une forte décote', tone: 'good' }); }
    else if (c.athChangePct > -10) { sAth = 70; flags.push({ label: 'Proche de ses plus hauts (découverte de prix)', tone: 'good' }); }
  }

  let score = sVol * 0.25 + sMom * 0.3 + sDil * 0.25 + sSize * 0.1 + sAth * 0.1;
  if (c.trending) { score += 6; flags.push({ label: 'Tendance sur CoinGecko', tone: 'good' }); }
  return { score: Math.round(clamp(score, 0, 100)), flags };
}

// ------------------------------------------------------------ 2. DeFi sous-évaluée

export interface DefiInput {
  name: string;
  symbol: string;
  category: string;
  tvl: number;
  mcap: number;
  change7d: number | null;
  change1d: number | null;
  fees30d: number | null;
  revenue30d?: number | null;
  chains: string[];
}

export interface DefiScore extends GemScore {
  mcapTvl: number;
  /** Capitalisation / revenus annualisés du protocole (à défaut : / frais) */
  ps: number | null;
  psBasis: 'revenus' | 'frais' | null;
}

/** Catégories où la TVL ne mesure pas la valeur du token (dépôts d'utilisateurs, actifs réels, ponts…). */
const DEFI_EXCLUDED = new Set([
  'CEX', 'Chain', 'Liquid Staking', 'Liquid Restaking', 'Restaking', 'Restaked BTC', 'RWA', 'Real World Assets',
  'Onchain Capital Allocator', 'Risk Curators', 'Bridge', 'Canonical Bridge', 'Staking Pool', 'Privacy',
  'Stablecoin Wrapper', 'Treasury Manager', 'Basis Trading', 'Anchor BTC', 'Bitcoin Sidechains',
]);

export function isDefiCandidate(category: string): boolean {
  return !DEFI_EXCLUDED.has(category);
}

export function scoreDefi(p: DefiInput): DefiScore {
  const flags: GemFlag[] = [];
  const mcapTvl = p.tvl > 0 ? p.mcap / p.tvl : Infinity;
  const sVal = piecewise(mcapTvl, [[0.1, 100], [0.3, 85], [0.6, 65], [1, 45], [2, 20], [4, 0]]);
  if (mcapTvl < 0.3) flags.push({ label: `Capi = ${Math.round(mcapTvl * 100)} % de la TVL`, tone: 'good' });
  else if (mcapTvl > 2) flags.push({ label: 'Capi élevée vs TVL', tone: 'warn' });

  const c7 = p.change7d ?? 0;
  const sGrowth = piecewise(c7, [[-20, 0], [0, 40], [10, 75], [30, 100], [100, 80]]);
  if (c7 > 10) flags.push({ label: `TVL ${c7 > 0 ? '+' : ''}${Math.round(c7)} % sur 7 j`, tone: 'good' });
  else if (c7 < -15) flags.push({ label: 'TVL en fuite', tone: 'bad' });

  // Les revenus (ce que garde le protocole) comptent plus que les frais bruts payés par les utilisateurs.
  let ps: number | null = null;
  let psBasis: DefiScore['psBasis'] = null;
  let sRev = 30;
  if (p.revenue30d && p.revenue30d > 0) {
    ps = p.mcap / (p.revenue30d * 12);
    psBasis = 'revenus';
    sRev = piecewise(ps, [[3, 100], [8, 85], [15, 65], [30, 40], [80, 15], [200, 0]]);
    if (ps < 15) flags.push({ label: `Capi = ${ps.toFixed(1).replace('.', ',')} ans de revenus`, tone: 'good' });
  } else if (p.fees30d && p.fees30d > 0) {
    ps = p.mcap / (p.fees30d * 12);
    psBasis = 'frais';
    sRev = Math.min(70, piecewise(ps, [[2, 100], [5, 85], [10, 65], [25, 40], [60, 15], [150, 0]]));
    flags.push({ label: 'Revenus inconnus (calcul sur les frais)', tone: 'warn' });
  } else flags.push({ label: 'Pas de données de revenus', tone: 'warn' });

  if (p.tvl < 10e6) flags.push({ label: 'TVL modeste', tone: 'warn' });
  const score = sVal * 0.3 + sGrowth * 0.25 + sRev * 0.45;
  return { score: Math.round(clamp(score, 0, 100)), flags, mcapTvl, ps, psBasis };
}

// ------------------------------------------------------------ 3. On-chain (DEX)

export interface PoolInput {
  ageHours: number;
  liquidityUsd: number;
  volume24h: number;
  fdvUsd: number | null;
  change1h: number | null;
  change24h: number | null;
  buys24h: number;
  sells24h: number;
  buyers24h: number | null;
  sellers24h: number | null;
}

export interface PoolFilter {
  minLiquidity: number;
  minVolume: number;
  minAgeHours: number;
  maxAgeDays: number;
}

export const DEFAULT_POOL_FILTER: PoolFilter = { minLiquidity: 40_000, minVolume: 60_000, minAgeHours: 12, maxAgeDays: 45 };

export interface PoolScore extends GemScore {
  risk: number; // 0-100 (100 = très risqué)
}

export function scorePool(p: PoolInput): PoolScore {
  const flags: GemFlag[] = [];
  const vl = p.liquidityUsd > 0 ? p.volume24h / p.liquidityUsd : 0;
  let sAct = piecewise(vl, [[0.2, 10], [0.8, 60], [2, 100], [6, 80], [15, 30]]);
  if (vl > 12) { flags.push({ label: 'Volume/liquidité extrême (bots ?)', tone: 'warn' }); sAct = Math.min(sAct, 30); }

  const uniqBuyers = p.buyers24h ?? 0;
  const uniqSellers = p.sellers24h ?? 0;
  const ratio = uniqSellers > 0 ? uniqBuyers / uniqSellers : uniqBuyers > 0 ? 3 : 1;
  const sDemand = piecewise(ratio, [[0.6, 0], [1, 45], [1.3, 75], [2, 100], [5, 70]]);
  if (ratio >= 1.3) flags.push({ label: `${uniqBuyers} acheteurs uniques vs ${uniqSellers} vendeurs`, tone: 'good' });
  if (ratio < 0.8) flags.push({ label: 'Plus de vendeurs que d’acheteurs', tone: 'bad' });

  const c24 = p.change24h ?? 0;
  const sMom = piecewise(c24, [[-40, 0], [0, 40], [30, 85], [100, 100], [400, 40], [1000, 10]]);
  if (c24 > 300) flags.push({ label: `+${Math.round(c24)} % en 24 h : extrêmement risqué`, tone: 'bad' });

  const sLiq = piecewise(p.liquidityUsd, [[20e3, 10], [60e3, 50], [200e3, 85], [1e6, 100]]);
  const days = p.ageHours / 24;
  const sAge = piecewise(days, [[0.5, 20], [2, 70], [7, 100], [30, 75], [90, 50]]);

  // Risque
  let risk = 0;
  risk += piecewise(p.liquidityUsd, [[20e3, 40], [100e3, 20], [500e3, 8], [2e6, 0]]);
  risk += piecewise(days, [[0.5, 30], [3, 18], [14, 8], [60, 2]]);
  if (p.fdvUsd && p.liquidityUsd > 0) {
    const fl = p.fdvUsd / p.liquidityUsd;
    risk += piecewise(fl, [[5, 0], [20, 8], [60, 18], [200, 25]]);
    if (fl > 60) flags.push({ label: 'Liquidité très faible vs valorisation', tone: 'bad' });
  }
  if (c24 > 200) risk += 10;
  if (days < 2) flags.push({ label: 'Token très récent', tone: 'warn' });

  const score = sAct * 0.25 + sDemand * 0.3 + sMom * 0.2 + sLiq * 0.15 + sAge * 0.1;
  return { score: Math.round(clamp(score, 0, 100)), flags, risk: Math.round(clamp(risk, 0, 100)) };
}

// ------------------------------------------------------------ Radar airdrops

export interface AirdropCandidateInput {
  name: string;
  category: string;
  tvl: number;
  change7d: number | null;
  chains: string[];
  listedAt?: number | null;
}

const EXCLUDED_CATEGORIES = new Set([
  'CEX', 'Chain', 'Canonical Bridge', 'Risk Curators', 'RWA', 'Treasury Manager', 'Onchain Capital Allocator',
  'Liquid Staking', 'Staking Pool', 'Bridge', 'Basis Trading', 'Restaked BTC', 'Developer Tools', 'Wallets',
  'Coins Tracker', 'Ponzi', 'Gaming', 'NFT Marketplace', 'Telegram Bot', 'Interface', 'Portfolio Tracker',
  'Privacy', 'Charity Fundraising', 'Payments', 'Real World Assets', 'Anchor BTC', 'Bitcoin Sidechains', 'Synthetics',
  'Stablecoin Wrapper', 'Governance Incentives', 'Liquid Restaking', 'Restaking',
]);
const EXCLUDED_NAME = /^usd|binance|coinbase|kraken|okx|bybit|bitget|bitfinex|gate\.?io|kucoin|htx|mexc|robinhood|wbtc|usdt|tether|circle|blackrock|franklin|ondo|fidelity|securitize|grayscale|\bbridge\b|treasury|curator|gauntlet|steakhouse|sentora/i;

export function isAirdropCandidate(p: AirdropCandidateInput, minTvl = 15e6): boolean {
  if (p.tvl < minTvl) return false;
  if (EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (EXCLUDED_NAME.test(p.name)) return false;
  return true;
}

export function scoreAirdrop(p: AirdropCandidateInput): GemScore {
  const flags: GemFlag[] = [];
  const sTvl = piecewise(Math.log10(Math.max(p.tvl, 1)), [[7, 20], [8, 60], [9, 90], [9.7, 100]]);
  const c7 = p.change7d ?? 0;
  const sGrowth = piecewise(c7, [[-15, 10], [0, 45], [10, 80], [30, 100]]);
  const ageDays = p.listedAt ? (Date.now() / 1000 - p.listedAt) / 86400 : 365;
  const sAge = piecewise(ageDays, [[30, 100], [180, 85], [400, 60], [900, 30]]);
  const sChains = piecewise(p.chains.length, [[1, 50], [3, 75], [6, 100]]);
  if (c7 > 10) flags.push({ label: `TVL +${Math.round(c7)} % sur 7 j`, tone: 'good' });
  if (ageDays < 200) flags.push({ label: 'Protocole récent', tone: 'good' });
  if (p.tvl > 500e6) flags.push({ label: 'TVL massive : airdrop probablement attendu', tone: 'good' });
  const score = sTvl * 0.35 + sGrowth * 0.25 + sAge * 0.25 + sChains * 0.15;
  return { score: Math.round(clamp(score, 0, 100)), flags };
}
