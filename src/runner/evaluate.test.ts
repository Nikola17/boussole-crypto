// Paliers de vente vus par le runner : recalculés depuis le journal de l'application (fonctions pures).

import { describe, expect, it } from 'vitest';
import type { PriceAlert, Transaction } from '../types';
import type { SyncBundle } from '../lib/sync/merge';
import { alertKey, alertMessage, consumeAlerts, hitAlerts, hitRungs, priceLabel, rungKey, rungMessage, watchOf, zoneMessage, type MessageCurrency, type WatchData } from './evaluate';

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', coinId: 'solana', symbol: 'sol', name: 'Solana', date: '2026-01-10', type: 'buy',
  quantity: 100, price: 2, currency: 'USD', fee: 0, fxEurPerUsd: 0.87, updatedAt: '2026-01-10T00:00:00Z', ...over,
});

const watch = (over: Partial<WatchData> = {}): WatchData => ({ alerts: [], transactions: [], exitSteps: {}, exitDone: {}, paperTrades: [], paperPortfolios: [], paperOrders: [], paperDays: [], smartWallets: [], watchedTokens: [], unlocks: [], vacationUntil: null, ...over });

const bundleOf = (data: Record<string, unknown>): SyncBundle => ({ data, deletions: [], stamps: {} });

describe('paliers de vente du runner (journal)', () => {
  it('un palier ×2 atteint sur une altcoin est signalé, avec la valeur de la tranche', () => {
    const prices = new Map([['solana', 4]]); // coût moyen 2 $ : paliers ×2, ×3, ×5 ; seul ×2 est atteint
    const rungs = hitRungs(watch({ transactions: [tx()] }), prices);
    expect(rungs).toHaveLength(1);
    expect(rungs[0]).toMatchObject({ coinId: 'solana', symbol: 'sol', multiple: 2, pct: 25, targetUsd: 4 });
    expect(rungs[0].valueUsd).toBe(100); // 25 % de 100 SOL à 4 $ = 100 $
    const cur: MessageCurrency = { currency: 'EUR', eurPerUsd: 0.86 };
    expect(rungMessage(rungs[0], cur)).toContain('Palier ×2 atteint sur SOL');
    expect(rungMessage(rungs[0], cur)).toContain('25 %');
    expect(rungMessage(rungs[0], cur)).toContain('86'); // ≈ 86 € à vendre, pas 100 $
    expect(rungMessage(rungs[0], { currency: 'USD', eurPerUsd: 0.86 })).toContain('$US'); // 100 $US
  });

  it('un palier déjà vendu, ou sous 20 $ de valeur, n’est pas signalé', () => {
    const w = watch({ transactions: [tx()], exitDone: { solana: [2] } });
    expect(hitRungs(w, new Map([['solana', 5]]))).toHaveLength(0); // ×2 vendu ; ×3 (6 $) pas atteint à 5 $
    const small = watch({ transactions: [tx({ quantity: 2, price: 2 })] }); // 4 $ ; tranche ×2 ≈ 2 $ < seuil de 20 $
    expect(hitRungs(small, new Map([['solana', 4]]))).toHaveLength(0);
  });

  it('des paliers personnalisés remplacent l’échelle par défaut ; BTC, ETH et stablecoins n’ont pas de paliers', () => {
    const prices = new Map([['solana', 3], ['bitcoin', 200_000], ['ethereum', 9_000], ['usd-coin', 1]]);
    const w = watch({ exitSteps: { solana: [{ multiple: 1.5, pct: 50 }] }, exitDone: {}, transactions: [
      tx(),
      tx({ id: 't2', coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', price: 100_000, quantity: 1 }),
      tx({ id: 't3', coinId: 'ethereum', symbol: 'eth', name: 'Ethereum', price: 4_000, quantity: 10 }),
      tx({ id: 't4', coinId: 'usd-coin', symbol: 'usdc', name: 'USDC', price: 1, quantity: 5_000 }),
    ] });
    const rungs = hitRungs(w, prices);
    expect(rungs).toHaveLength(1); // SOL ×1,5 atteint (3 $ ≥ 3 $) ; BTC/ETH/USDC : jamais de paliers
    expect(rungs[0]).toMatchObject({ multiple: 1.5, pct: 50 });
  });

  it('sans prix connu, ou sans coût connu, rien n’est signalé (on n’invente jamais)', () => {
    expect(hitRungs(watch({ transactions: [tx()] }), new Map())).toHaveLength(0);
    // Un dépôt sans prix d’achat : coût nul → pas de multiple, donc pas de palier.
    expect(hitRungs(watch({ transactions: [tx({ type: 'deposit', price: 0 })] }), new Map([['solana', 4]]))).toHaveLength(0);
  });
});

describe('consommation des alertes dans la synchronisation', () => {
  const nb = { id: 'a1', coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', condition: 'above' as const, priceUsd: 100_000, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', active: true };
  const alerts = (a: PriceAlert[]) => a;
  const armed: PriceAlert[] = [nb as PriceAlert];

  it('marque déclenchée + inactive + datée chaque alerte consommée, sans toucher au faisceau reçu', () => {
    const bundle = bundleOf({ alerts: alerts([...armed, { id: 'a2', coinId: 'ethereum', symbol: 'eth', name: 'Ethereum', condition: 'below', priceUsd: 9_000, createdAt: '2026-11-01T00:00:00Z', active: true }]) });
    const copy = JSON.parse(JSON.stringify(bundle)) as SyncBundle;
    const out = consumeAlerts(bundle, ['a1'], '2026-11-10T09:00:00Z');
    const a1 = (out.data.alerts as PriceAlert[]).find((a) => a.id === 'a1');
    const a2 = (out.data.alerts as PriceAlert[]).find((a) => a.id === 'a2');
    expect(a1).toMatchObject({ triggeredAt: '2026-11-10T09:00:00Z', active: false, updatedAt: '2026-11-10T09:00:00Z' });
    expect(a2?.triggeredAt).toBeUndefined();
    expect(bundle).toEqual(copy); // l'original n'est jamais modifié (il doit repartir identique en cas de conflit)
  });

  it('une alerte déjà déclenchée ou inconnue ne change rien : le faisceau est renvoyé tel quel', () => {
    const bundle = bundleOf({ alerts: armed });
    const done = bundleOf({ alerts: alerts([{ ...(armed[0] as PriceAlert), triggeredAt: '2026-11-09T00:00:00Z', active: false }]) });
    expect(consumeAlerts(done, [armed[0].id], '2026-11-10T09:00:00Z')).toBe(done);
    expect(consumeAlerts(bundle, ['inconnu'], '2026-11-10T09:00:00Z')).toBe(bundle);
    expect(consumeAlerts(bundle, [], 'now')).toBe(bundle);
  });
});

describe('messages d’alerte', () => {
  it('markAlerts et clés de dédoublonnage stables', () => {
    const a: PriceAlert = { id: 'a1', coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', condition: 'above', priceUsd: 100_000, createdAt: '2026-11-01T00:00:00Z', active: true };
    expect(alertKey('a1')).toBe('alert:a1');
    expect(rungKey('solana', 2)).toBe('exit:solana:2');
    const msg = alertMessage(a, 105_000, { currency: 'USD', eurPerUsd: 0.92 });
    expect(msg.split('\n')[0]).toBe('Alerte BTC');
    expect(msg).toContain('au-dessus');
    expect(msg).toContain('105');
    // En euros : l'alerte créée en dollars est présentée dans la devise de l'utilisateur (≈ 96 600 €).
    const eur = alertMessage(a, 105_000, { currency: 'EUR', eurPerUsd: 0.92 }).replace(/\s| | /g, '');
    expect(eur).toContain('96600€');
  });

  it('une alerte consommée n’est plus surveillée au cycle suivant', () => {
    const prices = new Map([['bitcoin', 300_000]]);
    const w = watch({ alerts: [{ id: 'a1', coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', condition: 'above', priceUsd: 100_000, createdAt: '2026-11-01T00:00:00Z', active: true }] });
    expect(hitAlerts(w, prices)).toHaveLength(1);
    const consumed = consumeAlerts(bundleOf({ alerts: w.alerts }), ['a1'], '2026-11-10T09:00:00Z');
    expect(hitAlerts(watchOf(consumed), prices)).toHaveLength(0);
  });
});

describe('prix et zone dans la devise de l’utilisateur', () => {
  it('priceLabel convertit en euros via le taux, ou laisse en dollars', () => {
    expect(priceLabel(100, { currency: 'EUR', eurPerUsd: 0.9 })).toContain('90');
    expect(priceLabel(100, { currency: 'USD', eurPerUsd: 0.9 })).toContain('100');
  });

  it('un changement de zone nomme la nouvelle zone, la température et la marche à suivre', () => {
    const msg = zoneMessage({ label: 'Euphorie', action: 'Prends des profits progressivement.' }, 84, 'Marché chaud');
    expect(msg.split('\n')[0]).toBe('Le marché change de zone : Euphorie');
    expect(msg).toContain('84/100');
    expect(msg).toContain('Marché chaud');
    expect(msg).toContain('Prends des profits');
  });
});
