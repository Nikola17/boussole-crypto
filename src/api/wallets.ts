// Lecture de soldes à partir d'adresses PUBLIQUES (lecture seule, aucune clé privée).
// Bitcoin : mempool.space · EVM : RPC publics (PublicNode) · Solana : RPC public + Jupiter + DexScreener.

import type { CustomToken, WalletAddress } from '../types';
import { getJson, pool, postJson } from './http';
import { getTokenPairs } from './dex';
import {
  deriveAddress, isExtendedKey, parseExtendedKey, SCRIPT_LABEL, SCRIPT_ORDER, scriptForPrefix,
  type BtcScript, type BtcScriptChoice,
} from '../lib/xpub';

export interface WalletHolding {
  chain: string;
  symbol: string;
  name: string;
  quantity: number;
  priceUsd: number | null;
  valueUsd: number | null;
  coingeckoId?: string;
  tokenAddress?: string;
  image?: string;
}

export interface WalletResult {
  walletId: string;
  holdings: WalletHolding[];
  totalUsd: number;
  errors: string[];
  /** Informations (non bloquantes) sur la lecture : format détecté, nombre d'adresses… */
  notes?: string[];
  fetchedAt: number;
}

export function normalizeWalletAddress(address: string): string {
  const a = address.trim();
  if (/^ronin:[a-fA-F0-9]{40}$/i.test(a)) return `0x${a.slice(6)}`;
  return a;
}

/** Retourne toutes les chaînes compatibles avec une adresse (ex. 0x 40 hex = EVM ou Hyperliquid ; 0x 64 hex = Sui ou Aptos). */
export function detectChainCandidates(address: string): WalletAddress['chain'][] {
  const raw = address.trim();
  if (!raw) return [];
  if (isExtendedKey(raw)) return ['bitcoin'];
  if (/^ronin:[a-fA-F0-9]{40}$/i.test(raw)) return ['evm'];
  if (/^0x[a-fA-F0-9]{40}$/.test(raw)) return ['evm', 'hyperliquid'];
  if (/^0x[a-fA-F0-9]{64}$/.test(raw)) return ['sui', 'aptos'];
  if (/^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(raw) || /^-?\d:[a-fA-F0-9]{64}$/.test(raw)) return ['ton'];
  if (/^(cosmos|osmo|celestia|inj|sei|neutron|dydx)1[a-z0-9]{38,59}$/.test(raw)) return ['cosmos'];
  if (/^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(raw)) return ['bitcoin'];
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw)) return ['solana'];
  return [];
}

export function detectChain(address: string): WalletAddress['chain'] | null {
  return detectChainCandidates(address)[0] ?? null;
}

// ------------------------------------------------------------------ Bitcoin

export async function getBtcBalance(address: string): Promise<number> {
  const r = await getJson<{
    chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
    mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
  }>(`https://mempool.space/api/address/${address}`);
  const sats = r.chain_stats.funded_txo_sum - r.chain_stats.spent_txo_sum + r.mempool_stats.funded_txo_sum - r.mempool_stats.spent_txo_sum;
  return sats / 1e8;
}

/** Statistiques d'une adresse Bitcoin : solde en satoshis et présence d'historique. */
async function btcAddressInfo(address: string): Promise<{ sats: number; used: boolean }> {
  const r = await getJson<{
    chain_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
    mempool_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
  }>(`https://mempool.space/api/address/${address}`);
  const sats = r.chain_stats.funded_txo_sum - r.chain_stats.spent_txo_sum + r.mempool_stats.funded_txo_sum - r.mempool_stats.spent_txo_sum;
  return { sats, used: r.chain_stats.tx_count + r.mempool_stats.tx_count > 0 };
}

export interface XpubScan {
  script: BtcScript;
  sats: number;
  usedAddresses: number;
  checkedAddresses: number;
  detected: boolean;
}

const GAP_LIMIT = 20;
const BATCH = 5;

