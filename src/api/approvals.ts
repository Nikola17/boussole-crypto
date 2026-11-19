// Approvals ERC-20 actifs d'un wallet EVM, sans aucune clé API :
// 1. transactions SORTANTES du wallet via l'API publique Blockscout (v2), filtrées sur le sélecteur
//    approve(address,uint256) = 0x095ea7b3 → (token, spender) historiques,
// 2. allowance courante (owner → spender) lue par eth_call sur le RPC public.
// Limite documentée : les ~150 dernières transactions sortantes (3 pages Blockscout).
// Boussole ne signe JAMAIS de révocation : elle liste, ton wallet signe (revoke.cash).

import { getJson, postJson } from './http';
import { EVM_CHAINS } from './wallets';
import { classifyApproval, type ApprovalInfo } from '../lib/approvals';

const APPROVE_SELECTOR = '0x095ea7b3'; // approve(address,uint256)

const BLOCKSCOUT: Record<string, string> = {
  ethereum: 'https://eth.blockscout.com',
  base: 'https://base.blockscout.com',
  optimism: 'https://optimism.blockscout.com',
  polygon: 'https://polygon.blockscout.com',
  arbitrum: 'https://arbitrum.blockscout.com',
};

interface TxItem {
  hash: string;
  to?: { hash: string } | null;
  raw_input?: string;
  decoded_input?: { method_call?: string } | null;
}

interface TxPage {
  items?: TxItem[];
  next_page_params?: Record<string, string> | null;
}

export interface EvmApproval extends ApprovalInfo {
  chain: string;
  active: boolean;
  unlimited: boolean;
  risky: boolean;
  human: number | null;
}

export interface ApprovalsResult {
  approvals: EvmApproval[];
  errors: string[];
  scannedTxs: number;
}

/** `pages` dernières pages de transactions sortantes (50/page sur Blockscout). */
async function getFromTransactions(bs: string, owner: string, pages: number): Promise<TxItem[]> {
  const out: TxItem[] = [];
  let cursor: Record<string, string> | null = null;
  for (let p = 0; p < pages; p++) {
    const u = new URL(`${bs}/api/v2/addresses/${owner}/transactions`);
    u.searchParams.set('filter', 'from');
    if (cursor) for (const [k, v] of Object.entries(cursor)) u.searchParams.set(k, v);
    const r = await getJson<TxPage>(u.toString(), { timeoutMs: 20000, retries: 1 });
    out.push(...(r.items ?? []));
    if (!r.next_page_params) break;
    cursor = r.next_page_params;
  }
  return out;
}

function decodeString(hex: string | undefined): string | null {
  if (!hex) return null;
  try {
    const h = hex.replace(/^0x/, '');
    const bytes = new Uint8Array(h.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    const s = new TextDecoder().decode(bytes).replace(/\0/g, '').trim();
    return s || null;
  } catch {
    return null;
  }
}

export async function getEvmApprovals(address: string, chainKeys: string[], pages = 3): Promise<ApprovalsResult> {
  const owner = address.toLowerCase();
  const paddedOwner = owner.replace('0x', '').padStart(64, '0');
  const approvals: EvmApproval[] = [];
  const errors: string[] = [];
  let scannedTxs = 0;

  await Promise.all(
    EVM_CHAINS.filter((c) => chainKeys.includes(c.key) && BLOCKSCOUT[c.key]).map(async (chain) => {
      const bs = BLOCKSCOUT[chain.key];
      try {
        const txs = await getFromTransactions(bs, owner, pages);
        scannedTxs += txs.length;
        const seen = new Map<string, { token: string; spender: string }>();
        for (const t of txs) {
          const input = t.raw_input ?? '';
          if (!input.startsWith(APPROVE_SELECTOR)) continue;
          const spender = `0x${input.slice(10, 74)}`.toLowerCase();
          const token = t.to?.hash?.toLowerCase();
          if (!token || spender.length !== 42) continue;
          seen.set(`${token}|${spender}`, { token, spender });
        }
        if (!seen.size) return;
        const entries = [...seen.values()];
        const calls = entries.flatMap((s, i) => [
          { jsonrpc: '2.0', id: i * 3, method: 'eth_call', params: [{ to: s.token, data: `0xdd62ed3e${paddedOwner}${s.spender.replace('0x', '').padStart(64, '0')}` }, 'latest'] },
          { jsonrpc: '2.0', id: i * 3 + 1, method: 'eth_call', params: [{ to: s.token, data: '0x95d89b41' }, 'latest'] }, // symbol()
          { jsonrpc: '2.0', id: i * 3 + 2, method: 'eth_call', params: [{ to: s.token, data: '0x313ce567' }, 'latest'] }, // decimals()
        ]);
        const res = await postJson<{ id: number; result?: string; error?: unknown }[]>(chain.rpc, calls, { timeoutMs: 25000 });
        const byId = new Map(res.map((x) => [x.id, x]));
        entries.forEach((s, i) => {
          const allow = byId.get(i * 3)?.result;
          if (!allow || allow === '0x') return;
          let big: bigint | null = null;
          try { big = BigInt(allow); } catch { return; }
          if (big === 0n) return; // révoqué entre-temps
          const decRaw = byId.get(i * 3 + 2)?.result;
          const info: ApprovalInfo = {
            token: s.token,
            tokenSymbol: decodeString(byId.get(i * 3 + 1)?.result),
            spender: s.spender,
            allowanceRaw: allow,
            decimals: decRaw ? parseInt(decRaw, 16) : null,
          };
          approvals.push({ ...info, chain: chain.label, ...classifyApproval(info) });
        });
      } catch (e) {
        errors.push(`${chain.label} : ${(e as Error).message}`);
      }
    }),
  );

  return {
    approvals: approvals.filter((a) => a.active).sort((a, b) => Number(b.risky) - Number(a.risky)),
    errors,
    scannedTxs,
  };
}
