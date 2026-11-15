import { describe, expect, it } from 'vitest';
import { needsArchive, tickAutopilot, type AutopilotSources } from './autopilot';
import { autoState } from './autoState';
import { execInstant } from './clock';
import { STRATEGIES, rulesFingerprint } from './strategies';
import type { Candle } from '../indicators';
import type { PaperDayLog, PaperPortfolio } from '../../types';
import type { ParamValue, Strategy } from './types';

const DAY = 86400;
const T0 = Date.UTC(2025, 0, 1) / 1000;
/** Prix journalier d'une crypto : 100 + 0,1 × jour (Bitcoin), avec un krach de SOL le 15/11/2026. */
const priceOf = (coinId: string, dayIdx: number) => (coinId === 'solana' ? (dayIdx >= 683 ? 50 : 100) : 100 + dayIdx * 0.1);
const idxOf = (sec: number) => Math.floor((sec - T0) / DAY);
function source(opts: { missingHourAt?: number; endSolAt?: number } = {}): AutopilotSources & { calls: number } {
  const s = {
    calls: 0,
    async daily(coinId: string) {
      const end = coinId === 'solana' && opts.endSolAt ? opts.endSolAt : 700;
      return Array.from({ length: end }, (_, i): Candle => { const p = priceOf(coinId, i); return { time: T0 + i * DAY, open: p, high: p, low: p, close: p, volume: 1 }; });
    },
    async hourly(coinId: string, fromMs: number, toMs: number) {
      s.calls++;
      const out: Candle[] = [];
      for (let t = Math.floor(fromMs / 3600_000) * 3600; t * 1000 < toMs; t += 3600) {
        if (opts.missingHourAt != null && t * 1000 <= opts.missingHourAt && opts.missingHourAt < t * 1000 + 3600_000) continue;
        const p = priceOf(coinId, idxOf(t));
        out.push({ time: t, open: p, high: p, low: p, close: p, volume: 1 });
      }
      return out;
    },
    temperatureAt: () => 50,
    async universe() { return [{ coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', rank: 1, available: true }, { coinId: 'solana', symbol: 'sol', name: 'Solana', rank: 5, available: true }]; },
    async live() { return { markets: [], smallCaps: null, rules: { maxPerGemPct: 3, maxPerAltPct: 5, cashReservePct: 5, riskPerTradePct: 1, maxLines: 12, minLinePct: 1, maxDiscoveryLines: 5 } }; },
  };
  return s;
}
const portfolio = (strategyId: string, over: Partial<PaperPortfolio> = {}): PaperPortfolio => ({
  id: 'p1', name: 'A', kind: 'auto', startingUsd: 0, createdAt: '2026-11-01T10:00:00.000Z', costs: { preset: 'exchange', feePct: 0.1, spreadPct: 0.05 },
  strategyId, rules: (STRATEGIES[strategyId] ?? TEST[strategyId]) ? rulesFingerprint(STRATEGIES[strategyId] ?? TEST[strategyId]) : 'inconnue@0', cursorDay: '2026-11-01', liveSince: '2026-11-02', executionHour: 8, timeZone: 'Europe/Paris', ...over,
});
const at = (day: string, h = 12) => Date.parse(`${day}T${String(h).padStart(2, '0')}:00:00Z`);
const strip = (l: PaperDayLog) => ({ ...l, by: undefined, updatedAt: undefined });

/** Stratégie de test non rejouable, échéance chaque jour ; et une qui achète SOL avec un stop. */
const TEST: Record<string, Strategy<Record<string, ParamValue>>> = {
  late: { id: 'late', version: 1, label: 'L', describe: '', defaults: {}, uses: [], replayable: false, kind: 'deposits', deposit: () => 10, decide: () => [{ coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', side: 'buy', sizing: { usd: 10 }, reason: 'r', tag: 'dca' }] },
  stop: { id: 'stop', version: 1, label: 'S', describe: '', defaults: {}, uses: [], replayable: true, kind: 'trades', deposit: () => 0,
    decide: (ctx) => (ctx.portfolio.positions.length || ctx.portfolio.lastFillOn('stop') ? [] : [{ coinId: 'solana', symbol: 'sol', name: 'Solana', side: 'buy', sizing: { usd: 100 }, stop: 80, targetR: 5, reason: 'r', tag: 'test' }]) },
  churn: { id: 'churn', version: 1, label: 'C', describe: '', defaults: {}, uses: [], replayable: true, kind: 'trades', deposit: () => 0,
    decide: (ctx) => {
      const d = Number(ctx.execDay.slice(8, 10));
      if (ctx.portfolio.positions.length && d % 6 === 0) return [{ coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', side: 'sell', fraction: 1, reason: 'Durée maximale atteinte (30 jours)', tag: 'time-exit' }];
      if (!ctx.portfolio.positions.length && d % 3 === 0) return [{ coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', side: 'buy', sizing: { riskUsd: 10, maxUsd: 200 }, stop: 50, targetR: 2, skipAbove: 1e9, skipBelow: 50, reason: 'Cassure avec volume · signal trader « Achat fort » (+58)', tag: 'setup:breakout' }];
      return [];
    } },
};
const REG = { ...STRATEGIES, ...TEST };

describe('tick de l’autopilote', () => {
  it('dix jours en un tick = dix ticks quotidiens', async () => {
    const once = await tickAutopilot(portfolio('dca-btc'), [], at('2026-11-11'), source(), 'pc');
    let p = portfolio('dca-btc');
    let logs: PaperDayLog[] = [];
    for (let k = 2; k <= 11; k++) {
      const r = await tickAutopilot(p, logs, at(`2026-11-${String(k).padStart(2, '0')}`), source(), 'pc');
      p = r.portfolio;
      logs = [...logs.filter((l) => !r.changed.some((c) => c.id === l.id)), ...r.changed];
    }
    expect(once.portfolio.cursorDay).toBe('2026-11-11');
    expect(p.cursorDay).toBe('2026-11-11');
    expect(once.changed.map(strip)).toEqual([...logs].sort((a, b) => a.day.localeCompare(b.day)).map(strip));
    expect(once.changed.map((l) => l.day)).toEqual(['2026-11-03', '2026-11-06', '2026-11-10']); // mardis et vendredis
    expect(once.changed[0].fills[0]).toMatchObject({ coinId: 'bitcoin', side: 'buy', at: new Date(execInstant('2026-11-03', 8, 'Europe/Paris')).toISOString() });
  });
  it('deux appareils : mêmes journaux ; un second tick n’écrit rien', async () => {
    const a = await tickAutopilot(portfolio('dca-btc'), [], at('2026-11-11'), source(), 'pc');
    const b = await tickAutopilot(portfolio('dca-btc'), [], at('2026-11-11'), source(), 'vps');
    expect(a.changed.map(strip)).toEqual(b.changed.map(strip));
    expect(b.changed[0].by).toBe('vps');
    const again = await tickAutopilot(a.portfolio, a.changed, at('2026-11-11'), source(), 'pc');
    expect(again.changed).toEqual([]);
  });
  it('bougie 1 heure absente : arrêt, aucun journal, curseur inchangé', async () => {
    const r = await tickAutopilot(portfolio('dca-btc'), [], at('2026-11-04'), source({ missingHourAt: execInstant('2026-11-03', 8, 'Europe/Paris') }), 'pc');
    expect(r.changed).toEqual([]);
    expect(r.portfolio.cursorDay).toBe('2026-11-02');
  });
  it('stratégie non rejouable fermée six jours : une seule exécution en retard', async () => {
    const r = await tickAutopilot(portfolio('late'), [], at('2026-11-07'), source(), 'pc', REG);
    expect(r.changed).toHaveLength(6);
    expect(r.changed.reduce((s, l) => s + l.depositUsd, 0)).toBe(60);
    const executed = r.changed.filter((l) => l.fills.length);
    expect(executed).toHaveLength(1);
    expect(executed[0].day).toBe('2026-11-07');
    expect(r.changed.filter((l) => l.skipped.some((x) => x.why === 'aucun appareil n’a tourné ce jour-là'))).toHaveLength(5);
    const old = await tickAutopilot(portfolio('late'), [], at('2026-11-08', 5), source(), 'pc', REG);
    expect(old.changed.find((l) => l.fills.length)?.lateDays).toBe(1);
  });
  it('stop touché entre deux heures d’exécution : rattaché au bon jour', async () => {
    const r = await tickAutopilot(portfolio('stop', { startingUsd: 1000, cursorDay: '2026-11-12' }), [], at('2026-11-16'), source(), 'pc', REG);
    const buyDay = r.changed.find((l) => l.fills.some((f) => f.side === 'buy'))!;
    expect(buyDay.day).toBe('2026-11-13');
    const stopFill = r.changed.flatMap((l) => l.fills.map((f) => ({ day: l.day, f }))).find((x) => x.f.kind === 'stop')!;
    expect(stopFill.f.marketUsd).toBe(50);
    expect(stopFill.day).toBe('2026-11-14'); // le krach du 15/11 à 0 h UTC tombe avant 8 h à Paris : journée d'exécution du 14
    expect(r.events.some((e) => e.kind === 'stop')).toBe(true);
  });
  it('paire retirée : position soldée à sa dernière clôture', async () => {
    const r = await tickAutopilot(portfolio('stop', { startingUsd: 1000, cursorDay: '2026-11-08' }), [], at('2026-11-14'), source({ endSolAt: 678 }), 'pc', REG);
    const fills = r.changed.flatMap((l) => l.fills);
    expect(fills.find((f) => f.kind === 'delist')).toBeTruthy();
  });
  it('règles changées : archivage nécessaire', () => {
    expect(needsArchive(portfolio('dca-btc'))).toBe(false);
    expect(needsArchive(portfolio('dca-btc', { rules: 'dca-btc@0' }))).toBe(true);
    expect(needsArchive(portfolio('inconnue', { rules: 'x' }))).toBe(true);
  });
  it('une année de trades tient en moins de 150 000 caractères', async () => {
    const r = await tickAutopilot(portfolio('churn', { startingUsd: 1000, cursorDay: '2025-11-15' }), [], at('2026-11-15'), source(), 'pc', REG);
    const st = autoState(portfolio('churn', { startingUsd: 1000 }), r.changed);
    expect(r.changed.length).toBeGreaterThan(100);
    expect(st.cashUsd).toBeGreaterThan(0);
    expect(JSON.stringify(r.changed).length).toBeLessThan(150_000);
  });
});
