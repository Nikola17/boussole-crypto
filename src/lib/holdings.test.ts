import { describe, expect, it } from 'vitest';
import { computeHoldings, computeTotals, type HoldingsInput } from './holdings';
import { buildPositions } from './portfolio';
import { coveredAccountIds, journalByAccount } from './accounts';
import type { Transaction } from '../types';
import type { WalletResult } from '../api/wallets';

const FX = 0.9; // euros pour 1 dollar

function tx(p: Partial<Transaction> & { id: string; type: Transaction['type']; coinId: string; quantity: number }): Transaction {
  return { symbol: p.coinId.slice(0, 3), name: p.coinId, date: '2026-01-01', price: 100, currency: 'USD', fee: 0, fxEurPerUsd: FX, ...p };
}

function wallet(id: string, holdings: { coinId: string; symbol: string; qty: number; priceUsd: number | null }[]): WalletResult {
  return {
    walletId: id, totalUsd: 0, errors: [], notes: [], fetchedAt: 0,
    holdings: holdings.map((h) => ({ chain: 'Bitcoin', symbol: h.symbol, name: h.symbol, quantity: h.qty, priceUsd: h.priceUsd, valueUsd: h.priceUsd == null ? null : h.priceUsd * h.qty, coingeckoId: h.coinId })),
  };
}

const MARKETS = new Map([
  ['bitcoin', { current_price: 80_000, price_change_percentage_24h: 2, market_cap_rank: 1 }],
  ['ethereum', { current_price: 2_400, price_change_percentage_24h: -1, market_cap_rank: 2 }],
]);

function input(txs: Transaction[], over: Partial<HoldingsInput> = {}): HoldingsInput {
  const accounts = over.accounts ?? [];
  const wallets = over.wallets ?? [];
  const walletData = over.walletData ?? [];
  const journal = journalByAccount(txs);
  const covered = coveredAccountIds(accounts as never, wallets as never, walletData.map((d) => !!d));
  return { positions: buildPositions(txs), markets: MARKETS, walletData, wallets, accounts, covered, journal, rate: 1, currency: 'USD', ...over };
}

describe('lignes du journal', () => {
  const txs = [tx({ id: '1', type: 'buy', coinId: 'bitcoin', quantity: 0.1, price: 60_000 })];

  it('valeur, coût et plus-value d’une ligne dont le prix est connu', () => {
    const [h] = computeHoldings(input(txs));
    expect(h.value).toBeCloseTo(8000);
    expect(h.cost).toBeCloseTo(6000);
    expect(h.pnl).toBeCloseTo(2000);
    expect(h.pnlPct).toBeCloseTo(33.33, 1);
    const t = computeTotals([h], buildPositions(txs), 'USD');
    expect(t.unrealized).toBeCloseTo(2000);
    expect(t.unrealizedPct).toBeCloseTo(33.33, 1);
    expect(t.unpriced).toBe(0);
  });

  it('prix inconnu : la valeur est 0 mais INCONNUE, la plus-value ne devient pas −100 %', () => {
    const t2 = [...txs, tx({ id: '2', type: 'buy', coinId: 'obscure', quantity: 1000, price: 1 })];
    const holdings = computeHoldings(input(t2));
    const obscure = holdings.find((h) => h.coinId === 'obscure')!;
    expect(obscure.priceUsd).toBeNull();
    expect(obscure.valueWithCost).toBeUndefined();
    expect(obscure.pnl).toBeUndefined();
    const totals = computeTotals(holdings, buildPositions(t2), 'USD');
    expect(totals.unpriced).toBe(1);
    expect(totals.cost).toBeCloseTo(6000); // le coût de la ligne sans prix n'est pas compté contre une valeur de 0
    expect(totals.unrealizedPct).toBeCloseTo(33.33, 1);
  });

  it('une variation de −100 % ne propage ni NaN ni Infinity', () => {
    const [h] = computeHoldings(input(txs));
    const totals = computeTotals([{ ...h, change24h: -100 }, { ...h, key: 'x', change24h: NaN }, { ...h, key: 'y', change24h: -150 }], buildPositions(txs), 'USD');
    for (const v of [totals.change24h, totals.change24hPct, totals.value, totals.unrealizedPct]) expect(Number.isFinite(v)).toBe(true);
  });

  it('portefeuille vide : tout est à zéro, rien n’est NaN', () => {
    const totals = computeTotals([], new Map(), 'EUR');
    expect(Object.values(totals).every((v) => Number.isFinite(v))).toBe(true);
    expect(totals.value).toBe(0);
  });
});

