// Smart money : suivre des wallets publics connus pour leurs résultats, lire leurs mouvements (achats/ventes)
// et prévenir quand ils touchent les tokens de ta liste — surtout quand ils vendent (le signal « il est temps
// de sortir »). Fonctions pures et testées : le réseau vit dans src/api/smartmoney.ts et le runner.
//
// Sources : RPC Solana public (soldes de tokens avant/après chaque transaction) et Blockscout (transferts
// ERC-20 Ethereum/Base). Rien à retenir d'autrui : une adresse publique, un libellé, c'est tout.

import type { SmartWallet } from '../types';

/** Un mouvement net d'un wallet suivi : ce qu'il a acheté ou vendu, sur quelle chaîne, dans quelle transaction. */
export interface SmartEvent {
  walletId: string;
  walletLabel: string;
  chain: 'solana' | 'base' | 'eth';
  side: 'buy' | 'sell';
  /** Adresse du contrat (mint Solana, adresse ERC-20) : la clé de rapprochement avec ta liste de tokens. */
  mint: string;
  symbol: string | null;
  name: string | null;
  /** Quantité nette (en tokens, pas en wei/lamports). */
  uiAmount: number;
  txHash: string;
  atMs: number;
}

/** Clé de dédoublonnage durable (runner) : un mouvement n'est jamais notifié deux fois. */
export const eventKey = (e: SmartEvent): string => `sm:${e.walletId}:${e.txHash}:${e.mint}`;

// ------------------------------------------------------------------ Solana (RPC public, jsonParsed)

/** Une ligne de solde de token tel que le RPC la renvoie (avant ou après la transaction). */
export interface SolBalanceRow {
  accountIndex?: number;
  mint?: string;
  owner?: string | null;
  uiTokenAmount?: { uiAmount?: number | null } | null;
}

export interface SolTxLike {
  signature?: string | null;
  blockTime?: number | null;
  meta?: { preTokenBalances?: SolBalanceRow[]; postTokenBalances?: SolBalanceRow[] } | null;
}

/** Agrège les soldes d'un wallet par mint (une ligne « avant » sans owner se raccorde à « après » par index de compte). */
function balancesByMint(rows: SolBalanceRow[], wallet: string, other: SolBalanceRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const mint = r.mint;
    if (!mint) continue;
    // `owner` manque quand le compte n'existait pas encore : le même index dans l'autre liste le donne.
    const owner = r.owner ?? other.find((o) => o.accountIndex === r.accountIndex)?.owner ?? null;
    if (owner !== wallet) continue;
    out.set(mint, (out.get(mint) ?? 0) + (r.uiTokenAmount?.uiAmount ?? 0));
  }
  return out;
}

/** Mouvements nets d'un wallet dans une transaction Solana : positif = reçu (achat), négatif = envoyé (vente). */
export function solanaDeltas(tx: SolTxLike, wallet: string): { mint: string; delta: number; atMs: number; hash: string }[] {
  const pre = balancesByMint(tx.meta?.preTokenBalances ?? [], wallet, tx.meta?.postTokenBalances ?? []);
  const post = balancesByMint(tx.meta?.postTokenBalances ?? [], wallet, tx.meta?.preTokenBalances ?? []);
  const atMs = (tx.blockTime ?? 0) * 1000;
  const hash = tx.signature ?? '';
  const out: { mint: string; delta: number; atMs: number; hash: string }[] = [];
  for (const [mint, after] of post) {
    const before = pre.get(mint) ?? 0;
    const delta = after - before;
    if (Math.abs(delta) < 1e-9) continue; // un déplacement entre ses propres comptes n'est pas un mouvement
    out.push({ mint, delta, atMs, hash });
  }
  return out;
}

// ------------------------------------------------------------------ EVM (Blockscout, Ethereum/Base)

/** Un transfert ERC-20 tel que Blockscout le renvoie (au format v2). */
export interface EvmTransferLike {
  token?: { address?: string | null; symbol?: string | null; name?: string | null; decimals?: number | null; type?: string | null } | null;
  total?: { value?: string | null } | null;
  from?: { hash?: string | null } | null;
  to?: { hash?: string | null } | null;
  timestamp?: string | null;
  tx_hash?: string | null;
}

const evmQty = (raw: string | null | undefined, decimals: number | null): number | null => {
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  const scale = decimals != null && decimals >= 0 && decimals <= 36 ? Math.pow(10, decimals) : null;
  const v = scale != null ? Number(raw) / scale : null;
  return v != null && Number.isFinite(v) ? v : null;
};

/**
 * Mouvements nets d'un wallet depuis les transferts ERC-20 reçus (reçus = achat, envoyés = vente).
 * Un flux aller-retour dans la même transaction s'annule : on ne compte que le résultat net.
 */
export function evmDeltas(items: EvmTransferLike[], wallet: SmartWallet): { mint: string; delta: number; symbol: string | null; name: string | null; atMs: number; hash: string }[] {
  const me = wallet.address.toLowerCase();
  const acc = new Map<string, { mint: string; delta: number; symbol: string | null; name: string | null; atMs: number; hash: string }>();
  for (const it of items) {
    const tok = it.token;
    if (!tok?.address || (tok.type && tok.type !== 'ERC-20')) continue; // pas les NFT
    const qty = evmQty(it.total?.value, tok.decimals ?? null);
    if (qty == null || qty <= 0) continue;
    const addr = tok.address.toLowerCase();
    const from = (it.from?.hash ?? '').toLowerCase();
    const to = (it.to?.hash ?? '').toLowerCase();
    if (from !== me && to !== me) continue;
    const delta = to === me ? qty : -qty;
    const atMs = it.timestamp ? Date.parse(it.timestamp) : 0;
    const hash = it.tx_hash ?? '';
    const prev = acc.get(addr);
    if (prev) {
      // même token, même transaction : cumul net (fausse « vente » qui n'est qu'un aller-retour s'annule)
      if (prev.hash === hash) { prev.delta += delta; continue; }
    }
    acc.set(addr, { mint: addr, delta, symbol: tok.symbol ?? null, name: tok.name ?? null, atMs, hash });
  }
  return [...acc.values()].filter((d) => Math.abs(d.delta) > 1e-12);
}

