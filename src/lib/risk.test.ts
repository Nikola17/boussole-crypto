// Trading : position ouverte valorisée au cours du moment, pire série et baisse maximale du journal.
import { describe, expect, it } from 'vitest';
import { openTradeStatus, tradeStats } from './risk';
import type { TradeEntry } from '../types';

const t = (over: Partial<TradeEntry>): TradeEntry => ({
  id: Math.random().toString(36).slice(2), coinId: 'bitcoin', symbol: 'btc', side: 'long', status: 'open', entryDate: '2026-11-01',
  entryPrice: 100, quantity: 1, stopLoss: 90, takeProfit: 130, leverage: 1, fees: 0, ...over,
});

describe('openTradeStatus', () => {
  it('long : résultat latent en $ et en R, distances au stop et à l’objectif', () => {
    const s = openTradeStatus(t({}), 110)!;
    expect(s.pnl).toBe(10);
    expect(s.r).toBe(1);
    expect(s.stopHit).toBe(false);
    expect(s.targetHit).toBe(false);
    expect(s.toStopPct).toBeCloseTo(18.18, 1);
    expect(s.toTargetPct).toBeCloseTo(18.18, 1);
  });

  it('long : stop franchi', () => {
    const s = openTradeStatus(t({}), 88)!;
    expect(s.stopHit).toBe(true);
    expect(s.r).toBeCloseTo(-1.2, 5);
  });

  it('short : objectif atteint quand le cours baisse', () => {
    const s = openTradeStatus(t({ side: 'short', stopLoss: 110, takeProfit: 80 }), 79)!;
    expect(s.targetHit).toBe(true);
    expect(s.pnl).toBe(21);
  });

  it('sans stop : pas de R ; trade clos ou cours inconnu : rien', () => {
    expect(openTradeStatus(t({ stopLoss: undefined }), 105)!.r).toBeNull();
    expect(openTradeStatus(t({ status: 'closed', exitPrice: 105 }), 105)).toBeNull();
    expect(openTradeStatus(t({}), 0)).toBeNull();
  });
});

describe('tradeStats : pire série et baisse maximale', () => {
  it('compte la plus longue série de pertes et la plus forte baisse depuis un sommet', () => {
    const closed = (day: number, exit: number) => t({ status: 'closed', entryDate: `2026-11-${String(day).padStart(2, '0')}`, exitDate: `2026-11-${String(day).padStart(2, '0')}`, exitPrice: exit });
    const s = tradeStats([closed(1, 120), closed(2, 95), closed(3, 90), closed(4, 98), closed(5, 115)]);
    // P&L : +20, −5, −10, −2, +15 → cumul 20, 15, 5, 3, 18 → baisse maximale 17 depuis le sommet à 20
    expect(s.maxLosingStreak).toBe(3);
    expect(s.maxDrawdown).toBe(17);
  });
});
