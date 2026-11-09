// Calcul des positions (méthode du coût moyen pondéré), de la répartition et des risques.

import type { Bucket, Transaction } from '../types';

export interface Position {
  coinId: string;
  symbol: string;
  name: string;
  image?: string;
  quantity: number;
  costEur: number;
  costUsd: number;
  realizedEur: number;
  realizedUsd: number;
  txCount: number;
}

/** Convertit un montant saisi dans la devise de la transaction en EUR et en USD (au taux du jour de saisie). */
export function txAmounts(tx: Transaction, amount: number): { eur: number; usd: number } {
  const fx = tx.fxEurPerUsd > 0 ? tx.fxEurPerUsd : 0.9;
  if (tx.currency === 'EUR') return { eur: amount, usd: amount / fx };
  return { eur: amount * fx, usd: amount };
}

/** Ordre chronologique ; l'horodatage précis (import) départage les opérations d'un même jour. */
export function sortTx(txs: Transaction[]): Transaction[] {
  const key = (t: Transaction) => t.time ?? t.date;
  return [...txs].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka === kb ? 0 : ka < kb ? -1 : 1;
  });
}

export function buildPositions(txs: Transaction[]): Map<string, Position> {
  const map = new Map<string, Position>();
  for (const tx of sortTx(txs)) {
    let p = map.get(tx.coinId);
    if (!p) {
      p = { coinId: tx.coinId, symbol: tx.symbol, name: tx.name, image: tx.image, quantity: 0, costEur: 0, costUsd: 0, realizedEur: 0, realizedUsd: 0, txCount: 0 };
      map.set(tx.coinId, p);
    }
    p.txCount++;
    if (tx.image && !p.image) p.image = tx.image;
    const gross = txAmounts(tx, tx.quantity * tx.price);
    const fee = txAmounts(tx, tx.fee || 0);
    switch (tx.type) {
      case 'buy':
      case 'deposit': {
        p.quantity += tx.quantity;
        p.costEur += gross.eur + fee.eur;
        p.costUsd += gross.usd + fee.usd;
        break;
      }
      case 'reward': {
        p.quantity += tx.quantity;
        p.costEur += fee.eur;
        p.costUsd += fee.usd;
        break;
      }
      case 'transfer':
        // Déplacement entre deux de tes comptes : la quantité et le coût d'acquisition ne changent pas.
        break;
      case 'sell':
      case 'withdraw': {
        if (p.quantity <= 0) break;
        const q = Math.min(tx.quantity, p.quantity);
        const ratio = q / p.quantity;
        const removedEur = p.costEur * ratio;
        const removedUsd = p.costUsd * ratio;
        if (tx.type === 'sell') {
          const proceeds = txAmounts(tx, q * tx.price);
          p.realizedEur += proceeds.eur - fee.eur - removedEur;
          p.realizedUsd += proceeds.usd - fee.usd - removedUsd;
        }
        p.quantity -= q;
        p.costEur -= removedEur;
        p.costUsd -= removedUsd;
        if (p.quantity < 1e-12) { p.quantity = 0; p.costEur = 0; p.costUsd = 0; }
        break;
      }
    }
  }
  return map;
}

const STABLES = new Set([
  'usdt', 'usdc', 'dai', 'fdusd', 'tusd', 'usde', 'usds', 'pyusd', 'usdd', 'frax', 'lusd', 'gusd', 'usdp',
  'eurc', 'eurs', 'rlusd', 'usd1', 'busd', 'usdb', 'usdy', 'usdtb', 'gho', 'crvusd', 'dola', 'eure', 'susde', 'usdg', 'usdf',
]);
const STABLE_IDS = new Set(['tether', 'usd-coin', 'dai', 'first-digital-usd', 'ethena-usde', 'usds', 'paypal-usd', 'euro-coin', 'ripple-usd', 'true-usd', 'frax', 'usd1-wlfi']);

export function isStable(symbol: string, coinId?: string): boolean {
  return STABLES.has(symbol.toLowerCase()) || (coinId ? STABLE_IDS.has(coinId) : false);
}

