// Approvals ERC-20 : classification pure (testée) — un approval actif vers un spender inconnu
// et illimité (ou énorme) est un risque : c'est la porte ouverte à un contrat malveillant.

export interface ApprovalInfo {
  token: string; // adresse du contrat du token
  tokenSymbol: string | null;
  spender: string; // adresse autorisée à dépenser
  allowanceRaw: string; // hex 0x…
  decimals: number | null;
}

/** Au-delà de 2^255, l'allowance est considérée comme « illimitée » (max uint256). */
export const UNLIMITED_THRESHOLD = 2n ** 255n;

export function allowanceBig(raw: string): bigint | null {
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export function isUnlimited(raw: string): boolean {
  const v = allowanceBig(raw);
  return v != null && v >= UNLIMITED_THRESHOLD;
}

/** Allowance en unités humaines (null si decimals inconnu). */
export function humanAllowance(raw: string, decimals: number | null): number | null {
  const v = allowanceBig(raw);
  if (v == null || decimals == null) return null;
  return Number(v) / 10 ** decimals;
}

/** Routeurs / contrats usuels vérifiés (DEX & agrégateurs majeurs) qu'il est normal d'avoir approuvés. */
export const KNOWN_SPENDER_NAMES: Record<string, string> = {
  // Uniswap
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Uniswap V2 Router',
  '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router',
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap SwapRouter02',
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap Universal Router',
  '0x111111125421ca6dc452d289314280a0f8842a18': '1inch v6 / Universal Router',
  '0x000000000022d473030f116ddee9f6b43ac78ba3': 'Permit2 (Uniswap)',
  // 1inch & Agrégateurs (0x / Matcha, Velora / ParaSwap, CoW Swap, KyberSwap)
  '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch v5 Router',
  '0x11111112542d85b3ef69ae05771c2dccff4faa26': '0x / Matcha Exchange Proxy',
  '0xdef1c0ded9bec7f1a1670819833240f027b25eff': '0x / Matcha Exchange Proxy',
  '0xdef171fe48cf0115b1d80b88dc8eab59176fee57': 'Velora (ParaSwap) Augustus v5',
  '0x6a000f20005980200259b80c5102003040001068': 'Velora (ParaSwap) Augustus v6',
  '0xc92e8bdf79f0507f65a392b0ab4667716bfe0110': 'CoW Swap VaultRelayer',
  '0x6131b5fae19ea4f9d964eac0408e4408b66337b5': 'KyberSwap MetaRouter v2',
  // PancakeSwap
  '0x10ed43c718714eb63d5aa57b78b54704e256024e': 'PancakeSwap V2 Router',
  '0x13f4ea83d0bd40e75c8222255bc855a974568dd4': 'PancakeSwap SmartRouter V3',
  // SushiSwap, Balancer, Curve
  '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f': 'SushiSwap V2 Router',
  '0xba12222222228d8ba445958a75a0704d566bf2c8': 'Balancer V2 Vault',
  '0xf0d4c12a5768d806021f80a262b4d39d26c58b8d': 'Curve Router',
  // Aerodrome, Velodrome, Camelot, QuickSwap, LFJ (Trader Joe)
  '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43': 'Aerodrome Router (Base)',
  '0xa062ae8a9c5e11aaa026fc2670b0d65ccc8b2858': 'Velodrome Router (Optimism)',
  '0xc873fecbd354f5a56e00e710b90ef4201db2448d': 'Camelot Router (Arbitrum)',
  '0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff': 'QuickSwap Router (Polygon)',
  '0xb4315e873dbcf96ffd0acd8ea43f689d8c20fb30': 'LFJ (Trader Joe) LBRouter',
  // GMX, Maverick, DODO, WOOFi, Hashflow, Bancor, SpookySwap, SyncSwap
  '0xabbc5f99639c9b6bcb58544ddf04efa6802f4064': 'GMX V1 Router',
  '0x7c68c7866a64fa2160f78eeae12217ffbf871fa8': 'GMX V2 ExchangeRouter',
  '0x6c6e9d5b2016c1d30d9c834c0166d3448f3d2380': 'Maverick Router',
  '0x6d310348d5c12009854dfcf72e0df9027e8cb4f4': 'DODO ApproveProxy',
  '0x4c4af8dbc524681930a27b2f1af5bcc8062e6fb7': 'WOOFi Router',
  '0x55084ee0fcef0bcd9b08e0c93f16d476c3f6f46e': 'Hashflow Router',
  '0xeef417e1d5cc832e619ae18d2f140de2999dd4fb': 'Bancor Network',
  '0xf491e7b69e4244ad4002bc14e878a34207e38c29': 'SpookySwap Router',
  '0x2da10a1e27bf85cedd8ffb1abbe97e53391c0295': 'SyncSwap Router (zkSync)',
};

export const KNOWN_SPENDERS: string[] = Object.keys(KNOWN_SPENDER_NAMES);

export function spenderName(spender: string): string | null {
  return KNOWN_SPENDER_NAMES[spender.toLowerCase()] ?? null;
}

export function isKnownSpender(spender: string): boolean {
  return spenderName(spender) !== null;
}

export interface ClassifiedApproval {
  active: boolean;
  unlimited: boolean;
  /** Actif + (illimité ou > 1 000 000 unités) + spender non reconnu → à révoquer. */
  risky: boolean;
  human: number | null;
}

export function classifyApproval(a: ApprovalInfo): ClassifiedApproval {
  const v = allowanceBig(a.allowanceRaw);
  const active = v != null && v > 0n;
  const unlimited = isUnlimited(a.allowanceRaw);
  const human = humanAllowance(a.allowanceRaw, a.decimals);
  const big = human != null && human > 1_000_000;
  return {
    active,
    unlimited,
    human,
    risky: active && !isKnownSpender(a.spender) && (unlimited || big),
  };
}
