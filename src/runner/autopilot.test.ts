// Autopilotes et ordres papier côté serveur : journaux écrits une fois, messages Telegram, mêmes identifiants que l'application.
import { describe, expect, it } from 'vitest';
import { runAutopilots } from './autopilot';
import { rulesFingerprint, STRATEGIES } from '../lib/lab/strategies';
import type { AutopilotSources } from '../lib/lab/autopilot';
import type { SyncBundle } from '../lib/sync/merge';
import type { Candle } from '../lib/indicators';
import type { PaperOrder, PaperPortfolio, PaperTrade } from '../types';

const DAY = 86400;
const T0 = Date.UTC(2025, 0, 1) / 1000;
const price = (coinId: string, sec: number) => (coinId === 'solana' ? 100 - Math.max(0, (sec - Date.UTC(2026, 10, 12) / 1000) / 3600) * 0.5 : 100 + Math.floor((sec - T0) / DAY) * 0.1);
const src: AutopilotSources = {
  daily: async (coinId) => Array.from({ length: 700 }, (_, i): Candle => { const p = price(coinId, T0 + i * DAY); return { time: T0 + i * DAY, open: p, high: p, low: p, close: p, volume: 1 }; }),
  hourly: async (coinId, fromMs, toMs) => {
    const out: Candle[] = [];
    for (let t = Math.floor(fromMs / 3600_000) * 3600; t * 1000 < toMs; t += 3600) { const p = price(coinId, t); out.push({ time: t, open: p, high: p, low: p - 0.5, close: p, volume: 1 }); }
    return out;
  },
  temperatureAt: () => 50,
  universe: async () => [{ coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', rank: 1, available: true }],
  live: async () => null,
};
const auto: PaperPortfolio = { id: 'a1', name: 'DCA Bitcoin simple', kind: 'auto', startingUsd: 0, createdAt: '2026-11-01T10:00:00.000Z', costs: { preset: 'exchange', feePct: 0.1, spreadPct: 0.05 }, strategyId: 'dca-btc', rules: rulesFingerprint(STRATEGIES['dca-btc']), cursorDay: '2026-11-01', liveSince: '2026-11-02', executionHour: 8, timeZone: 'Europe/Paris' };
const manual: PaperPortfolio = { id: 'manuel', name: 'Papier manuel', kind: 'manual', startingUsd: 1000, createdAt: '2026-11-01T10:00:00.000Z', costs: { preset: 'exchange', feePct: 0.1, spreadPct: 0.05 } };
const buy: PaperTrade = { id: 't1', coinId: 'solana', symbol: 'sol', name: 'Solana', date: '2026-11-10', time: '2026-11-10T10:00:00.000Z', type: 'buy', quantity: 1, priceUsd: 100, feeUsd: 0.1, portfolioId: 'manuel' };
const stop: PaperOrder = { id: 'o1', portfolioId: 'manuel', coinId: 'solana', symbol: 'sol', name: 'Solana', side: 'sell', type: 'stop', price: 95, createdAt: '2026-11-10T10:00:00.000Z', expiresAt: '2027-02-01T00:00:00.000Z', status: 'open' };
const bundle = (): SyncBundle => ({ data: { paperPortfolios: [auto, manual], paperDays: [], paperTrades: [buy], paperOrders: [stop] }, deletions: [], stamps: {} });
const NOW = Date.parse('2026-11-13T12:00:00Z');

describe('autopilotes côté serveur', () => {
  it('écrit les journaux, règle l’ordre manuel et prépare les messages', async () => {
    const r = await runAutopilots(bundle(), src, NOW, 'vps');
    const days = r.bundle.data.paperDays as { day: string; by: string; updatedAt?: string }[];
    expect(days.map((d) => d.day)).toEqual(['2026-11-03', '2026-11-06', '2026-11-10', '2026-11-13']); // mardis et vendredis jusqu'au vendredi 13 à midi
    expect(days.every((d) => d.by === 'vps' && d.updatedAt === new Date(NOW).toISOString())).toBe(true);
    const trades = r.bundle.data.paperTrades as PaperTrade[];
    expect(trades.find((t) => t.id === 'fill:o1')).toMatchObject({ type: 'sell', orderType: 'stop', marketUsd: 95 });
    expect((r.bundle.data.paperOrders as PaperOrder[])[0].status).toBe('filled');
    expect(r.events.map((e) => e.key)).toContain('auto:a1:2026-11-10');
    expect(r.events.map((e) => e.key)).toContain('paper:fill:o1');
    const msg = r.events.find((e) => e.key === 'auto:a1:2026-11-10')!.text;
    expect(msg).toContain('Autopilote « DCA Bitcoin simple » — ordres du 10/11 (papier)');
    expect(msg).toContain('ACHAT BTC : 25 USDC');
    expect(r.changed).toBeGreaterThan(0);
    expect(r.briefLines[0]).toContain('DCA Bitcoin simple');
  });
  it('relancé sur son propre résultat : rien de nouveau', async () => {
    const first = await runAutopilots(bundle(), src, NOW, 'vps');
    const again = await runAutopilots(first.bundle, src, NOW + 60_000, 'vps');
    expect(again.changed).toBe(0);
    expect(again.events).toEqual([]);
  });
  it('autopilote aux règles périmées : laissé à l’application (archivage), rien n’est calculé', async () => {
    const b = bundle();
    b.data.paperPortfolios = [{ ...auto, rules: 'dca-btc@0' }];
    const r = await runAutopilots(b, src, NOW, 'vps');
    expect(r.changed).toBe(0);
  });
});