/**
 * Solde total d'un compte Bitcoin à partir de sa clé publique étendue : les adresses sont dérivées localement
 * (réception et monnaie rendue), puis lues sur mempool.space jusqu'à 20 adresses de suite sans historique.
 */
export async function scanXpub(key: string, choice: BtcScriptChoice = 'auto'): Promise<XpubScan> {
  const hd = parseExtendedKey(key);
  const forced = choice !== 'auto' ? choice : scriptForPrefix(key);
  let script: BtcScript = forced ?? 'p2wpkh';
  let detected = false;
  if (!forced) {
    // Un xpub ne dit pas son format : on garde le premier qui montre de l'activité sur ses 5 premières adresses.
    for (const c of SCRIPT_ORDER) {
      const probe = await pool(Array.from({ length: BATCH }, (_, i) => deriveAddress(hd, c, 0, i)), BATCH, btcAddressInfo);
      if (probe.some((x) => x?.used)) { script = c; detected = true; break; }
    }
  }
  let sats = 0;
  let used = 0;
  let checked = 0;
  for (const change of [0, 1] as const) {
    let gap = 0;
    let i = 0;
    while (gap < GAP_LIMIT && i < 100) {
      const batch = Array.from({ length: BATCH }, (_, k) => deriveAddress(hd, script, change, i + k));
      const infos = await pool(batch, BATCH, btcAddressInfo);
      for (const info of infos) {
        // Un échec partiel donnerait un solde faux : on préfère signaler l'erreur.
        if (!info) throw new Error('Lecture interrompue sur mempool.space : réessaie dans un instant.');
        i++;
        checked++;
        if (info.used) { gap = 0; used++; sats += info.sats; } else gap++;
      }
    }
  }
  return { script, sats, usedAddresses: used, checkedAddresses: checked, detected };
}

export function xpubNote(scan: XpubScan): string {
  const fmt = SCRIPT_LABEL[scan.script];
  return `Clé publique étendue · format ${fmt}${scan.detected ? ' (détecté)' : ''} · ${scan.usedAddresses} adresse${scan.usedAddresses > 1 ? 's' : ''} utilisée${scan.usedAddresses > 1 ? 's' : ''} sur ${scan.checkedAddresses} lues`;
}

// ------------------------------------------------------------------ EVM

export interface EvmChain {
  key: string;
  label: string;
  rpc: string;
  native: { symbol: string; coingeckoId: string };
  tokens: { symbol: string; address: string; decimals: number; coingeckoId: string }[];
}

