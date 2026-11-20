import { describe, expect, it } from 'vitest';
import { buildCopyTickets, exchangeLinks, formatCopyTicketText } from './copyTickets';
import type { PaperDayLog, PaperPortfolio, TradeEntry } from '../../types';

const portfolio: PaperPortfolio = {
  id: 'auto-1', name: 'Retour à la moyenne', kind: 'auto', startingUsd: 1000, createdAt: '2026-10-01T00:00:00Z',
  costs: { preset: 'exchange', feePct: 0.1, spreadPct: 0.05 }, strategyId: 'mean-reversion-daily',
};

const dayLog = (day: string, side: 'buy' | 'sell'): PaperDayLog => ({
  id: `auto-1:${day}`, portfolioId: 'auto-1', day, decidedOn: '2026-11-19', rules: 'r1', depositUsd: 0,
  fills: [{
    coinId: 'solana', symbol: 'sol', name: 'Solana', side, kind: side === 'buy' ? 'limit' : 'market',
    quantity: 1, marketUsd: 200, priceUsd: 200, feeUsd: 0.2, at: `${day}T08:00:00.000Z`,
    reason: 'Repli RSI2', stop: 180, target: 260,
  }],
  skipped: [], by: 'vps',
});

describe('tickets de copie quotidiens', () => {
  it('génère les tickets récents, calcule le sizing réel et met en avant les clôtures urgentes', () => {
    const openTrade: TradeEntry = {
      id: 'tr-1', coinId: 'solana', symbol: 'sol', side: 'long', entryDate: '2026-11-19T08:15:00Z',
      entryPrice: 201, quantity: 0.5, leverage: 1, fees: 0.1, status: 'open', stopLoss: 180,
      copyOf: { portfolioId: 'auto-1', day: '2026-11-19', coinId: 'solana' },
    };
    const tickets = buildCopyTickets({
      portfolios: [portfolio],
      days: [dayLog('2026-11-19', 'buy'), dayLog('2026-11-20', 'sell')],
      txs: [], trades: [openTrade], verdicts: {}, realPortfolioUsd: 5000, riskPerTradePct: 1, today: '2026-11-20',
    });
    expect(tickets).toHaveLength(2);
    // La vente correspondant au trade ouvert réel arrive en tête, statut pending + openRealTradeId lié
    expect(tickets[0].side).toBe('sell');
    expect(tickets[0].status).toBe('pending');
    expect(tickets[0].openRealTradeId).toBe('tr-1');
    // L'achat de la veille est marqué déjà copié
    expect(tickets[1].side).toBe('buy');
    expect(tickets[1].status).toBe('copied');
    expect(tickets[1].suggestedRealUsd).toBeGreaterThan(0);
    expect(tickets[1].maxChaseUsd).toBeCloseTo(205, 5);
    expect(formatCopyTicketText(tickets[1])).toContain('ACHAT LIMITE SOL/USDC');
    expect(exchangeLinks('sol').binanceUrl).toContain('SOL_USDC');
  });
});
