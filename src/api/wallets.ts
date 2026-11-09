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

export function detectChain(address: string): WalletAddress['chain'] | null {
  const a = address.trim();
  if (isExtendedKey(a)) return 'bitcoin';
  if (/^0x[a-fA-F0-9]{40}$/.test(a)) return 'evm';
  if (/^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(a)) return 'bitcoin';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return 'solana';
  return null;
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
        const nat = hexToAmount(byId.get(0)?.result, 18);
        if (nat > 0) raw.push({ chain: chain.label, symbol: chain.native.symbol, quantity: nat, coingeckoId: chain.native.coingeckoId });
        tokens.forEach((t, i) => {
          const q = hexToAmount(byId.get(i + 1)?.result, t.decimals);
          if (q > 0) raw.push({ chain: chain.label, symbol: t.symbol, quantity: q, coingeckoId: t.coingeckoId || undefined, tokenAddress: t.address });
        });
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
