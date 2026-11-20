import { describe, expect, it } from 'vitest';
import { compactPaperDays } from './compact';
import type { PaperDayLog } from '../../types';

const mk = (day: string, withFill: boolean, deposit = 0): PaperDayLog => ({
  id: `p:${day}`, portfolioId: 'p', day, decidedOn: day, rules: 'r', depositUsd: deposit,
  fills: withFill ? [{ coinId: 'btc', symbol: 'btc', name: 'BTC', side: 'buy', kind: 'market', quantity: 1, marketUsd: 100, priceUsd: 100, feeUsd: 0.1, at: `${day}T08:00:00Z`, reason: 'ok' }] : [],
  skipped: [], by: 'vps',
});

describe('compactage paperDays', () => {
  it('supprime uniquement les journaux vides anciens et conserve tous les fills et dépôts', () => {
    const input = [
      mk('2025-01-01', false, 0), // ancien vide → supprimé
      mk('2025-01-02', true, 0),  // ancien avec fill → gardé
      mk('2025-01-03', false, 25), // ancien avec dépôt → gardé
      mk('2026-11-01', false, 0), // récent vide → gardé
    ];
    const r = compactPaperDays(input, '2026-11-20', 90);
    expect(r.removed).toBe(1);
    expect(r.days.map((d) => d.day)).toEqual(['2025-01-02', '2025-01-03', '2026-11-01']);
  });
});
