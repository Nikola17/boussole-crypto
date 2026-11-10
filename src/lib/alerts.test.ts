import { describe, expect, it } from 'vitest';
import { alertCoinsToFetch, checkPriceAlerts, watchedAlerts } from './alerts';
import type { PriceAlert } from '../types';

const alert = (over: Partial<PriceAlert> = {}): PriceAlert => ({
  id: 'a1', coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', condition: 'above', priceUsd: 100_000, active: true, createdAt: '2026-11-01T00:00:00Z', ...over,
});

describe('alertes de prix', () => {
  it('au-dessus / en dessous : atteinte au seuil exact', () => {
    const prices = new Map([['bitcoin', 100_000], ['sui', 0.5]]);
    expect(checkPriceAlerts([alert()], prices)).toEqual([{ alert: alert(), price: 100_000 }]);
    expect(checkPriceAlerts([alert({ priceUsd: 100_001 })], prices)).toEqual([]);
    expect(checkPriceAlerts([alert({ id: 'b', coinId: 'sui', condition: 'below', priceUsd: 0.5 })], prices)).toHaveLength(1);
    expect(checkPriceAlerts([alert({ id: 'b', coinId: 'sui', condition: 'below', priceUsd: 0.4 })], prices)).toEqual([]);
  });

  it('une alerte désactivée ou déjà déclenchée est ignorée', () => {
    const prices = new Map([['bitcoin', 200_000]]);
    expect(checkPriceAlerts([alert({ active: false }), alert({ id: 'b', triggeredAt: '2026-11-02T00:00:00Z' })], prices)).toEqual([]);
    expect(watchedAlerts([alert(), alert({ id: 'b', active: false })])).toHaveLength(1);
  });

  it('un prix inconnu ou absurde ne déclenche jamais rien', () => {
    expect(checkPriceAlerts([alert()], new Map())).toEqual([]);
    expect(checkPriceAlerts([alert({ condition: 'below', priceUsd: 5 })], new Map([['bitcoin', 0]]))).toEqual([]);
    expect(checkPriceAlerts([alert({ condition: 'below', priceUsd: 5 })], new Map([['bitcoin', NaN]]))).toEqual([]);
  });

  it('les cryptos hors du top 250 sont demandées à part (sans doublon), les autres non', () => {
    const known = new Set(['bitcoin', 'ethereum']);
    const alerts = [alert(), alert({ id: 'b', coinId: 'petit-jeton' }), alert({ id: 'c', coinId: 'petit-jeton' }), alert({ id: 'd', coinId: 'autre', active: false }), alert({ id: 'e', coinId: 'zzz' })];
    expect(alertCoinsToFetch(alerts, known)).toEqual(['petit-jeton', 'zzz']);
  });
});
