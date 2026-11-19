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

/** Routeurs / contrats usuels qu'il est normal d'avoir approuvés (illimité vers eux = OK). */
export const KNOWN_SPENDERS: string[] = [
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', // Uniswap V2 Router
  '0xe592427a0aece92de3edee1f18e0157c05861564', // Uniswap V3 Router
  '0x111111125421ca6dc452d289314280a0f8842a18', // Uniswap Universal Router
  '0x1111111254eeb25477b68fb85ed929f73a960582', // 1inch v5
  '0x11111112542d85b3ef69ae05771c2dccff4faa26', // 0x Exchange Proxy
  '0x000000000022d473030f116ddee9f6b43ac78ba3', // Permit2
  '0xdef171fe48cf0115b1d80b88dc8eab59176fee57', // Paraswap Augustus
].map((a) => a.toLowerCase());

export function isKnownSpender(spender: string): boolean {
  return KNOWN_SPENDERS.includes(spender.toLowerCase());
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