export const EVM_CHAINS: EvmChain[] = [
  {
    key: 'ethereum', label: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com',
    native: { symbol: 'ETH', coingeckoId: 'ethereum' },
    tokens: [
      { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, coingeckoId: 'usd-coin' },
      { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, coingeckoId: 'tether' },
      { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, coingeckoId: 'weth' },
      { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, coingeckoId: 'wrapped-bitcoin' },
      { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, coingeckoId: 'dai' },
      { symbol: 'stETH', address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', decimals: 18, coingeckoId: 'staked-ether' },
      { symbol: 'LINK', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18, coingeckoId: 'chainlink' },
      { symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18, coingeckoId: 'uniswap' },
      { symbol: 'AAVE', address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', decimals: 18, coingeckoId: 'aave' },
      { symbol: 'ONDO', address: '0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3', decimals: 18, coingeckoId: 'ondo-finance' },
      { symbol: 'ENA', address: '0x57e114B691Db790C35207b2e685D4A43181e6061', decimals: 18, coingeckoId: 'ethena' },
      { symbol: 'LDO', address: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32', decimals: 18, coingeckoId: 'lido-dao' },
      { symbol: 'PEPE', address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', decimals: 18, coingeckoId: 'pepe' },
      { symbol: 'SHIB', address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', decimals: 18, coingeckoId: 'shiba-inu' },
    ],
  },
  {
    key: 'base', label: 'Base', rpc: 'https://base-rpc.publicnode.com',
    native: { symbol: 'ETH', coingeckoId: 'ethereum' },
    tokens: [
      { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, coingeckoId: 'usd-coin' },
      { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18, coingeckoId: 'weth' },
      { symbol: 'cbBTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, coingeckoId: 'coinbase-wrapped-btc' },
      { symbol: 'AERO', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18, coingeckoId: 'aerodrome-finance' },
      { symbol: 'VIRTUAL', address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', decimals: 18, coingeckoId: 'virtual-protocol' },
      { symbol: 'BRETT', address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', decimals: 18, coingeckoId: 'based-brett' },
      { symbol: 'DEGEN', address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', decimals: 18, coingeckoId: 'degen-base' },
    ],
  },
  {
    key: 'arbitrum', label: 'Arbitrum', rpc: 'https://arbitrum-one-rpc.publicnode.com',
    native: { symbol: 'ETH', coingeckoId: 'ethereum' },
    tokens: [
      { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, coingeckoId: 'usd-coin' },
      { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6, coingeckoId: 'tether' },
      { symbol: 'ARB', address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18, coingeckoId: 'arbitrum' },
      { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18, coingeckoId: 'weth' },
      { symbol: 'GMX', address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', decimals: 18, coingeckoId: 'gmx' },
    ],
  },
  {
    key: 'optimism', label: 'Optimism', rpc: 'https://optimism-rpc.publicnode.com',
    native: { symbol: 'ETH', coingeckoId: 'ethereum' },
    tokens: [
      { symbol: 'USDC', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6, coingeckoId: 'usd-coin' },
      { symbol: 'OP', address: '0x4200000000000000000000000000000000000042', decimals: 18, coingeckoId: 'optimism' },
      { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18, coingeckoId: 'weth' },
    ],
  },
  {
    key: 'polygon', label: 'Polygon', rpc: 'https://polygon-bor-rpc.publicnode.com',
    native: { symbol: 'POL', coingeckoId: 'polygon-ecosystem-token' },
    tokens: [
      { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, coingeckoId: 'usd-coin' },
      { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, coingeckoId: 'tether' },
      { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, coingeckoId: 'weth' },
    ],
  },
  {
    key: 'bsc', label: 'BNB Chain', rpc: 'https://bsc-rpc.publicnode.com',
    native: { symbol: 'BNB', coingeckoId: 'binancecoin' },
    tokens: [
      { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, coingeckoId: 'tether' },
      { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, coingeckoId: 'usd-coin' },
      { symbol: 'CAKE', address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', decimals: 18, coingeckoId: 'pancakeswap-token' },
      { symbol: 'ETH', address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18, coingeckoId: 'ethereum' },
    ],
  },
  {
    key: 'avalanche', label: 'Avalanche', rpc: 'https://avalanche-c-chain-rpc.publicnode.com',
    native: { symbol: 'AVAX', coingeckoId: 'avalanche-2' },
    tokens: [
      { symbol: 'USDC', address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6, coingeckoId: 'usd-coin' },
      { symbol: 'USDT', address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6, coingeckoId: 'tether' },
    ],
  },
  {
    key: 'sonic', label: 'Sonic', rpc: 'https://sonic-rpc.publicnode.com',
    native: { symbol: 'S', coingeckoId: 'sonic-3' },
    tokens: [
      { symbol: 'USDC', address: '0x29219dd400f2Bf60E5a23d13Be72B486D4038894', decimals: 6, coingeckoId: 'usd-coin' },
      { symbol: 'WETH', address: '0x50c42dEAcD8Fc9773493ED674b675bE577f2634b', decimals: 18, coingeckoId: 'weth' },
    ],
  },
  {
    key: 'zksync', label: 'zkSync Era', rpc: 'https://zksync-era-rpc.publicnode.com',
    native: { symbol: 'ETH', coingeckoId: 'ethereum' },
    tokens: [
      { symbol: 'USDC', address: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4', decimals: 6, coingeckoId: 'usd-coin' },
      { symbol: 'ZK', address: '0x5A7d6b2F92C77FAD6CCaBd7EE0624E64907Eaf3E', decimals: 18, coingeckoId: 'zksync' },
    ],
  },
  {
    key: 'cronos', label: 'Cronos', rpc: 'https://cronos-evm-rpc.publicnode.com',
    native: { symbol: 'CRO', coingeckoId: 'crypto-com-chain' },
    tokens: [
      { symbol: 'USDC', address: '0xc21223249CA28397B4B6541dfFaEcC539BfF0c59', decimals: 6, coingeckoId: 'usd-coin' },
      { symbol: 'USDT', address: '0x66e428c3f67a68878562e79A0234c1F83c208770', decimals: 6, coingeckoId: 'tether' },
    ],
  },
];

interface RpcResult { id: number; result?: string; error?: { message: string } }

function hexToAmount(hex: string | undefined, decimals: number): number {
  if (!hex || hex === '0x') return 0;
  const big = BigInt(hex);
  if (big === 0n) return 0;
  const base = 10n ** BigInt(decimals);
  const whole = big / base;
  const frac = big % base;
  return Number(whole) + Number(frac) / Number(base);
}

export interface EvmRaw {
  chain: string;
  symbol: string;
  quantity: number;
  coingeckoId?: string;
  tokenAddress?: string;
}

export async function getEvmBalances(address: string, chainKeys: string[], custom: CustomToken[] = []): Promise<{ raw: EvmRaw[]; errors: string[] }> {
  const raw: EvmRaw[] = [];
  const errors: string[] = [];
  const padded = address.toLowerCase().replace('0x', '').padStart(64, '0');
  await Promise.all(
    EVM_CHAINS.filter((c) => chainKeys.includes(c.key)).map(async (chain) => {
      const tokens = [
        ...chain.tokens,
        ...custom.filter((t) => t.chain === chain.key).map((t) => ({ symbol: t.symbol, address: t.address, decimals: t.decimals, coingeckoId: t.coingeckoId ?? '' })),
      ];
      const batch = [
        { jsonrpc: '2.0', id: 0, method: 'eth_getBalance', params: [address, 'latest'] },
        ...tokens.map((t, i) => ({
          jsonrpc: '2.0', id: i + 1, method: 'eth_call',
          params: [{ to: t.address, data: `0x70a08231${padded}` }, 'latest'],
        })),
      ];
      try {
        const res = await postJson<RpcResult[]>(chain.rpc, batch, { timeoutMs: 20000 });
        const byId = new Map(res.map((r) => [r.id, r]));
        // Une lecture qui échoue (erreur du nœud, réponse absente) n'est PAS un solde de zéro : on la signale, le wallet est alors « incomplet ».
        const failed: string[] = [];
        const read = (id: number, decimals: number, label: string): number | null => {
          const r = byId.get(id);
          if (!r || r.error || r.result == null) { failed.push(label); return null; }
          return hexToAmount(r.result, decimals);
        };
        const nat = read(0, 18, chain.native.symbol);
        if (nat != null && nat > 0) raw.push({ chain: chain.label, symbol: chain.native.symbol, quantity: nat, coingeckoId: chain.native.coingeckoId });
        tokens.forEach((t, i) => {
          const q = read(i + 1, t.decimals, t.symbol);
          if (q != null && q > 0) raw.push({ chain: chain.label, symbol: t.symbol, quantity: q, coingeckoId: t.coingeckoId || undefined, tokenAddress: t.address });
        });
        if (failed.length) errors.push(`${chain.label} : ${failed.length} solde${failed.length > 1 ? 's' : ''} illisible${failed.length > 1 ? 's' : ''} (${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '…' : ''}) : non comptés, ce n’est pas un solde nul`);
      } catch (e) {
        errors.push(`${chain.label} : ${(e as Error).message}`);
      }
    }),
  );
  return { raw, errors };
}

// ------------------------------------------------------------------ Solana

const SOL_RPCS = ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'];
const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

const KNOWN_SOL: Record<string, { symbol: string; name: string; coingeckoId?: string }> = {
  So11111111111111111111111111111111111111112: { symbol: 'WSOL', name: 'Wrapped SOL', coingeckoId: 'wrapped-solana' },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', name: 'USD Coin', coingeckoId: 'usd-coin' },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', name: 'Tether', coingeckoId: 'tether' },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: 'JUP', name: 'Jupiter', coingeckoId: 'jupiter-exchange-solana' },
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: { symbol: 'JTO', name: 'Jito', coingeckoId: 'jito-governance-token' },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: 'mSOL', name: 'Marinade SOL', coingeckoId: 'msol' },
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { symbol: 'JitoSOL', name: 'Jito Staked SOL', coingeckoId: 'jito-staked-sol' },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: 'BONK', name: 'Bonk', coingeckoId: 'bonk' },
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: { symbol: 'WIF', name: 'dogwifhat', coingeckoId: 'dogwifcoin' },
};

async function solRpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastErr: unknown;
  for (const rpc of SOL_RPCS) {
    try {
      const r = await postJson<{ result?: T; error?: { message: string } }>(rpc, { jsonrpc: '2.0', id: 1, method, params }, { timeoutMs: 20000, retries: 1 });
      if (r.error) throw new Error(r.error.message);
      return r.result as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('RPC Solana indisponible');
}

interface ParsedTokenAccount {
  account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null; decimals: number } } } } };
}

export async function getSolanaHoldings(address: string): Promise<{ holdings: WalletHolding[]; errors: string[] }> {
  const errors: string[] = [];
  const holdings: WalletHolding[] = [];
  const bal = await solRpc<{ value: number }>('getBalance', [address]);
  const sol = bal.value / 1e9;
  const mints = new Map<string, number>();
  for (const program of TOKEN_PROGRAMS) {
    try {
      const r = await solRpc<{ value: ParsedTokenAccount[] }>('getTokenAccountsByOwner', [address, { programId: program }, { encoding: 'jsonParsed' }]);
      for (const acc of r.value) {
        const info = acc.account.data.parsed.info;
        const q = info.tokenAmount.uiAmount ?? 0;
        if (q > 0) mints.set(info.mint, (mints.get(info.mint) ?? 0) + q);
      }
    } catch (e) {
      errors.push(`Tokens Solana : ${(e as Error).message}`);
    }
  }
  const ids = [SOL_MINT, ...mints.keys()].slice(0, 100);
  const prices = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const r = await getJson<Record<string, { usdPrice?: number }>>(`https://lite-api.jup.ag/price/v3?ids=${ids.slice(i, i + 50).join(',')}`, { retries: 1 });
      for (const [mint, v] of Object.entries(r)) if (v?.usdPrice) prices.set(mint, v.usdPrice);
    } catch {
      errors.push('Prix Jupiter indisponibles');
    }
  }
  let meta = new Map<string, { symbol: string; name: string; price: number | null; image?: string }>();
  try {
    const pairs = await getTokenPairs('solana', [...mints.keys()].slice(0, 90));
    meta = new Map([...pairs.entries()].map(([k, p]) => [k, { symbol: p.baseToken.symbol, name: p.baseToken.name, price: p.priceUsd ? Number(p.priceUsd) : null, image: p.info?.imageUrl }]));
  } catch {
    /* métadonnées facultatives */
  }
  const solPrice = prices.get(SOL_MINT) ?? null;
  if (sol > 0) holdings.push({ chain: 'Solana', symbol: 'SOL', name: 'Solana', quantity: sol, priceUsd: solPrice, valueUsd: solPrice != null ? sol * solPrice : null, coingeckoId: 'solana' });
  for (const [mint, q] of mints) {
    const m = meta.get(mint.toLowerCase());
    const known = KNOWN_SOL[mint];
    const price = prices.get(mint) ?? m?.price ?? null;
    holdings.push({
      chain: 'Solana',
      symbol: known?.symbol ?? m?.symbol ?? `${mint.slice(0, 4)}…`,
      name: known?.name ?? m?.name ?? 'Token SPL',
      coingeckoId: known?.coingeckoId,
      quantity: q,
      priceUsd: price,
      valueUsd: price != null ? q * price : null,
      tokenAddress: mint,
      image: m?.image,
    });
  }
  return { holdings, errors };
}

// ------------------------------------------------------------------ TON (Tonkeeper, TON Wallet Telegram)

export function parseTonBalance(raw: { ok?: boolean; result?: string | number }): WalletHolding[] {
  const nano = Number(raw?.result);
  if (!Number.isFinite(nano) || nano <= 0) return [];
  return [{
    chain: 'TON',
    symbol: 'TON',
    name: 'Toncoin',
    quantity: nano / 1e9,
    priceUsd: null,
    valueUsd: null,
    coingeckoId: 'the-open-network',
  }];
}

export async function getTonHoldings(address: string): Promise<{ holdings: WalletHolding[]; errors: string[] }> {
  try {
    const r = await getJson<{ ok?: boolean; result?: string | number; error?: string }>(
      `https://toncenter.com/api/v2/getAddressBalance?address=${encodeURIComponent(address)}`,
      { timeoutMs: 15000, retries: 1 },
    );
    if (r.ok === false) return { holdings: [], errors: [`TON : ${r.error ?? 'erreur toncenter'}`] };
    return { holdings: parseTonBalance(r), errors: [] };
  } catch (e) {
    return { holdings: [], errors: [`TON : ${(e as Error).message}`] };
  }
}

// ------------------------------------------------------------------ Sui (Slush / Sui Wallet)

const KNOWN_SUI: Record<string, { symbol: string; name: string; decimals: number; coingeckoId: string }> = {
  '0x2::sui::SUI': { symbol: 'SUI', name: 'Sui', decimals: 9, coingeckoId: 'sui' },
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC': { symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
  '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN': { symbol: 'USDT', name: 'Tether', decimals: 6, coingeckoId: 'tether' },
  '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS': { symbol: 'CETUS', name: 'Cetus Protocol', decimals: 9, coingeckoId: 'cetus-protocol' },
  '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP': { symbol: 'DEEP', name: 'DeepBook', decimals: 6, coingeckoId: 'deep' },
  '0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE': { symbol: 'BLUE', name: 'Bluefin', decimals: 9, coingeckoId: 'bluefin' },
};

export function parseSuiBalances(list: { coinType: string; totalBalance: string }[]): WalletHolding[] {
  const out: WalletHolding[] = [];
  for (const item of list ?? []) {
    const known = KNOWN_SUI[item.coinType];
    if (!known) continue;
    const raw = Number(item.totalBalance);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    out.push({
      chain: 'Sui',
      symbol: known.symbol,
      name: known.name,
      quantity: raw / 10 ** known.decimals,
      priceUsd: null,
      valueUsd: null,
      coingeckoId: known.coingeckoId,
      tokenAddress: item.coinType,
    });
  }
  return out;
}

export async function getSuiHoldings(address: string): Promise<{ holdings: WalletHolding[]; errors: string[] }> {
  try {
    const r = await postJson<{ result?: { coinType: string; totalBalance: string }[]; error?: { message: string } }>(
      'https://fullnode.mainnet.sui.io:443',
      { jsonrpc: '2.0', id: 1, method: 'suix_getAllBalances', params: [address] },
      { timeoutMs: 15000, retries: 1 },
    );
    if (r.error) return { holdings: [], errors: [`Sui : ${r.error.message}`] };
    return { holdings: parseSuiBalances(r.result ?? []), errors: [] };
  } catch (e) {
    return { holdings: [], errors: [`Sui : ${(e as Error).message}`] };
  }
}

// ------------------------------------------------------------------ Aptos (Petra, Thala)

const KNOWN_APTOS: Record<string, { symbol: string; name: string; decimals: number; coingeckoId: string }> = {
  '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>': { symbol: 'APT', name: 'Aptos', decimals: 8, coingeckoId: 'aptos' },
  '0x1::coin::CoinStore<0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC>': { symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
  '0x1::coin::CoinStore<0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT>': { symbol: 'USDT', name: 'Tether', decimals: 6, coingeckoId: 'tether' },
};

export function parseAptosResources(resources: { type: string; data?: { coin?: { value?: string } } }[]): WalletHolding[] {
  const out: WalletHolding[] = [];
  for (const res of resources ?? []) {
    const known = KNOWN_APTOS[res.type];
    if (!known) continue;
    const raw = Number(res.data?.coin?.value);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    out.push({
      chain: 'Aptos',
      symbol: known.symbol,
      name: known.name,
      quantity: raw / 10 ** known.decimals,
      priceUsd: null,
      valueUsd: null,
      coingeckoId: known.coingeckoId,
    });
  }
  return out;
}

export async function getAptosHoldings(address: string): Promise<{ holdings: WalletHolding[]; errors: string[] }> {
  try {
    const r = await getJson<{ type: string; data?: { coin?: { value?: string } } }[]>(
      `https://fullnode.mainnet.aptoslabs.com/v1/accounts/${encodeURIComponent(address)}/resources`,
      { timeoutMs: 15000, retries: 1 },
    );
    return { holdings: parseAptosResources(Array.isArray(r) ? r : []), errors: [] };
  } catch (e) {
    return { holdings: [], errors: [`Aptos : ${(e as Error).message}`] };
  }
}

// ------------------------------------------------------------------ Cosmos / Osmosis / dYdX / Celestia / Injective (Keplr, Leap)

const COSMOS_NETWORKS: Record<string, { label: string; rest: string; denom: string; symbol: string; name: string; decimals: number; coingeckoId: string }> = {
  cosmos: { label: 'Cosmos Hub', rest: 'https://cosmos-rest.publicnode.com', denom: 'uatom', symbol: 'ATOM', name: 'Cosmos', decimals: 6, coingeckoId: 'cosmos' },
  osmo: { label: 'Osmosis', rest: 'https://osmosis-rest.publicnode.com', denom: 'uosmo', symbol: 'OSMO', name: 'Osmosis', decimals: 6, coingeckoId: 'osmosis' },
  dydx: { label: 'dYdX Chain', rest: 'https://dydx-rest.publicnode.com', denom: 'adydx', symbol: 'DYDX', name: 'dYdX', decimals: 18, coingeckoId: 'dydx-chain' },
  celestia: { label: 'Celestia', rest: 'https://celestia-rest.publicnode.com', denom: 'utia', symbol: 'TIA', name: 'Celestia', decimals: 6, coingeckoId: 'celestia' },
  inj: { label: 'Injective', rest: 'https://injective-rest.publicnode.com', denom: 'inj', symbol: 'INJ', name: 'Injective', decimals: 18, coingeckoId: 'injective-protocol' },
};

export function parseCosmosBalances(prefix: string, balances: { denom: string; amount: string }[]): WalletHolding[] {
  const net = COSMOS_NETWORKS[prefix];
  if (!net) return [];
  const out: WalletHolding[] = [];
  for (const b of balances ?? []) {
    if (b.denom !== net.denom) continue;
    const raw = Number(b.amount);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    out.push({
      chain: net.label,
      symbol: net.symbol,
      name: net.name,
      quantity: raw / 10 ** net.decimals,
      priceUsd: null,
      valueUsd: null,
      coingeckoId: net.coingeckoId,
    });
  }
  return out;
}

export async function getCosmosHoldings(address: string): Promise<{ holdings: WalletHolding[]; errors: string[] }> {
  const prefix = address.trim().split('1')[0]?.toLowerCase() ?? '';
  const net = COSMOS_NETWORKS[prefix];
  if (!net) return { holdings: [], errors: [`Réseau Cosmos « ${prefix || '?'} » non pris en charge en lecture directe.`] };
  try {
    const r = await getJson<{ balances?: { denom: string; amount: string }[] }>(
      `${net.rest}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`,
      { timeoutMs: 15000, retries: 1 },
    );
    return { holdings: parseCosmosBalances(prefix, r.balances ?? []), errors: [] };
  } catch (e) {
    return { holdings: [], errors: [`${net.label} : ${(e as Error).message}`] };
  }
}

// ------------------------------------------------------------------ Hyperliquid (Perps + Spot via API publique lecture seule)

const HL_SPOT_IDS: Record<string, string> = {
  USDC: 'usd-coin',
  HYPE: 'hyperliquid',
  PURR: 'purr-2',
  BTC: 'bitcoin',
  UBTC: 'bitcoin',
  ETH: 'ethereum',
  UETH: 'ethereum',
  SOL: 'solana',
  USOL: 'solana',
};

export function parseHyperliquidState(
  perp: { marginSummary?: { accountValue?: string }; assetPositions?: { position?: { coin?: string; szi?: string } }[] } | null,
  spot: { balances?: { coin: string; total: string }[] } | null,
): { holdings: WalletHolding[]; notes: string[] } {
  const holdings: WalletHolding[] = [];
  const notes: string[] = [];
  const perpEquity = Number(perp?.marginSummary?.accountValue ?? 0);
  if (Number.isFinite(perpEquity) && perpEquity > 0.01) {
    holdings.push({
      chain: 'Hyperliquid Perps',
      symbol: 'USDC',
      name: 'Marge Perps Hyperliquid',
      quantity: perpEquity,
      priceUsd: 1,
      valueUsd: perpEquity,
      coingeckoId: 'usd-coin',
    });
  }
  const openPos = (perp?.assetPositions ?? []).filter((p) => Math.abs(Number(p.position?.szi ?? 0)) > 0);
  if (openPos.length) {
    notes.push(`Hyperliquid : ${openPos.length} position${openPos.length > 1 ? 's' : ''} perp ouverte${openPos.length > 1 ? 's' : ''} (${openPos.slice(0, 4).map((p) => p.position?.coin).filter(Boolean).join(', ')})`);
  }
  for (const b of spot?.balances ?? []) {
    const qty = Number(b.total);
    if (!Number.isFinite(qty) || qty <= 1e-8) continue;
    const sym = b.coin.toUpperCase();
    const isUsd = sym === 'USDC' || sym === 'USDT';
    holdings.push({
      chain: 'Hyperliquid Spot',
      symbol: sym,
      name: sym,
      quantity: qty,
      priceUsd: isUsd ? 1 : null,
      valueUsd: isUsd ? qty : null,
      coingeckoId: HL_SPOT_IDS[sym],
    });
  }
  return { holdings, notes };
}

export async function getHyperliquidHoldings(address: string): Promise<{ holdings: WalletHolding[]; errors: string[]; notes: string[] }> {
  const errors: string[] = [];
  let perp: Parameters<typeof parseHyperliquidState>[0] = null;
  let spot: Parameters<typeof parseHyperliquidState>[1] = null;
  await Promise.all([
    postJson<typeof perp>('https://api.hyperliquid.xyz/info', { type: 'clearinghouseState', user: address }, { timeoutMs: 15000, retries: 1 })
      .then((r) => { perp = r; })
      .catch((e) => { errors.push(`Hyperliquid Perps : ${(e as Error).message}`); }),
    postJson<typeof spot>('https://api.hyperliquid.xyz/info', { type: 'spotClearinghouseState', user: address }, { timeoutMs: 15000, retries: 1 })
      .then((r) => { spot = r; })
      .catch((e) => { errors.push(`Hyperliquid Spot : ${(e as Error).message}`); }),
  ]);
  const parsed = parseHyperliquidState(perp, spot);
  return { holdings: parsed.holdings, errors, notes: parsed.notes };
}
