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