describe('journal et blockchain : jamais de double comptage', () => {
  const ledger = { id: 'ledger', name: 'Ledger', walletIds: ['wBtc', 'wEth'] };
  const wallets = [{ id: 'wBtc', label: 'Ledger BTC', includeInTotal: true }, { id: 'wEth', label: 'Ledger ETH', includeInTotal: true }];
  const txs = [
    tx({ id: '1', type: 'buy', coinId: 'bitcoin', quantity: 0.05, price: 60_000, accountId: 'ledger' }),
    tx({ id: '2', type: 'buy', coinId: 'ethereum', quantity: 0.4, price: 2_000, accountId: 'ledger' }),
  ];
  const btcWallet = wallet('wBtc', [{ coinId: 'bitcoin', symbol: 'BTC', qty: 0.05, priceUsd: 80_000 }]);
  const ethWallet = wallet('wEth', [{ coinId: 'ethereum', symbol: 'ETH', qty: 0.4, priceUsd: 2_400 }]);

  it('tous les wallets sont lus : la blockchain fait foi, le coût vient du journal, valeur comptée une fois', () => {
    const holdings = computeHoldings(input(txs, { accounts: [ledger], wallets, walletData: [btcWallet, ethWallet] }));
    expect(holdings.map((h) => h.source)).toEqual(['wallet', 'wallet']);
    expect(holdings.reduce((s, h) => s + h.value, 0)).toBeCloseTo(0.05 * 80_000 + 0.4 * 2_400);
    expect(holdings.find((h) => h.coinId === 'bitcoin')?.cost).toBeCloseTo(3000);
  });

  it('Bitcoin (clé publique) pas encore lu : l’Ethereum déjà lu n’est pas compté en double', () => {
    const holdings = computeHoldings(input(txs, { accounts: [ledger], wallets, walletData: [null, ethWallet] }));
    // le journal décrit encore les deux cryptos ; la ligne du wallet ETH ne s'y ajoute pas
    expect(holdings.filter((h) => h.coinId === 'ethereum')).toHaveLength(1);
    expect(holdings.find((h) => h.coinId === 'ethereum')?.source).toBe('ledger');
    expect(holdings.reduce((s, h) => s + h.value, 0)).toBeCloseTo(0.05 * 80_000 + 0.4 * 2_400);
  });

  it('wallet lu mais que le journal ne connaît pas pour ce compte : sa ligne est bien ajoutée', () => {
    const onlyBtc = [txs[0]];
    const holdings = computeHoldings(input(onlyBtc, { accounts: [ledger], wallets, walletData: [null, ethWallet] }));
    expect(holdings.find((h) => h.coinId === 'ethereum')?.source).toBe('wallet');
  });

  it('un wallet suivi sans compte s’ajoute au journal (c’est à toi de relier les deux)', () => {
    const noAccount = [tx({ id: '1', type: 'buy', coinId: 'bitcoin', quantity: 0.05, price: 60_000 })];
    const holdings = computeHoldings(input(noAccount, { accounts: [], wallets: [wallets[0]], walletData: [btcWallet] }));
    expect(holdings).toHaveLength(2); // c'est précisément ce que la détection de recouvrement signale
  });

  it('le wallet exclu du total n’est pas compté', () => {
    const holdings = computeHoldings(input([], { accounts: [], wallets: [{ ...wallets[0], includeInTotal: false }], walletData: [btcWallet] }));
    expect(holdings).toHaveLength(0);
  });
});

describe('une ligne par crypto', () => {
  it('une crypto détenue à deux endroits ne compte qu’une fois pour les poids', async () => {
    const { aggregateByCoin } = await import('./holdings');
    const txs = [tx({ id: '1', type: 'buy', coinId: 'bitcoin', quantity: 0.03, price: 60_000, accountId: 'cdc' })];
    const btcWallet = wallet('w', [{ coinId: 'bitcoin', symbol: 'BTC', qty: 0.05, priceUsd: 80_000 }]);
    const holdings = computeHoldings(input(txs, { accounts: [], wallets: [{ id: 'w', label: 'Ledger', includeInTotal: true }], walletData: [btcWallet] }));
    expect(holdings).toHaveLength(2);
    const lines = aggregateByCoin(holdings);
    expect(lines).toHaveLength(1);
    expect(lines[0].value).toBeCloseTo(0.08 * 80_000);
    expect(lines[0].sources.length).toBe(2);
  });
});