const WRAPPED = new Set([
  'wbtc', 'weth', 'steth', 'wsteth', 'reth', 'cbeth', 'cbbtc', 'tbtc', 'weeth', 'ezeth', 'rseth', 'meth', 'wbeth', 'bnsol',
  'jitosol', 'msol', 'jupsol', 'bsol', 'lbtc', 'solvbtc', 'wbnb', 'wsol', 'wavax', 'wmatic', 'btcb', 'sweth', 'oseth', 'stkaave',
  'wtrx', 'wht', 'wftm', 'lseth', 'pufeth', 'rsweth', 'ethx', 'sfrxeth', 'frxeth', 'clbtc', 'enzobtc', 'unibtc', 'xsolvbtc',
]);

export function isWrappedOrStaked(symbol: string, name = '', coinId = ''): boolean {
  if (WRAPPED.has(symbol.toLowerCase())) return true;
  const s = `${name} ${coinId}`.toLowerCase();
  return /\bwrapped\b|\bbridged\b|\bstaked\b|restaked|liquid staking|\bwormhole\b|binance-peg|\bpeg\b/.test(s);
}

export function isGold(symbol: string): boolean {
  return ['paxg', 'xaut', 'kau', 'xaum'].includes(symbol.toLowerCase());
}

/** Range une crypto dans une « poche » de risque selon son rang de capitalisation. */
export function bucketOf(coinId: string, symbol: string, rank: number | null | undefined): Bucket {
  if (coinId === 'bitcoin' || symbol.toLowerCase() === 'btc' || coinId === 'wrapped-bitcoin' || coinId === 'coinbase-wrapped-btc') return 'btc';
  if (coinId === 'ethereum' || symbol.toLowerCase() === 'eth' || coinId === 'weth' || coinId === 'staked-ether') return 'eth';
  if (isStable(symbol, coinId)) return 'stable';
  if (rank != null && rank > 0 && rank <= 20) return 'large';
  if (rank != null && rank > 0 && rank <= 100) return 'mid';
  return 'small';
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  btc: 'Bitcoin',
  eth: 'Ethereum',
  large: 'Grandes capis (top 20)',
  mid: 'Moyennes capis (21-100)',
  small: 'Petites capis & pépites',
  stable: 'Stablecoins',
};

export const BUCKET_ORDER: Bucket[] = ['btc', 'eth', 'large', 'mid', 'small', 'stable'];

/** Bêta approximatif par poche vs Bitcoin (historique des cycles) pour le stress test. */
export const BUCKET_BETA: Record<Bucket, number> = { btc: 1, eth: 1.25, large: 1.4, mid: 1.7, small: 2.1, stable: 0 };

export interface HoldingValue {
  coinId: string;
  symbol: string;
  bucket: Bucket;
  value: number; // devise d'affichage
}

export function allocation(holdings: HoldingValue[]): Record<Bucket, number> {
  const out: Record<Bucket, number> = { btc: 0, eth: 0, large: 0, mid: 0, small: 0, stable: 0 };
  for (const h of holdings) out[h.bucket] += Math.max(0, h.value);
  return out;
}

export function stressTest(alloc: Record<Bucket, number>, btcMovePct: number): { newTotal: number; changePct: number } {
  const total = Object.values(alloc).reduce((s, v) => s + v, 0);
  let newTotal = 0;
  for (const b of BUCKET_ORDER) {
    const move = Math.max(-100, btcMovePct * BUCKET_BETA[b]);
    newTotal += alloc[b] * (1 + move / 100);
  }
  return { newTotal, changePct: total > 0 ? (newTotal / total - 1) * 100 : 0 };
}

export interface RebalanceLine {
  bucket: Bucket;
  currentPct: number;
  targetPct: number;
  diffValue: number; // + à acheter, - à vendre
}

export function rebalance(alloc: Record<Bucket, number>, target: Record<Bucket, number>): RebalanceLine[] {
  const total = Object.values(alloc).reduce((s, v) => s + v, 0);
  const tsum = Object.values(target).reduce((s, v) => s + v, 0) || 100;
  return BUCKET_ORDER.map((b) => {
    const currentPct = total > 0 ? (alloc[b] / total) * 100 : 0;
    const targetPct = (target[b] / tsum) * 100;
    return { bucket: b, currentPct, targetPct, diffValue: (targetPct / 100) * total - alloc[b] };
  });
}

/** Indice de concentration (Herfindahl) normalisé 0-100 : 100 = tout sur un seul actif. */
export function concentration(values: number[]): number {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return 0;
  const hhi = values.reduce((s, v) => s + (Math.max(0, v) / total) ** 2, 0);
  return Math.round(hhi * 100);
}
