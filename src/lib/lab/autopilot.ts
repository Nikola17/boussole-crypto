// Tick de l'autopilote : rejoue les jours d'exécution manquants d'un portefeuille en autopilote, dans l'ordre.
// Pour chaque jour E : stops et objectifs contrôlés sur les bougies 1 heure jusqu'à l'heure d'exécution X(E),
// décision sur les bougies journalières closes de la veille (D), exécution au prix d'ouverture de l'heure qui contient X(E).
// Déterministe : deux appareils qui calculent le même jour écrivent le même journal (hors date et appareil).

import { sma, type Candle } from '../indicators';
import type { PaperDayLog, PaperFill, PaperPortfolio } from '../../types';
import { addDays, decisionDay, execInstant, isoWeek, localDay } from './clock';
import { applyIntent, delist, settleBar } from './fills';
import { autoState, effectiveCursor } from './autoState';
import { STRATEGIES, rulesFingerprint } from './strategies';
import type { Book, Fill, ParamValue, Strategy, StrategyContext, UniverseEntry } from './types';

export interface AutopilotSources {
  /** Bougies journalières closes (tout l'historique disponible). */
  daily(coinId: string): Promise<Candle[]>;
  /** Bougies 1 heure entre deux instants (ms). */
  hourly(coinId: string, fromMs: number, toMs: number): Promise<Candle[]>;
  temperatureAt(day: string): number | null;
  universe(): Promise<UniverseEntry[]>;
  live(): Promise<StrategyContext['live'] | null>;
}

export type AutopilotEvent =
  | { kind: 'orders'; day: string; fills: PaperFill[]; skipped: PaperDayLog['skipped']; lateDays?: number }
  | { kind: 'stop' | 'target'; day: string; fill: PaperFill };

type Registry = Record<string, Strategy<Record<string, ParamValue>>>;
const HOUR = 3600_000;
const dayOf = (c: Candle) => new Date(c.time * 1000).toISOString().slice(0, 10);
const NO_DEVICE = 'aucun appareil n’a tourné ce jour-là';

/** L'empreinte des règles a changé (ou la stratégie n'existe plus) : le portefeuille doit être archivé. */
export function needsArchive(p: PaperPortfolio, strategies: Registry = STRATEGIES): boolean {
  if (p.kind !== 'auto') return false;
  const s = p.strategyId ? strategies[p.strategyId] : undefined;
  return !s || rulesFingerprint(s) !== p.rules;
}

const toPaperFill = (f: Fill): PaperFill => ({
  coinId: f.coinId, symbol: f.symbol, name: f.name, side: f.side, kind: f.kind === 'limit' ? 'market' : f.kind, quantity: f.quantity,
  marketUsd: f.marketUsd, priceUsd: f.priceUsd, feeUsd: f.feeUsd, at: f.at, reason: f.reason,
  ...(f.tag ? { tag: f.tag } : {}), ...(f.stop != null ? { stop: f.stop } : {}), ...(f.target != null ? { target: f.target } : {}),
});