// ------------------------------------------------------------------ Rapprochement avec TA liste

export interface MyTokenRef {
  /** Clé de réseau Boussole ('solana', 'base', 'eth'…), si on la connaît. */
  chain?: string;
  /** Adresse du contrat sur sa chaîne, si on la connaît. */
  address?: string;
  symbol: string;
}

const CHAIN_ALIASES: Record<string, string> = { eth: 'ethereum', ethereum: 'ethereum', solana: 'solana', base: 'base', bsc: 'bsc', arbitrum: 'arbitrum' };
const normChain = (c: string | undefined): string | null => (c ? CHAIN_ALIASES[c.toLowerCase()] ?? c.toLowerCase() : null);

/** Un mouvement concerne-t-il un token de ta liste ? Adresse exacte sur sa chaîne, ou symbole identique. */
export function tokenMatches(ev: SmartEvent, refs: MyTokenRef[]): boolean {
  const evChain = normChain(ev.chain);
  const mint = ev.mint.toLowerCase();
  const sym = (ev.symbol ?? '').toUpperCase();
  for (const r of refs) {
    if (r.address && normChain(r.chain) === evChain && r.address.toLowerCase() === mint) return true;
    if (sym && r.symbol.toUpperCase() === sym) return true;
  }
  return false;
}

/** Les événements qui touchent les tokens que tu suis (watchlist + positions du journal + pépites suivies). */
export function relevantEvents(events: SmartEvent[], refs: MyTokenRef[]): SmartEvent[] {
  return events.filter((e) => tokenMatches(e, refs));
}

/** Les tokens de ta liste, vus par le smart money : tokens suivis des DEX, positions du journal, alertes armées. */
export function refsOf(w: { watched: { id: string; chainId: string; address: string; symbol: string }[]; positions: { symbol: string }[]; alerts: { symbol: string; active: boolean; triggeredAt?: string | null }[] }): MyTokenRef[] {
  const out: MyTokenRef[] = [];
  const seen = new Set<string>();
  const push = (r: MyTokenRef) => {
    const k = `${r.chain ?? ''}:${r.address ?? r.symbol}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(r);
  };
  for (const t of w.watched) push({ chain: t.chainId, address: t.address, symbol: t.symbol });
  for (const p of w.positions) push({ symbol: p.symbol });
  for (const a of w.alerts) if (a.active && !a.triggeredAt) push({ symbol: a.symbol });
  return out;
}

// ------------------------------------------------------------------ Messages

const qtyLabel = (e: SmartEvent): string => {
  const q = e.uiAmount;
  const digits = q >= 1000 ? 0 : q >= 1 ? 2 : 6;
  return `${q.toFixed(digits)} ${e.symbol ?? ''}`.trim();
};

/** Alerte Telegram : la vente d'un wallet suivi est LE signal — c'est lui qui justifie de relire sa sortie. */
export function smartMessage(e: SmartEvent, nowMs = Date.now()): string {
  const ago = e.atMs > 0 ? Math.max(0, Math.round((nowMs - e.atMs) / 60_000)) : null;
  const when = ago != null ? (ago < 60 ? `il y a ${ago} min` : ago < 2880 ? `il y a ${Math.round(ago / 60)} h` : `il y a ${Math.max(1, Math.round(ago / 1440))} j`) : '';
  const tok = e.symbol ? `${e.symbol}${e.name ? ` (${e.name})` : ''}` : `${e.mint.slice(0, 4)}…`;
  if (e.side === 'sell') {
    return [
      `Smart money — ${e.walletLabel} VEND ${tok}`,
      `${qtyLabel(e)}${when ? `, ${when}` : ''}. Un wallet que tu suis pour ses résultats se décharge de ce token.`,
      `C'est le signal pour relire ton plan de sortie : garde, allège, ou sors — mais décide à froid.`,
    ].join('\n');
  }
  return [
    `Smart money — ${e.walletLabel} achète ${tok}`,
    `${qtyLabel(e)}${when ? `, ${when}` : ''}. Ce wallet y entre : vérifie le projet avant toute idée d'imitation (achat fractionné, jamais tout d'un coup).`,
  ].join('\n');
}

/** Lignes du brief du matin : ce que tes wallets suivis ont fait depuis 24 h, ventes en tête. */
export function smartBriefLines(events: SmartEvent[], nowMs = Date.now(), max = 4): string[] {
  const recent = events.filter((e) => nowMs - e.atMs < 24 * 3600_000);
  recent.sort((a, b) => b.atMs - a.atMs || (a.side === 'sell' ? -1 : 1));
  const lines: string[] = [];
  for (const e of recent.slice(0, max)) {
    lines.push(`${e.side === 'sell' ? 'A vendu' : 'A acheté'} ${qtyLabel(e)} — ${e.walletLabel}`);
  }
  return lines;
}
