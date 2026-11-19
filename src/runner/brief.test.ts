// Brief quotidien du runner : échéances du jour, valeur du journal, paliers, alertes armées, fraîcheur des données.

import { describe, expect, it } from 'vitest';
import type { BasketPlan, DcaPlan, Transaction } from '../types';
import type { SyncBundle } from '../lib/sync/merge';
import { actionableLines, buildBrief } from './brief';

const bundleOf = (data: Record<string, unknown>): SyncBundle => ({ data, deletions: [], stamps: {} });

const basket: BasketPlan = {
  id: 'bk1', name: 'Cœur', active: true, amountUsd: 25, daysOfWeek: [3], startDate: '2024-01-01',
  discoveryMaxPct: 20, core: [], discovery: [], reserveUsd: 0, minOrderUsd: 5, reminder: false, createdAt: '2024-01-01',
};

const plan: DcaPlan = {
  id: 'p1', coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', amount: 50, frequency: 'weekly', dayOfWeek: 3,
  strategy: 'classic', startDate: '2024-01-01', active: true, reminder: false, createdAt: '2024-01-01',
};

const solTx: Transaction = { id: 't1', coinId: 'solana', symbol: 'sol', name: 'Solana', date: '2026-01-10', type: 'buy', quantity: 100, price: 2, currency: 'USD', fee: 0, fxEurPerUsd: 0.87, updatedAt: '2026-01-10T00:00:00Z' };
const btcTx: Transaction = { ...solTx, id: 't2', coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', quantity: 1, price: 100_000 };

const prices = {
  bitcoin: { usd: 200_000, eur: 172_000, change: -1.5 },
  solana: { usd: 4, eur: 3.44, change: 6.2 },
};

// Mercredi 11 novembre 2026 (jour de panier ET de plan hebdo), 8 h heure locale.
const wednesday = new Date(2026, 10, 11, 8, 0, 0);

describe('brief du runner', () => {
  it('échéances du jour : panier et plan DCA, avec mention quand c’est déjà passé', () => {
    const brief = buildBrief({ now: wednesday, bundle: bundleOf({ basket: [basket], dcaPlans: [plan], transactions: [solTx] }), prices, fng: { value: 40, label: 'Peur' }, currency: 'EUR', syncSavedAt: '2026-11-10T18:02:00Z', syncDevice: 'pc-nico' });
    expect(brief).toContain('Aujourd’hui : panier « Cœur » (25 USDC) · DCA Bitcoin');
    const passed = buildBrief({ now: wednesday, bundle: bundleOf({ basket: [basket], dcaPlans: [plan], transactions: [solTx], basketExecutions: [{ id: 'e1', basketId: 'bk1', periodKey: '2026-11-11', date: '2026-11-11', orders: [], investedUsd: 0, reserveDeltaUsd: 0 }], dcaExecutions: [{ id: 'e2', planId: 'p1', periodKey: 'w-2026-11-9', date: '2026-11-11', amount: 50, price: 200_000, quantity: 0.00025, multiplier: 1 }] }), prices, fng: null, currency: 'EUR', syncSavedAt: null, syncDevice: null });
    expect(passed).toContain('panier « Cœur » (déjà passé aujourd’hui)');
    expect(passed).toContain('DCA Bitcoin (déjà passé aujourd’hui)');
  });

  it('un autre jour, la prochaine échéance est annoncée', () => {
    const thursday = new Date(2026, 10, 12, 8, 0, 0); // jeudi 12
    const brief = buildBrief({ now: thursday, bundle: bundleOf({ basket: [basket], dcaPlans: [plan], transactions: [] }), prices: {}, fng: null, currency: 'EUR', syncSavedAt: null, syncDevice: null });
    expect(brief).toContain('Prochaine échéance');
    expect(brief).toContain('panier « Cœur »');
    expect(brief).toContain('DCA Bitcoin');
  });

  it('marché, portefeuille du journal et variations 24 h ; une ligne sans prix connu est dite telle quelle', () => {
    const brief = buildBrief({ now: wednesday, bundle: bundleOf({ transactions: [solTx, btcTx, { ...solTx, id: 't3', coinId: 'jeton-x', symbol: 'xxxyz', name: 'Jeton X', quantity: 500 }] }), prices, fng: { value: 72, label: 'Avidité' }, currency: 'EUR', syncSavedAt: null, syncDevice: null });
    const lines = brief.split('\n');
    // 11 novembre : le CPI du lendemain figure dans l'horizon (une ligne) et sa conduite à tenir (une autre).
    expect(lines.length).toBeGreaterThanOrEqual(9);
    expect(lines[1]).toContain('Fear & Greed 72 (Avidité)');
    expect(lines[1]).toContain('BTC');
    expect(lines[2]).toContain('À l’horizon :');
    expect(lines[2]).toContain('Inflation US (CPI) demain');
    expect(lines[3]).toContain('Inflation US (CPI) — ');
    expect(lines[4]).toContain('Portefeuille (journal)');
    expect(lines[4]).toContain('1 ligne sans prix connu'); // jeton-x : pas de prix → jamais 0 €
    expect(lines[5]).toContain('BTC');
    expect(lines[5]).toContain('SOL');
    // Valeur : 1 BTC à 172 000 € + 100 SOL à 3,44 € = 172 344 € (BTC ≈ 100 %, arrondi, SOL 0 %)
    expect(lines[4]).toContain('172');
    expect(lines[5]).toContain('BTC 100 %');
  });

  it('paliers atteints non vendus et alertes armées ; fraîcheur de la synchronisation', () => {
    const withRung = buildBrief({ now: wednesday, bundle: bundleOf({ transactions: [solTx], alerts: [{ id: 'a1', coinId: 'solana', symbol: 'sol', name: 'Solana', condition: 'above', priceUsd: 3, createdAt: '2026-11-01T00:00:00Z', active: true }, { id: 'a2', coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', condition: 'below', priceUsd: 90_000, createdAt: '2026-11-01T00:00:00Z', active: true }] }), prices, fng: null, currency: 'USD', syncSavedAt: '2026-11-10T18:02:00Z', syncDevice: 'telephone-nico' });
    expect(withRung).toContain('Paliers atteints non vendus : SOL ×2 (vends 25 %)');
    expect(withRung).toContain('Alertes armées : 2');
    expect(withRung).toContain('Données de synchronisation');
    expect(withRung).toContain('telephone-nico');
  });

  it('rien de prévu : le brief le dit plutôt qu’un blanc', () => {
    const brief = buildBrief({ now: wednesday, bundle: bundleOf({ transactions: [solTx] }), prices, fng: null, currency: 'USD', syncSavedAt: null, syncDevice: null });
    expect(brief).toContain('Aucune échéance DCA programmée.');
  });

  it('conduite à tenir numérotée : échéances du jour en lignes actionnables', () => {
    const inputs = { now: wednesday, bundle: bundleOf({ basket: [basket], dcaPlans: [plan], transactions: [solTx] }), prices, fng: { value: 40, label: 'Peur' }, currency: 'EUR' as const, syncSavedAt: null, syncDevice: null };
    const brief = buildBrief(inputs);
    expect(brief).toContain('À faire aujourd’hui :');
    expect(brief).toMatch(/1\. Panier « Cœur » : 25 USDC à répartir/);
    expect(brief).toMatch(/2\. DCA Bitcoin : exécuter le versement prévu/);
    const actions = actionableLines(inputs);
    expect(actions[0]).toContain('Panier « Cœur »');
    expect(actions[1]).toContain('DCA Bitcoin');
  });

  it('quand tout est déjà exécuté, la conduite à tenir dit de ne rien faire hors plan', () => {
    const inputs = { now: wednesday, bundle: bundleOf({ basket: [basket], dcaPlans: [plan], transactions: [], basketExecutions: [{ id: 'e1', basketId: 'bk1', periodKey: '2026-11-11', date: '2026-11-11', orders: [], investedUsd: 0, reserveDeltaUsd: 0 }], dcaExecutions: [{ id: 'e2', planId: 'p1', periodKey: 'w-2026-11-9', date: '2026-11-11', amount: 50, price: 200_000, quantity: 0.00025, multiplier: 1 }] }), prices, fng: null, currency: 'EUR' as const, syncSavedAt: null, syncDevice: null };
    const actions = actionableLines(inputs);
    // panier et DCA déjà faits → plus d'échéance ; le CPI de demain reste l'action prioritaire
    expect(actions.some((a) => a.includes('CPI'))).toBe(true);
    expect(actions.some((a) => a.includes('Panier'))).toBe(false);
    const none = actionableLines({ ...inputs, now: new Date(2026, 10, 13, 8, 0, 0), bundle: bundleOf({ transactions: [] }) });
    expect(none).toEqual(['Aucune échéance aujourd’hui : ne rien exécuter, aucune vente hors plan de sortie.']);
  });

  it('palier atteint = ligne actionnable « vendre X % »', () => {
    const inputs = { now: wednesday, bundle: bundleOf({ transactions: [solTx], alerts: [] }), prices, fng: null, currency: 'USD' as const, syncSavedAt: null, syncDevice: null };
    const actions = actionableLines(inputs);
    expect(actions.some((a) => a.includes('SOL ×2') && a.includes('vendre 25 %'))).toBe(true);
  });
});