export async function tickAutopilot(
  p: PaperPortfolio, logs: PaperDayLog[], nowMs: number, src: AutopilotSources, device: string, strategies: Registry = STRATEGIES,
): Promise<{ portfolio: PaperPortfolio; changed: PaperDayLog[]; events: AutopilotEvent[] }> {
  const strategy = p.strategyId ? strategies[p.strategyId] : undefined;
  if (p.kind !== 'auto' || !strategy || p.paused || p.archived || needsArchive(p, strategies)) return { portfolio: p, changed: [], events: [] };
  const tz = p.timeZone ?? 'Europe/Paris';
  const hour = p.executionHour ?? 8;
  const params = { ...strategy.defaults, ...(p.params ?? {}) } as Record<string, ParamValue>;
  const costs = { feePct: p.costs.feePct, spreadPct: p.costs.spreadPct };
  const X = (day: string) => execInstant(day, hour, tz);
  /** Jour d'exécution auquel appartient un instant : le dernier E tel que X(E) ≤ instant. */
  const dayOfInstant = (ms: number) => { const d = localDay(ms, tz); return ms >= X(d) ? d : addDays(d, -1); };

  let portfolio: PaperPortfolio = { ...p };
  const byDay = new Map(logs.filter((l) => l.portfolioId === p.id).map((l) => [l.day, l]));
  const changedDays = new Set<string>();
  const events: AutopilotEvent[] = [];
  const logFor = (day: string): PaperDayLog => byDay.get(day) ?? { id: `${p.id}:${day}`, portfolioId: p.id, day, decidedOn: addDays(day, -1), rules: p.rules ?? '', depositUsd: 0, fills: [], skipped: [], by: device };
  const save = (l: PaperDayLog) => { byDay.set(l.day, { ...l, by: device }); changedDays.add(l.day); };
  const allLogs = () => [...byDay.values()];

  const dailyCache = new Map<string, Candle[]>();
  const daily = async (coinId: string) => { if (!dailyCache.has(coinId)) dailyCache.set(coinId, await src.daily(coinId)); return dailyCache.get(coinId)!; };
  const upTo = (cs: Candle[], day: string) => { let j = cs.length - 1; while (j >= 0 && dayOf(cs[j]) > day) j--; return cs.slice(Math.max(0, j - 399), j + 1); };
  const closeOn = (cs: Candle[] | undefined, day: string) => { if (!cs) return null; const w = upTo(cs, day); return w.length ? w[w.length - 1].close : null; };

  /** Stops et objectifs des positions, bougie 1 heure par bougie 1 heure, de `fromMs` à `toMs`. */
  const settle = async (fromMs: number, toMs: number) => {
    if (toMs <= fromMs) return;
    const st = autoState(portfolio, allLogs());
    const watched = Object.values(st.positions).filter((x) => x.stop != null || x.target != null);
    if (!watched.length) return;
    const bars: { coinId: string; c: Candle }[] = [];
    for (const pos of watched) for (const c of await src.hourly(pos.coinId, fromMs, toMs)) if (c.time * 1000 >= fromMs && c.time * 1000 + HOUR <= toMs) bars.push({ coinId: pos.coinId, c });
    bars.sort((a, b) => a.c.time - b.c.time || a.coinId.localeCompare(b.coinId));
    let book: Book = { cashUsd: st.cashUsd, positions: st.positions };
    for (const { coinId, c } of bars) {
      const at = new Date(c.time * 1000).toISOString();
      const r = settleBar(book, coinId, c, costs, at);
      if (!r.fill) continue;
      book = r.book;
      const day = dayOfInstant(c.time * 1000);
      const l = logFor(day);
      const fill = toPaperFill(r.fill);
      save({ ...l, fills: [...l.fills, fill] });
      events.push({ kind: r.fill.kind === 'target' ? 'target' : 'stop', day, fill });
    }
  };

  const cursor = effectiveCursor(p, logs) || localDay(nowMs, tz);
  let settledFrom = p.settledTo ? Date.parse(p.settledTo) : X(cursor);
  const today = localDay(nowMs, tz);
  // Jours d'exécution à traiter, et (stratégie non rejouable) la dernière échéance du rattrapage, la seule exécutée.
  const pending: string[] = [];
  for (let E = addDays(cursor, 1); E <= today && X(E) <= nowMs; E = addDays(E, 1)) pending.push(E);
  const scheduledOf = (E: string) => strategy.deposit({ execDay: E, scheduled: (dw) => dw.includes(((new Date(`${E}T00:00:00Z`).getUTCDay() + 6) % 7) + 1) }, params) > 0;
  const lastScheduled = strategy.replayable ? null : [...pending].reverse().find(scheduledOf) ?? null;

  for (const E of pending) {
    const xE = X(E);
    const D = decisionDay(xE);
    const scheduled = (dw: number[]) => dw.includes(((new Date(`${E}T00:00:00Z`).getUTCDay() + 6) % 7) + 1);
    await settle(settledFrom, xE);
    if (isoWeek(E) !== portfolio.universeWeek || !portfolio.universe) {
      const u = await src.universe();
      if (u.length) portfolio = { ...portfolio, universe: u.map((x) => ({ ...x })), universeWeek: isoWeek(E) };
    }
    const universe: UniverseEntry[] = (portfolio.universe ?? []).map((x) => ({ coinId: x.coinId, symbol: x.symbol, name: x.name, rank: x.rank, available: x.available ?? null }));
    const st0 = autoState(portfolio, allLogs());
    const coins = [...new Set([...universe.map((u) => u.coinId), ...Object.keys(st0.positions), 'bitcoin'])];
    for (const c of coins) await daily(c);
    const st = autoState(portfolio, allLogs(), (coinId, day) => closeOn(dailyCache.get(coinId), day));
    const btc = upTo(dailyCache.get('bitcoin') ?? [], D);
    const s200 = sma(btc.map((c) => c.close), 200);
    const btcAbove = btc.length && Number.isFinite(s200[s200.length - 1]) ? btc[btc.length - 1].close > s200[s200.length - 1] : null;
    const equity = st.cashUsd + Object.values(st.positions).reduce((sum, x) => sum + x.quantity * (closeOn(dailyCache.get(x.coinId), D) ?? 0), 0);
    let book: Book = { cashUsd: st.cashUsd, positions: st.positions };
    const fills: PaperFill[] = [];
    const skipped: PaperDayLog['skipped'] = [];
    let lateDays: number | undefined;

    // Paire retirée de la cotation : la position est soldée à sa dernière clôture.
    for (const pos of Object.values(st.positions)) {
      const cs = dailyCache.get(pos.coinId);
      const last = cs?.[cs.length - 1];
      if (last && dayOf(last) < D) {
        const r = delist(book, pos.coinId, last.close, costs, new Date(xE).toISOString());
        book = r.book;
        if (r.fill) fills.push(toPaperFill(r.fill));
      }
    }

    const deposit = strategy.deposit({ execDay: E, scheduled }, params);
    book = { ...book, cashUsd: book.cashUsd + deposit };
    let intents: ReturnType<typeof strategy.decide> = [];
    let execAt = xE;
    if (!strategy.replayable && E !== lastScheduled) {
      if (deposit > 0) skipped.push({ symbol: '—', why: NO_DEVICE });
    } else {
      const live = strategy.replayable ? undefined : await src.live();
      if (!strategy.replayable && !live) break; // données en direct indisponibles : on réessaiera, rien n'est inventé
      if (!strategy.replayable && E < today) { lateDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${E}T00:00:00Z`)) / 86400_000); execAt = Math.floor(nowMs / HOUR) * HOUR - HOUR; }
      const ctx: StrategyContext = {
        decidedOn: D, execDay: E, scheduled, universe,
        candles: (coinId) => upTo(dailyCache.get(coinId) ?? [], D),
        temperature: src.temperatureAt(D), btcAboveSma200: btcAbove,
        portfolio: {
          cashUsd: book.cashUsd, equityUsd: equity + deposit, peakEquityUsd: Math.max(st.peakEquityUsd, equity + deposit), minSincePeakUsd: Math.min(st.minSincePeakUsd, equity + deposit),
          positions: Object.values(book.positions), lastFillOn: (tag, coinId) => st.lastFill[coinId ? `${tag}|${coinId}` : tag] ?? null,
        },
        ...(live ? { live } : {}),
      };
      intents = strategy.decide(ctx, params);
    }
    // Prix d'exécution : ouverture de la bougie 1 heure qui contient l'instant d'exécution. Sans elle, on s'arrête.
    let missing = false;
    const fillsBefore = fills.length;
    for (const intent of intents) {
      const bars = await src.hourly(intent.coinId, execAt, execAt + HOUR);
      const bar = bars.find((c) => c.time * 1000 <= execAt && execAt < c.time * 1000 + HOUR);
      if (!bar) { missing = true; break; }
      const r = applyIntent(book, intent, bar.open, costs, { at: new Date(execAt).toISOString(), day: E, minOrderUsd: 5 });
      if (r.skip) { skipped.push({ symbol: intent.symbol.toUpperCase(), why: r.skip }); continue; }
      book = r.book;
      if (r.fill) fills.push(toPaperFill(r.fill));
    }
    if (missing) { fills.length = fillsBefore; break; }

    const prev = byDay.get(E);
    if (deposit > 0 || fills.length || skipped.length || prev) {
      const base = prev ?? logFor(E);
      save({ ...base, decidedOn: D, rules: p.rules ?? '', depositUsd: deposit, fills: [...(prev?.fills.filter((f) => f.kind === 'stop' || f.kind === 'target') ?? []), ...fills], skipped, ...(lateDays != null ? { lateDays } : {}) });
      if (fills.length || skipped.length) events.push({ kind: 'orders', day: E, fills, skipped, ...(lateDays != null ? { lateDays } : {}) });
    }
    portfolio = { ...portfolio, cursorDay: E };
    settledFrom = xE;
  }
  // Après le dernier jour traité : stops et objectifs jusqu'à la dernière bougie 1 heure close.
  const lastClosed = Math.floor(nowMs / HOUR) * HOUR;
  await settle(settledFrom, lastClosed);
  if (lastClosed > settledFrom) settledFrom = lastClosed;
  portfolio = { ...portfolio, settledTo: new Date(settledFrom).toISOString() };
  const changed = [...changedDays].sort().map((d) => byDay.get(d)!);
  return { portfolio, changed, events };
}
