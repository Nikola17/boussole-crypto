// Smart money : parse des transactions (Solana, EVM), rapprochement avec la liste de tokens de l'utilisateur,
// messages et lignes de brief. Le réseau (RPC, Blockscout) vit ailleurs ; ici tout est déterministe.

import { describe, expect, it } from 'vitest';
import { eventKey, evmDeltas, refsOf, relevantEvents, smartBriefLines, smartMessage, solanaDeltas, tokenMatches, type SmartEvent } from './smartmoney';
import type { SmartWallet } from '../types';

const wallet: SmartWallet = { id: 'w1', label: 'Fonds Test', chain: 'solana', address: 'WALTaaaa', kind: 'fund', addedAt: '2026-11-01' };

describe('solanaDeltas', () => {
  it('voit un achat : le wallet reçoit des tokens (compte créé pendant la transaction)', () => {
    const deltas = solanaDeltas({
      signature: 'sig1', blockTime: 1_760_000_000,
      meta: {
        preTokenBalances: [
          { accountIndex: 2, mint: 'MINTB', owner: 'AUTRE', uiTokenAmount: { uiAmount: 100 } },
          // compte existant sans owner sur la ligne « avant » (RPC avare) : le même index « après » le donne
          { accountIndex: 1, mint: 'MINTC', uiTokenAmount: { uiAmount: 100 } },
        ],
        postTokenBalances: [
          { accountIndex: 1, mint: 'MINTA', owner: 'WALTaaaa', uiTokenAmount: { uiAmount: 500 } }, // compte créé : absent « avant »
          { accountIndex: 2, mint: 'MINTB', owner: 'AUTRE', uiTokenAmount: { uiAmount: 300 } },
          { accountIndex: 3, mint: 'MINTC', owner: 'WALTaaaa', uiTokenAmount: { uiAmount: 150 } },
        ],
      },
    }, 'WALTaaaa');
    // MINTA : achat net de 500 (compte créé) ; MINTC : owner retrouvé par index → +50 ; MINTB : pas à ce wallet.
    expect(deltas).toHaveLength(2);
    expect(deltas.find((d) => d.mint === 'MINTA')).toMatchObject({ delta: 500, hash: 'sig1' });
    expect(deltas.find((d) => d.mint === 'MINTC')).toMatchObject({ delta: 50 });
  });

  it('voit une vente et ignore un déplacement entre ses propres comptes', () => {
    const deltas = solanaDeltas({
      signature: 'sig2', blockTime: 1_760_000_900,
      meta: {
        preTokenBalances: [
          { accountIndex: 1, mint: 'MINTA', owner: 'WALTaaaa', uiTokenAmount: { uiAmount: 900 } },
          { accountIndex: 3, mint: 'MINTC', owner: 'WALTaaaa', uiTokenAmount: { uiAmount: 5 } },
        ],
        postTokenBalances: [
          { accountIndex: 1, mint: 'MINTA', owner: 'WALTaaaa', uiTokenAmount: { uiAmount: 100 } },
          { accountIndex: 4, mint: 'MINTC', owner: 'WALTaaaa', uiTokenAmount: { uiAmount: 5 } }, // déplacé (index 3 → 4), pas vendu
        ],
      },
    }, 'WALTaaaa');
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ mint: 'MINTA', delta: -800 });
  });

  it('cumule plusieurs comptes du même mint : le net fait foi', () => {
    const deltas = solanaDeltas({
      signature: 'sig3', blockTime: 1_760_000_000,
      meta: {
        preTokenBalances: [{ accountIndex: 1, mint: 'M', owner: 'WALTaaaa', uiTokenAmount: { uiAmount: 10 } }, { accountIndex: 2, mint: 'M', owner: 'WALTaaaa', uiTokenAmount: { uiAmount: 20 } }],
        postTokenBalances: [{ accountIndex: 1, mint: 'M', owner: 'WALTaaaa', uiTokenAmount: { uiAmount: 35 } }, { accountIndex: 2, mint: 'M', owner: 'WALTaaaa', uiTokenAmount: { uiAmount: 20 } }],
      },
    }, 'WALTaaaa');
    expect(deltas).toEqual([{ mint: 'M', delta: 25, atMs: 1_760_000_000_000, hash: 'sig3' }]);
  });
});

