import { describe, expect, it } from 'vitest';
import { makeAvailability, statusOf } from './availability';
import { buySamplesFrom, priceUsdOf, spreadStats } from './fees';
import type { Transaction } from '../types';

describe('disponibilité sur Crypto.com', () => {
  const coins = [
    { id: 'sui', symbol: 'sui', market_cap_rank: 40 },
    { id: 'fake-sui', symbol: 'sui', market_cap_rank: null },
    { id: 'pepe-clone', symbol: 'pepe', market_cap_rank: 900 },
    { id: 'tether', symbol: 'usdt', market_cap_rank: 3 },
    { id: 'usd-coin', symbol: 'usdc', market_cap_rank: 7 },
    { id: 'obscure', symbol: 'xyz', market_cap_rank: 300 },
  ];

  it('retient la crypto la mieux classée pour chaque ticker listé', () => {
    const ids = makeAvailability(['SUI', 'PEPE'], coins);
    expect(ids.has('sui')).toBe(true);
    expect(ids.has('fake-sui')).toBe(false);
    expect(ids.has('pepe-clone')).toBe(true); // seul candidat
    expect(ids.has('obscure')).toBe(false);
  });

  it('les stablecoins courants sont toujours disponibles', () => {
    const ids = makeAvailability([], coins);
    expect(ids.has('usd-coin')).toBe(true);
    expect(ids.has('tether')).toBe(true);
  });

  it("statut : confirmé dans l'application > listé sur l'Exchange > inconnu", () => {
    const ids = new Set(['sui']);
    expect(statusOf('sui', ids, [])).toBe('exchange');
    expect(statusOf('sui', ids, ['sui'])).toBe('app');
    expect(statusOf('obscure', ids, ['obscure'])).toBe('app');
    expect(statusOf('obscure', ids, [])).toBe('unknown');
  });
});

describe('frais réels (écart au cours du marché)', () => {
  const s = (amountUsd: number, priceUsd: number, refUsd: number, time = '2025-01-01T10:00:00Z') => ({ txId: time + amountUsd, symbol: 'SUI', time, amountUsd, priceUsd, refUsd });

  it('un achat à +1 % coûte 1 % de plus que le cours', () => {
    const r = spreadStats([s(101, 1.01, 1)]);
    expect(r.avgPct).toBeCloseTo(1, 6);
    expect(r.overpaidUsd).toBeCloseTo(1, 6); // 101 dépensés pour une valeur de 100
    expect(r.medianPct).toBeCloseTo(1, 6);
  });

  it('pondère par les montants et estime un coût annuel dès 30 jours de recul', () => {
    const r = spreadStats([s(1000, 1.02, 1, '2025-01-01T00:00:00Z'), s(10, 1.1, 1, '2025-07-01T00:00:00Z')]);
    expect(r.avgPct).toBeGreaterThan(1.9);
    expect(r.avgPct).toBeLessThan(2.1); // dominé par le gros achat
    expect(r.perYearUsd).not.toBeNull();
    expect(r.spanDays).toBeCloseTo(181, 0);
    expect(spreadStats([s(100, 1.01, 1)]).perYearUsd).toBeNull();
  });

  it('exclut les écarts aberrants (> 15 %) au lieu de fausser la moyenne', () => {
    const r = spreadStats([s(100, 1.01, 1), s(100, 2, 1)]);
    expect(r.n).toBe(1);
    expect(r.excluded).toBe(1);
  });

  it("convertit les euros au taux de l'opération et ne retient que les achats importés datés", () => {
    const base = { name: 'Sui', coinId: 'sui', symbol: 'sui', quantity: 10, fee: 0, date: '2025-01-01' };
    const eur = { ...base, id: '1', type: 'buy', price: 0.9, currency: 'EUR', fxEurPerUsd: 0.9, time: '2025-01-01T10:00:00Z', source: 'import' } as Transaction;
    expect(priceUsdOf(eur)).toBeCloseTo(1);
    const manual = { ...eur, id: '2', source: 'manual' } as Transaction;
    const noTime = { ...eur, id: '3', time: undefined } as Transaction;
    const stable = { ...eur, id: '4', symbol: 'usdc' } as Transaction;
    expect(buySamplesFrom([eur, manual, noTime, stable]).map((t) => t.id)).toEqual(['1']);
  });
});
