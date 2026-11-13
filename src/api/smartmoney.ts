// Réseau du smart money : lire les mouvements d'un wallet public et dire quels tokens sont détenus.
// Sources gratuites sans clé : RPC Solana public (publicnode, repli mainnet-beta) et Blockscout
// (Ethereum, Base). Aucun secret : le wallet suivi est une adresse publique de blockchain.

import type { SmartWallet } from '../types';
import { getJson, postJson } from './http';
import { evmDeltas, solanaDeltas, type EvmTransferLike, type SolTxLike, type SmartEvent } from '../lib/smartmoney';

const SOL_RPCS = ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'];
/** Blockscout filtre les clients sans User-Agent connu : on s'annonce proprement. */
const BS_HEADERS = { 'User-Agent': 'BoussoleCrypto/1.0 (+https://github.com/Nikola17/boussole-crypto)' };
const BLOCKSCOUT: Record<'eth' | 'base', string> = { eth: 'https://eth.blockscout.com', base: 'https://base.blockscout.com' };

async function solRpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastErr: unknown;
  for (const rpc of SOL_RPCS) {
    try {
      const r = await postJson<{ result?: T; error?: { message: string } }>(rpc, { jsonrpc: '2.0', id: 1, method, params }, { timeoutMs: 20_000, retries: 1 });
      if (r.error) throw new Error(r.error.message);
      return r.result as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('RPC Solana indisponible');
}

/** Limite dure : un wallet très actif peut aligner des dizaines de transactions, on lit les premières. */
const MAX_TX = 6;

interface SolAccountInfo { data?: { parsed?: { info?: { mint?: string; symbol?: string; name?: string } } } }

/** Symboles et noms des mints Solana : une seule requête groupée (les adresses seules ne parlent pas). */
async function solanaMintInfos(mints: string[]): Promise<Map<string, { symbol: string | null; name: string | null }>> {
  const out = new Map<string, { symbol: string | null; name: string | null }>();
  if (!mints.length) return out;
  try {
    const r = await solRpc<{ value: (SolAccountInfo | null)[] }>('getMultipleAccounts', [mints.slice(0, 100), { encoding: 'jsonParsed' }]);
    for (const [i, acc] of (r?.value ?? []).entries()) {
      const info = acc?.data?.parsed?.info;
      if (info?.symbol) out.set(mints[i], { symbol: info.symbol, name: info.name ?? null });
    }
  } catch { /* sans métadonnées les événements restent utiles : symbole affiché comme adresse courte */ }
  return out;
}

/** Événements récents d'un wallet Solana depuis un instant donné (ms) : transactions nouvelles seulement. */
async function solanaEvents(wallet: SmartWallet, sinceMs: number, nowMs: number): Promise<SmartEvent[]> {
  const sigs = await solRpc<{ signature: string; blockTime?: number | null; err?: unknown }[]>('getSignaturesForAddress', [wallet.address, { limit: 20 }]);
  const fresh = sigs.filter((s) => !s.err && s.blockTime != null && s.blockTime * 1000 > sinceMs && s.blockTime * 1000 <= nowMs).slice(0, MAX_TX);
  if (!fresh.length) return [];
  const deltas: { mint: string; delta: number; atMs: number; hash: string }[] = [];
  for (const s of fresh) {
    // Une transaction illisible (version non supportée, archive trop ancienne) n'interrompt pas les autres.
    const tx = await solRpc<SolTxLike | null>('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]).catch(() => null);
    if (!tx) continue;
    tx.signature = s.signature;
    tx.blockTime = s.blockTime ?? null;
    deltas.push(...solanaDeltas(tx, wallet.address));
  }
  if (!deltas.length) return [];
  const infos = await solanaMintInfos([...new Set(deltas.map((d) => d.mint))]);
  return deltas.map((d) => {
    const info = infos.get(d.mint) ?? { symbol: null, name: null };
    return {
      walletId: wallet.id, walletLabel: wallet.label, chain: 'solana' as const,
      side: d.delta > 0 ? ('buy' as const) : ('sell' as const),
      mint: d.mint, symbol: info.symbol, name: info.name,
      uiAmount: Math.abs(d.delta), txHash: d.hash, atMs: d.atMs,
    };
  }).sort((a, b) => b.atMs - a.atMs);
}

/** Page de transferts Blockscout, avec la suite éventuelle (bornée) : assez pour un wallet même actif. */
async function blockscoutTransfers(chain: 'eth' | 'base', address: string, maxPages = 2): Promise<EvmTransferLike[]> {
  const base = BLOCKSCOUT[chain];
  const rows: EvmTransferLike[] = [];
  let params: Record<string, string> | null = {};
  for (let page = 0; page < maxPages && params; page++) {
    const url = new URL(`${base}/api/v2/addresses/${address}/token-transfers`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = await getJson<{ items?: EvmTransferLike[]; next_page_params?: Record<string, string | number> | null }>(url.toString(), { headers: BS_HEADERS, timeoutMs: 20_000, retries: 1 });
    const items = r.items ?? [];
    if (!items.length) break;
    rows.push(...items);
    params = r.next_page_params ? Object.fromEntries(Object.entries(r.next_page_params).map(([k, v]) => [k, String(v)])) : null;
    const oldest = items[items.length - 1]?.timestamp ? Date.parse(items[items.length - 1].timestamp as string) : Number.NaN;
    if (!Number.isNaN(oldest)) params = oldest < Date.now() - 14 * 24 * 3600_000 ? null : params; // assez profond, inutile de descendre
  }
  return rows;
}

/** Événements récents d'un wallet EVM (Ethereum/Base) : transferts ERC-20 depuis un instant donné. */
async function evmEvents(wallet: SmartWallet, sinceMs: number): Promise<SmartEvent[]> {
  if (wallet.chain !== 'eth' && wallet.chain !== 'base') return [];
  const rows = await blockscoutTransfers(wallet.chain, wallet.address);
  const recent = rows.filter((it) => it.timestamp && Date.parse(it.timestamp) >= sinceMs);
  if (!recent.length && !rows.length) return [];
  return evmDeltas(recent, wallet).map((d) => ({
    walletId: wallet.id, walletLabel: wallet.label, chain: wallet.chain,
    side: d.delta > 0 ? 'buy' as const : 'sell' as const,
    mint: d.mint, symbol: d.symbol, name: d.name,
    uiAmount: Math.abs(d.delta), txHash: d.hash, atMs: d.atMs,
  })).sort((a, b) => b.atMs - a.atMs);
}

/**
 * Événements (achats/ventes) d'un wallet suivi depuis `sinceMs` : au plus quelques mouvements par appel.
 * Un échec réseau renvoie [] — le wallet reste suivi, on réessaie au prochain contrôle, rien n'est perdu.
 */
export async function fetchWalletEvents(wallet: SmartWallet, sinceMs: number, nowMs = Date.now()): Promise<SmartEvent[]> {
  try {
    if (wallet.chain === 'solana') return await solanaEvents(wallet, sinceMs, nowMs);
    return await evmEvents(wallet, sinceMs);
  } catch {
    return [];
  }
}

/** Tous les événements de plusieurs wallets (app + runner), du plus récent au plus ancien. */
export async function fetchAllWalletEvents(wallets: SmartWallet[], sinceMs: number, nowMs = Date.now()): Promise<SmartEvent[]> {
  const all = await Promise.all(wallets.slice(0, 12).map((w) => fetchWalletEvents(w, sinceMs, nowMs)));
  return all.flat().sort((a, b) => b.atMs - a.atMs);
}

const SOL_TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];

/** Quels mints un wallet détient aujourd'hui (Solana et EVM) : « un wallet suivi y est-il entré ? ». */
export async function walletHoldings(wallet: SmartWallet, mints: string[]): Promise<Set<string>> {
  const wanted = new Set(mints.map((m) => m.toLowerCase()));
  const held = new Set<string>();
  if (!wanted.size) return held;
  if (wallet.chain === 'solana') {
    for (const program of SOL_TOKEN_PROGRAMS) {
      try {
        const r = await solRpc<{ value: { account: { data: { parsed: { info: { mint: string } } } } }[] }>('getTokenAccountsByOwner', [wallet.address, { programId: program }, { encoding: 'jsonParsed' }]);
        for (const a of r?.value ?? []) {
          const mint = a.account.data.parsed.info.mint.toLowerCase();
          if (wanted.has(mint)) held.add(mint);
        }
      } catch { /* lisible au prochain essai, pas d'erreur en cascade */ }
    }
    return held;
  }
  const base = BLOCKSCOUT[wallet.chain as 'eth' | 'base'];
  if (!base) return held;
  try {
    const r = await getJson<{ items?: { token?: { address?: string } | null; value?: string }[] }>(`${base}/api/v2/addresses/${wallet.address}/token-balances`, { headers: BS_HEADERS, timeoutMs: 20_000, retries: 1 });
    for (const it of r.items ?? []) {
      const a = it.token?.address?.toLowerCase();
      if (a && wanted.has(a) && it.value && BigInt(it.value) > 0n) held.add(a);
    }
  } catch { /* idem : absence de réponse ≠ absence de position */ }
  return held;
}
