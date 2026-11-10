// Comptes (plateforme, Ledger, Phantom…) : quantités par compte d'après le journal, et rapprochement avec la blockchain.

import type { Account, Transaction } from '../types';
import { sortTx } from './portfolio';

/** Clé des opérations qui ne sont rattachées à aucun compte. */
export const NO_ACCOUNT = '';

/** Quantité détenue par compte puis par crypto, d'après le journal (achats, ventes, transferts…). */
export function journalByAccount(txs: Transaction[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const add = (acct: string, coinId: string, q: number) => {
    let m = out.get(acct);
    if (!m) { m = new Map(); out.set(acct, m); }
    m.set(coinId, (m.get(coinId) ?? 0) + q);
  };
  for (const tx of sortTx(txs)) {
    const a = tx.accountId ?? NO_ACCOUNT;
    switch (tx.type) {
      case 'buy':
      case 'deposit':
      case 'reward':
        add(a, tx.coinId, tx.quantity);
        break;
      case 'sell':
      case 'withdraw':
        add(a, tx.coinId, -tx.quantity);
        break;
      case 'transfer':
        add(a, tx.coinId, -tx.quantity);
        add(tx.toAccountId ?? NO_ACCOUNT, tx.coinId, tx.quantity);
        break;
    }
  }
  return out;
}

/** Quantité (jamais négative) d'une crypto dans un compte d'après le journal. */
export function journalQty(journal: Map<string, Map<string, number>>, accountId: string, coinId: string): number {
  return Math.max(0, journal.get(accountId)?.get(coinId) ?? 0);
}

/**
 * Comptes dont la blockchain fait foi : au moins un wallet lié, et tous sont lus et inclus au total.
 * Tant qu'un wallet n'est pas lu (chargement, erreur), le compte reste décrit par le journal.
 */
export function coveredAccountIds(
  accounts: Account[],
  wallets: { id: string; includeInTotal: boolean }[],
  walletLoaded: boolean[],
): string[] {
  const out: string[] = [];
  for (const a of accounts) {
    if (!a.walletIds.length) continue;
    const idx = a.walletIds.map((id) => wallets.findIndex((w) => w.id === id));
    if (idx.some((i) => i < 0)) continue;
    if (idx.every((i) => wallets[i].includeInTotal && walletLoaded[i])) out.push(a.id);
  }
  return out;
}

export interface ReconLine {
  coinId: string;
  symbol: string;
  onchain: number;
  journal: number;
  gap: number; // blockchain − journal
  ok: boolean;
}

/** Écart entre ce que la blockchain montre et ce que ton journal raconte (tolérance : 0,5 %). */
export function reconcile(
  onchain: Map<string, number>,
  journal: Map<string, number>,
  symbols: Map<string, string>,
): ReconLine[] {
  const ids = new Set<string>([...onchain.keys(), ...[...journal.keys()].filter((k) => (journal.get(k) ?? 0) > 1e-12)]);
  const out: ReconLine[] = [];
  for (const id of ids) {
    const on = onchain.get(id) ?? 0;
    const jr = Math.max(0, journal.get(id) ?? 0);
    const gap = on - jr;
    const tol = Math.max(1e-9, Math.max(on, jr) * 0.005);
    out.push({ coinId: id, symbol: symbols.get(id) ?? id, onchain: on, journal: jr, gap, ok: Math.abs(gap) <= tol });
  }
  return out.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

export interface LinkHint {
  walletId: string;
  walletLabel: string;
  accountId: string;
  accountName: string;
  /** Cryptos que le wallet et le journal du compte ont en commun (symboles). */
  symbols: string[];
}

/**
 * Wallet suivi mais relié à aucun compte, alors qu'un compte Ledger / wallet logiciel sans wallet relié contient les mêmes cryptos
 * dans le journal : ces quantités sont comptées deux fois (une fois par le journal, une fois par la blockchain).
 * Retourne une proposition de liaison par wallet ; rien n'est modifié sans ton accord.
 */
export function unlinkedOverlap(i: {
  wallets: { id: string; label: string; includeInTotal: boolean }[];
  walletData: ({ holdings: { symbol: string; quantity: number; coingeckoId?: string; valueUsd: number | null }[] } | null)[];
  accounts: Account[];
  journal: Map<string, Map<string, number>>;
}): LinkHint[] {
  const linked = new Set(i.accounts.flatMap((a) => a.walletIds));
  const free = i.accounts.filter((a) => a.walletIds.length === 0 && (a.kind === 'hardware' || a.kind === 'hot'));
  const out: LinkHint[] = [];
  i.wallets.forEach((w, idx) => {
    const d = i.walletData[idx];
    if (!d || !w.includeInTotal || linked.has(w.id)) return;
    let best: { acct: Account; symbols: string[]; score: number } | null = null;
    for (const acct of free) {
      const symbols: string[] = [];
      let score = 0;
      for (const h of d.holdings) {
        if (!h.coingeckoId || (h.valueUsd ?? 0) < 5) continue;
        const jq = journalQty(i.journal, acct.id, h.coingeckoId);
        if (jq <= 1e-12) continue;
        // Le journal et le wallet décrivent à peu près la même quantité (au moins 30 % en commun) : très probablement les mêmes cryptos.
        if (Math.min(jq, h.quantity) / Math.max(jq, h.quantity) >= 0.3) { symbols.push(h.symbol.toUpperCase()); score += h.valueUsd ?? 0; }
      }
      if (symbols.length && (!best || score > best.score)) best = { acct, symbols, score };
    }
    if (best) out.push({ walletId: w.id, walletLabel: w.label, accountId: best.acct.id, accountName: best.acct.name, symbols: best.symbols });
  });
  return out;
}