describe('evmDeltas (Blockscout)', () => {
  it('distingue achats et ventes, convertit les décimales, ignore les NFT', () => {
    const w: SmartWallet = { ...wallet, chain: 'eth', address: '0xAAA' };
    const rows = [
      { token: { address: '0xT1', symbol: 'T1', name: 'Token 1', decimals: 18, type: 'ERC-20' }, total: { value: (5e18).toString() }, from: { hash: '0xOTHER' }, to: { hash: '0xaaa' }, timestamp: '2026-11-13T10:00:00Z', tx_hash: '0xTxa' },
      { token: { address: '0xT2', symbol: 'T2', name: 'Token 2', decimals: 6, type: 'ERC-20' }, total: { value: '2000000' }, from: { hash: '0xAaA' }, to: { hash: '0xBUYER' }, timestamp: '2026-11-13T11:00:00Z', tx_hash: '0xTxb' },
      { token: { address: '0xNFT', symbol: 'X', name: 'NFT', type: 'ERC-721' }, total: { value: '1' }, from: { hash: '0xOTHER' }, to: { hash: '0xAAA' }, timestamp: '2026-11-13T12:00:00Z', tx_hash: '0xTxc' },
    ];
    const deltas = evmDeltas(rows, w);
    expect(deltas).toHaveLength(2);
    expect(deltas[0]).toMatchObject({ mint: '0xt1', delta: 5, symbol: 'T1' });
    expect(deltas[1]).toMatchObject({ mint: '0xt2', delta: -2, symbol: 'T2' });
  });

  it('un aller-retour dans la même transaction s\'annule (ni achat ni vente)', () => {
    const w: SmartWallet = { ...wallet, chain: 'eth', address: '0xAAA' };
    const rows = [
      { token: { address: '0xT1', symbol: 'T1', decimals: 0, type: 'ERC-20' }, total: { value: '400' }, from: { hash: '0xPOOL' }, to: { hash: '0xAAA' }, timestamp: '2026-11-13T10:00:00Z', tx_hash: '0xTx1' },
      { token: { address: '0xT1', symbol: 'T1', decimals: 0, type: 'ERC-20' }, total: { value: '400' }, from: { hash: '0xAAA' }, to: { hash: '0xPOOL' }, timestamp: '2026-11-13T10:00:00Z', tx_hash: '0xTx1' },
    ];
    expect(evmDeltas(rows, w)).toHaveLength(0);
  });
});

describe('rapprochement avec la liste de tokens', () => {
  const buy: SmartEvent = { walletId: 'w1', walletLabel: 'Fonds Test', chain: 'solana', side: 'buy', mint: 'MintA', symbol: 'ABC', name: null, uiAmount: 10, txHash: 'h1', atMs: 1_000 };
  const sell: SmartEvent = { walletId: 'w1', walletLabel: 'Fonds Test', chain: 'eth', side: 'sell', mint: '0xt9', symbol: 'T9', name: null, uiAmount: 4, txHash: 'h2', atMs: 2_000 };

  it('adresse exacte sur la bonne chaîne (eth ↔ ethereum), ou symbole', () => {
    expect(tokenMatches(buy, [{ chain: 'solana', address: 'mintA', symbol: 'X' }])).toBe(true);
    expect(tokenMatches(sell, [{ chain: 'ethereum', address: '0xT9', symbol: 'X' }])).toBe(true);
    expect(tokenMatches(sell, [{ chain: 'bsc', address: '0xt9', symbol: 'X' }])).toBe(false); // bonne adresse, mauvaise chaîne
    expect(tokenMatches(buy, [{ symbol: 'abc' }])).toBe(true); // même symbole, casse indifférente
    expect(tokenMatches(buy, [{ symbol: 'ZZZ' }])).toBe(false);
  });

  it('refsOf mêle watchlist DEX, positions du journal et alertes armées, sans vide ni doublon exact', () => {
    const refs = refsOf({
      watched: [{ id: '1', chainId: 'base', address: '0x1', symbol: 'ABC' }],
      positions: [{ symbol: 'POS' }],
      alerts: [{ symbol: 'ALM', active: true }, { symbol: 'OLD', active: false, triggeredAt: null }],
    });
    expect(refs).toEqual([{ chain: 'base', address: '0x1', symbol: 'ABC' }, { symbol: 'POS' }, { symbol: 'ALM' }]);
  });

  it('relevantEvents ne garde que ce qui touche ta liste', () => {
    const out = relevantEvents([buy, sell], [{ symbol: 'abc' }]);
    expect(out).toEqual([buy]);
  });
});

describe('messages et brief', () => {
  const sell: SmartEvent = { walletId: 'w1', walletLabel: 'Fonds Test', chain: 'solana', side: 'sell', mint: 'MintA', symbol: 'ABC', name: 'Abc', uiAmount: 12.5, txHash: 'h1', atMs: Date.now() - 30 * 60_000 };
  const buy: SmartEvent = { ...sell, side: 'buy', atMs: Date.now() - 120 * 60_000 };

  it('la vente dit bien ce qu\'il faut faire : relire sa sortie', () => {
    const text = smartMessage(sell);
    expect(text).toContain('Fonds Test VEND ABC');
    expect(text).toContain('12.50 ABC');
    expect(text).toContain('plan de sortie');
  });

  it('l\'achat reste prudent : imiter n\'est pas acheter tout d\'un coup', () => {
    const text = smartMessage(buy);
    expect(text).toContain('achète ABC');
    expect(text).not.toContain('VEND');
  });

  it('le brief garde 24 h, ventes d\'abord, au plus 4 lignes', () => {
    const old = { ...buy, atMs: Date.now() - 3 * 24 * 3600_000 };
    const lines = smartBriefLines([old, buy, sell], Date.now());
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('A vendu 12.50 ABC — Fonds Test');
    expect(lines[1]).toContain('A acheté 12.50 ABC — Fonds Test');
  });

  it('eventKey dédoublonne par wallet, transaction et token', () => {
    expect(eventKey(sell)).toBe(`sm:w1:${sell.txHash}:${sell.mint}`);
    // Un même mouvement garde la même clé de côté à l'autre : le dédoublonnage porte le mouvement, pas son libellé.
    expect(eventKey({ ...sell, walletId: 'w2' })).not.toBe(eventKey(sell));
  });
});
