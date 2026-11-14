// Wallets recommandés : classés selon le portefeuille, sans ceux déjà suivis, adresses valides.
import { describe, expect, it } from 'vitest';
import { recommendSmartWallets, SMART_CATALOG } from './smartCatalog';

describe('SMART_CATALOG', () => {
  it('des adresses EVM valides, sans doublon', () => {
    for (const w of SMART_CATALOG) expect(w.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    const keys = SMART_CATALOG.map((w) => w.address.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('recommendSmartWallets', () => {
  const pf = [
    { coinId: 'bitcoin', symbol: 'btc', valueUsd: 3900, bucket: 'btc' as const },
    { coinId: 'ethereum', symbol: 'eth', valueUsd: 1000, bucket: 'eth' as const },
    { coinId: 'solana', symbol: 'sol', valueUsd: 200, bucket: 'large' as const },
    { coinId: 'tiny', symbol: 'tny', valueUsd: 50, bucket: 'small' as const },
  ];

  it('un détenteur d’ETH voit d’abord les acteurs d’Ethereum, avec la raison chiffrée', () => {
    const r = recommendSmartWallets(pf, []);
    expect(['vitalik', 'ef', 'ef-defi']).toContain(r[0].wallet.key);
    expect(r[0].reasons[0]).toMatch(/Tu détiens ETH \(19,4 %/);
  });

  it('les teneurs de marché remontent quand il y a des altcoins', () => {
    const r = recommendSmartWallets(pf, []);
    const wm = r.find((x) => x.wallet.key === 'wintermute');
    expect(wm?.score).toBeGreaterThan(0);
    expect(wm?.reasons.join(' ')).toMatch(/altcoins/);
  });

  it('un portefeuille 100 % Bitcoin ne reçoit pas de raison inventée pour les acteurs d’Ethereum', () => {
    const r = recommendSmartWallets([{ coinId: 'bitcoin', symbol: 'btc', valueUsd: 1000, bucket: 'btc' }], []);
    expect(r.find((x) => x.wallet.key === 'ef')?.score).toBe(0);
  });

  it('écarte les wallets déjà suivis (adresse insensible à la casse)', () => {
    const r = recommendSmartWallets(pf, [{ chain: 'eth', address: '0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045' }]);
    expect(r.map((x) => x.wallet.key)).not.toContain('vitalik');
  });

  it('l’intérêt pour les pépites suffit à proposer les investisseurs en petites capis', () => {
    const r = recommendSmartWallets([{ coinId: 'bitcoin', symbol: 'btc', valueUsd: 1000, bucket: 'btc' }], [], { likesGems: true });
    expect(r.find((x) => x.wallet.key === 'dwf')?.score).toBeGreaterThan(0);
  });
});
