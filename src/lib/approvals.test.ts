import { describe, expect, it } from 'vitest';
import { classifyApproval, humanAllowance, isKnownSpender, isUnlimited } from './approvals';

const MAX = `0x${'f'.repeat(64)}`;
const UNLIM = `0x${'8'.padStart(64, '0')}${'0'.repeat(63)}`; // 2^255

describe('approvals', () => {
  it('détecte l’illimité (>= 2^255) et décode l’allowance humaine', () => {
    expect(isUnlimited(MAX)).toBe(true);
    expect(isUnlimited(UNLIM)).toBe(true);
    expect(isUnlimited('0x0de0b6b3a7640000')).toBe(false); // 1e18
    expect(humanAllowance('0x0de0b6b3a7640000', 18)).toBeCloseTo(1);
    expect(humanAllowance('0x0de0b6b3a7640000', null)).toBeNull();
  });

  it('un spender connu n’est jamais risqué, même illimité', () => {
    expect(isKnownSpender('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D')).toBe(true); // casse différente
    const c = classifyApproval({ token: '0xt', tokenSymbol: 'USDC', spender: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', allowanceRaw: MAX, decimals: 6 });
    expect(c.active).toBe(true);
    expect(c.unlimited).toBe(true);
    expect(c.risky).toBe(false);
  });

  it('illimité vers un inconnu = risqué ; allowance nulle = inactif ; modérée vers inconnu = pas risqué', () => {
    expect(classifyApproval({ token: '0xt', tokenSymbol: 'X', spender: '0xdead000000000000000000000000000000000001', allowanceRaw: MAX, decimals: 18 }).risky).toBe(true);
    expect(classifyApproval({ token: '0xt', tokenSymbol: 'X', spender: '0xdead000000000000000000000000000000000001', allowanceRaw: '0x0', decimals: 18 }).active).toBe(false);
    // 100 tokens (10^20 raw, 18 décimales) vers un inconnu : actif mais pas « risqué »
    const c = classifyApproval({ token: '0xt', tokenSymbol: 'X', spender: '0xdead000000000000000000000000000000000001', allowanceRaw: '0x' + (100n * 10n ** 18n).toString(16).padStart(64, '0'), decimals: 18 });
    expect(c.active).toBe(true);
    expect(c.risky).toBe(false);
    expect(c.human).toBeCloseTo(100);
  });
});
