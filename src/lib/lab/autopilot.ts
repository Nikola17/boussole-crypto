// Tick de l'autopilote : rejoue les créneaux d'exécution manquants d'un portefeuille en autopilote, dans l'ordre.
// Pour chaque créneau (jour E, heure h) : stops, trailing stops et objectifs partiels contrôlés sur les bougies 1 H
// jusqu'à l'instant X(E, h), décision sur les bougies closes (1D ou 4H), Risk Overlay, puis exécution au prix
// d'ouverture de l'heure (ou limite maker sur les bougies 1 H suivantes).
// Déterministe : deux appareils qui calculent le même créneau écrivent le même journal (hors date et appareil).

import { sma, type Candle } from '../indicators';
import type { PaperDayLog, PaperFill, PaperPortfolio } from '../../types';
import { addDays, decisionDay, execInstant, isoWeek, localDay } from './clock';
import { computeAssetMetrics, type AssetMetrics } from './features';
import { applyIntent, delist, pendingHit, settleBar } from './fills';
import { autoState, effectiveCursor } from './autoState';
import { buildRegimeSeries, type RegimeSnapshot } from './regime';
import { applyRiskOverlay } from './riskOverlay';
import { STRATEGIES, rulesFingerprint } from './strategies';
import type { Book, Fill, ParamValue, Strategy, StrategyContext, UniverseEntry } from './types';

export interface AutopilotSources {
  /** Bougies journalières closes (tout l'historique disponible). */
  daily(coinId: string): Promise<Candle[]>;
  /** Bougies 1 heure entre deux instants (ms). */
  hourly(coinId: string, fromMs: number, toMs: number): Promise<Candle[]>;
  /** Bougies 4 heures closes (facultatif : utilisé par les stratégies multi-créneaux 4H). */
  candles4h?(coinId: string): Promise<Candle[]>;
  /** Taux de financement perpétuel 8 h courant (facultatif : stratégies dérivés). */
  fundingAt?(coinId: string): number | null;
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
const slotKeyOf = (day: string, hour: number) => `${day}@${String(hour).padStart(2, '0')}`;
const NO_DEVICE = 'aucun appareil n’a tourné ce jour-là';

/** L'empreinte des règles a changé (ou la stratégie n'existe plus) : le portefeuille doit être archivé. */
export function needsArchive(p: PaperPortfolio, strategies: Registry = STRATEGIES): boolean {
  if (p.kind !== 'auto') return false;
  const s = p.strategyId ? strategies[p.strategyId] : undefined;
  return !s || rulesFingerprint(s) !== p.rules;
}

const toPaperFill = (f: Fill): PaperFill => ({
  coinId: f.coinId, symbol: f.symbol, name: f.name, side: f.side, kind: f.kind, quantity: f.quantity,
  marketUsd: f.marketUsd, priceUsd: f.priceUsd, feeUsd: f.feeUsd, at: f.at, reason: f.reason,
  ...(f.tag ? { tag: f.tag } : {}),
  ...(f.stop != null ? { stop: f.stop } : {}),
  ...(f.target != null ? { target: f.target } : {}),
  ...(f.stopOnClose ? { stopOnClose: true } : {}),
  ...(f.tpLegs?.length ? { tpLegs: f.tpLegs.map((l) => ({ ...l })) } : {}),
  ...(f.trailing ? { trailing: { ...f.trailing } } : {}),
  ...(f.entryPriceUsd != null ? { entryPriceUsd: f.entryPriceUsd } : {}),
  ...(f.initialRiskPerUnit != null ? { initialRiskPerUnit: f.initialRiskPerUnit } : {}),
});

export async function tickAutopilot(
  p: PaperPortfolio, logs: PaperDayLog[], nowMs: number, src: AutopilotSources, device: string, strategies: Registry = STRATEGIES,
): Promise<{ portfolio: PaperPortfolio; changed: PaperDayLog[]; events: AutopilotEvent[] }> {
  const strategy = p.strategyId ? strategies[p.strategyId] : undefined;
  if (p.kind !== 'auto' || !strategy || p.paused || p.archived || needsArchive(p, strategies)) return { portfolio: p, changed: [], events: [] };
  const tz = p.timeZone ?? 'Europe/Paris';
  const rawHours = p.executionHours?.length ? p.executionHours : strategy.executionHours?.length ? strategy.executionHours : [p.executionHour ?? 8];
  const hours = [...new Set(rawHours.map((h) => Math.max(0, Math.min(23, Math.round(h)))))].sort((a, b) => a - b);
  const firstHour = hours[0] ?? 8;
  const isMultiSlot = hours.length > 1;
  const params = { ...strategy.defaults, ...(p.params ?? {}) } as Record<string, ParamValue>;
  const costs = { feePct: p.costs.feePct, spreadPct: p.costs.spreadPct };
  const X = (day: string, hour = firstHour) => execInstant(day, hour, tz);
  /** Jour d'exécution auquel appartient un instant : le dernier E tel que X(E, firstHour) ≤ instant. */
  const dayOfInstant = (ms: number) => { const d = localDay(ms, tz); return ms >= X(d, firstHour) ? d : addDays(d, -1); };

  let portfolio: PaperPortfolio = { ...p };
  const byDay = new Map(logs.filter((l) => l.portfolioId === p.id).map((l) => [l.day, l]));
  const changedDays = new Set<string>();
  const events: AutopilotEvent[] = [];
  const logFor = (day: string): PaperDayLog => byDay.get(day) ?? { id: `${p.id}:${day}`, portfolioId: p.id, day, decidedOn: addDays(day, -1), rules: p.rules ?? '', depositUsd: 0, fills: [], skipped: [], by: device };
  const save = (l: PaperDayLog) => { byDay.set(l.day, { ...l, by: device }); changedDays.add(l.day); };
  const allLogs = () => [...byDay.values()];

  const dailyCache = new Map<string, Candle[]>();
  const daily = async (coinId: string) => { if (!dailyCache.has(coinId)) dailyCache.set(coinId, await src.daily(coinId)); return dailyCache.get(coinId)!; };
  const c4hCache = new Map<string, Candle[]>();
  const candles4h = async (coinId: string) => {
    if (!src.candles4h) return [];
    if (!c4hCache.has(coinId)) c4hCache.set(coinId, await src.candles4h(coinId).catch(() => []));
    return c4hCache.get(coinId)!;
  };
  const upTo = (cs: Candle[], day: string) => { let j = cs.length - 1; while (j >= 0 && dayOf(cs[j]) > day) j--; return cs.slice(Math.max(0, j - 399), j + 1); };
  const upTo4h = (cs: Candle[], execMs: number) => {
    let j = cs.length - 1;
    while (j >= 0 && (cs[j].time + 4 * 3600) * 1000 > execMs) j--;
    return cs.slice(Math.max(0, j - 249), j + 1);
  };
  const closeOn = (cs: Candle[] | undefined, day: string) => { if (!cs) return null; const w = upTo(cs, day); return w.length ? w[w.length - 1].close : null; };

  /** Stops, trailing stops et objectifs (uniques ou partiels) des positions, bougie 1 heure par bougie 1 heure. */
  const settle = async (fromMs: number, toMs: number) => {
    if (toMs <= fromMs) return;
    const st = autoState(portfolio, allLogs());
    const watched = Object.values(st.positions).filter((x) => x.stop != null || x.target != null || x.tpLegs?.length || x.trailing != null);
    if (!watched.length) return;
    const bars: { coinId: string; c: Candle }[] = [];
    for (const pos of watched) for (const c of await src.hourly(pos.coinId, fromMs, toMs)) if (c.time * 1000 >= fromMs && c.time * 1000 + HOUR <= toMs) bars.push({ coinId: pos.coinId, c });
    bars.sort((a, b) => a.c.time - b.c.time || a.coinId.localeCompare(b.coinId));
    let book: Book = { cashUsd: st.cashUsd, positions: st.positions };
    for (const { coinId, c } of bars) {
      const at = new Date(c.time * 1000).toISOString();
      const r = settleBar(book, coinId, c, costs, at);
      book = r.book;
      for (const rf of r.fills) {
        const day = dayOfInstant(c.time * 1000);
        const l = logFor(day);
        const fill = toPaperFill(rf);
        save({ ...l, fills: [...l.fills, fill] });
        events.push({ kind: rf.kind === 'target' ? 'target' : 'stop', day, fill });
      }
    }
  };

  const cursor = effectiveCursor(p, logs) || localDay(nowMs, tz);
  const lastSlotKey = p.cursorSlot ?? slotKeyOf(cursor, hours[hours.length - 1] ?? firstHour);
  let settledFrom = p.settledTo ? Date.parse(p.settledTo) : X(cursor, hours[hours.length - 1] ?? firstHour);
  const today = localDay(nowMs, tz);

  // Créneaux d'exécution à traiter dans l'ordre chronologique.
  const pendingSlots: { day: string; hour: number; instant: number; key: string; firstOfDay: boolean }[] = [];
  const startDay = isMultiSlot ? cursor : addDays(cursor, 1);
  for (let E = startDay; E <= today; E = addDays(E, 1)) {
    for (let hi = 0; hi < hours.length; hi++) {
      const h = hours[hi];
      const key = slotKeyOf(E, h);
      if (key <= lastSlotKey) continue;
      const instant = X(E, h);
      if (instant > nowMs) continue;
      pendingSlots.push({ day: E, hour: h, instant, key, firstOfDay: hi === 0 });
    }
  }
  const scheduledOf = (E: string) => strategy.deposit({ execDay: E, scheduled: (dw) => dw.includes(((new Date(`${E}T00:00:00Z`).getUTCDay() + 6) % 7) + 1) }, params) > 0;
  const lastScheduled = strategy.replayable ? null : [...pendingSlots].map((s) => s.day).reverse().find(scheduledOf) ?? null;

  let regimes: Map<string, RegimeSnapshot> | null = null;

  for (const slot of pendingSlots) {
    const E = slot.day;
    const xE = slot.instant;
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
    // Chargement borné à 6 requêtes parallèles : rapide sur un univers top 500 sans saturer Binance.
    let nextCoin = 0;
    await Promise.all(Array.from({ length: Math.min(6, coins.length) }, async () => {
      while (nextCoin < coins.length) await daily(coins[nextCoin++]);
    }));
    if (isMultiSlot && src.candles4h) {
      const top4h = [...new Set([...universe.slice(0, 40).map((u) => u.coinId), ...Object.keys(st0.positions), 'bitcoin'])];
      let k4 = 0;
      await Promise.all(Array.from({ length: Math.min(6, top4h.length) }, async () => {
        while (k4 < top4h.length) await candles4h(top4h[k4++]);
      }));
    }
    if (!regimes) {
      const btcAll = dailyCache.get('bitcoin') ?? [];
      regimes = buildRegimeSeries(btcAll, src.temperatureAt);
    }
    const st = autoState(portfolio, allLogs(), (coinId, day) => closeOn(dailyCache.get(coinId), day));
    const btc = upTo(dailyCache.get('bitcoin') ?? [], D);
    const s200 = sma(btc.map((c) => c.close), 200);
    const btcAbove = btc.length && Number.isFinite(s200[s200.length - 1]) ? btc[btc.length - 1].close > s200[s200.length - 1] : null;
    const equity = st.cashUsd + Object.values(st.positions).reduce((sum, x) => sum + x.quantity * (closeOn(dailyCache.get(x.coinId), D) ?? 0), 0);
    let book: Book = { cashUsd: st.cashUsd, positions: st.positions };
    const fills: PaperFill[] = [];
    const skipped: PaperDayLog['skipped'] = [];
    let lateDays: number | undefined;

    // Paire retirée de la cotation : la position est soldée à sa dernière clôture (premier créneau du jour).
    if (slot.firstOfDay) {
      for (const pos of Object.values(st.positions)) {
        const cs = dailyCache.get(pos.coinId);
        const last = cs?.[cs.length - 1];
        if (last && dayOf(last) < D) {
          const r = delist(book, pos.coinId, last.close, costs, new Date(xE).toISOString());
          book = r.book;
          if (r.fill) fills.push(toPaperFill(r.fill));
        }
      }
    }

    const deposit = slot.firstOfDay ? strategy.deposit({ execDay: E, scheduled }, params) : 0;
    book = { ...book, cashUsd: book.cashUsd + deposit };
    let intents: ReturnType<typeof strategy.decide> = [];
    let execAt = xE;
    if (!strategy.replayable && E !== lastScheduled) {
      if (deposit > 0) skipped.push({ symbol: '—', why: NO_DEVICE });
    } else {
      const live = strategy.replayable ? undefined : await src.live();
      if (!strategy.replayable && !live) break; // données en direct indisponibles : on réessaiera, rien n'est inventé
      if (!strategy.replayable && E < today) { lateDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${E}T00:00:00Z`)) / 86400_000); execAt = Math.floor(nowMs / HOUR) * HOUR - HOUR; }
      const metricsCache = new Map<string, AssetMetrics | null>();
      const candlesFn = (coinId: string) => upTo(dailyCache.get(coinId) ?? [], D);
      const ctx: StrategyContext = {
        decidedOn: D, execDay: E, scheduled, universe,
        timeframe: isMultiSlot ? '4h' : '1d',
        slotIso: new Date(xE).toISOString(),
        candles: candlesFn,
        candles4h: isMultiSlot && src.candles4h ? (coinId) => upTo4h(c4hCache.get(coinId) ?? [], xE) : undefined,
        fundingAt: src.fundingAt,
        temperature: src.temperatureAt(D),
        btcAboveSma200: btcAbove,
        regime: regimes.get(D) ?? null,
        metrics: (coinId) => {
          if (!metricsCache.has(coinId)) metricsCache.set(coinId, computeAssetMetrics(candlesFn(coinId), btc, src.fundingAt?.(coinId) ?? null));
          return metricsCache.get(coinId) ?? null;
        },
        portfolio: {
          cashUsd: book.cashUsd, equityUsd: equity + deposit, peakEquityUsd: Math.max(st.peakEquityUsd, equity + deposit), minSincePeakUsd: Math.min(st.minSincePeakUsd, equity + deposit),
          positions: Object.values(book.positions), lastFillOn: (tag, coinId) => st.lastFill[coinId ? `${tag}|${coinId}` : tag] ?? null,
        },
        ...(live ? { live } : {}),
      };
      const overlay = applyRiskOverlay(strategy.decide(ctx, params), ctx, strategy.riskOverlay);
      intents = overlay.intents;
      skipped.push(...overlay.skipped);
    }

    // Prix d'exécution : ouverture de la bougie 1 H (ou ordre limite maker évalué sur les bougies 1 H de la fenêtre).
    let missing = false;
    const fillsBefore = fills.length;
    for (const intent of intents) {
      const isLimit = intent.orderType === 'limit' && intent.limitPrice != null && intent.side === 'buy';
      if (isLimit) {
        const windowMs = Math.max(1, intent.expiresAfterHours ?? 24) * HOUR;
        const bars = await src.hourly(intent.coinId, execAt, Math.min(nowMs + HOUR, execAt + windowMs));
        if (!bars.length) { missing = true; break; }
        let hit: { price: number; at: string } | null = null;
        for (const b of bars) {
          const h = pendingHit('limitBuy', intent.limitPrice!, b);
          if (h != null) { hit = { price: h, at: new Date(b.time * 1000).toISOString() }; break; }
        }
        if (!hit) { skipped.push({ symbol: intent.symbol.toUpperCase(), why: 'ordre limite non touché' }); continue; }
        const r = applyIntent(book, intent, hit.price, costs, { at: hit.at, day: E, minOrderUsd: 5, asLimit: true });
        if (r.skip) { skipped.push({ symbol: intent.symbol.toUpperCase(), why: r.skip }); continue; }
        book = r.book;
        if (r.fill) fills.push(toPaperFill(r.fill));
      } else {
        const bars = await src.hourly(intent.coinId, execAt, execAt + HOUR);
        const bar = bars.find((c) => c.time * 1000 <= execAt && execAt < c.time * 1000 + HOUR);
        if (!bar) { missing = true; break; }
        const r = applyIntent(book, intent, bar.open, costs, { at: new Date(execAt).toISOString(), day: E, minOrderUsd: 5 });
        if (r.skip) { skipped.push({ symbol: intent.symbol.toUpperCase(), why: r.skip }); continue; }
        book = r.book;
        if (r.fill) fills.push(toPaperFill(r.fill));
      }
    }
    if (missing) { fills.length = fillsBefore; break; }

    const prev = byDay.get(E);
    if (deposit > 0 || fills.length || skipped.length || prev) {
      const base = prev ?? logFor(E);
      const prevFills = prev ? (slot.firstOfDay ? prev.fills.filter((f) => f.kind === 'stop' || f.kind === 'target') : prev.fills) : [];
      const prevSkipped = prev && !slot.firstOfDay ? prev.skipped : [];
      save({
        ...base, decidedOn: D, rules: p.rules ?? '',
        depositUsd: slot.firstOfDay ? deposit : base.depositUsd,
        fills: [...prevFills, ...fills],
        skipped: [...prevSkipped, ...skipped],
        ...(lateDays != null ? { lateDays } : {}),
      });
      if (fills.length || skipped.length) events.push({ kind: 'orders', day: E, fills, skipped, ...(lateDays != null ? { lateDays } : {}) });
    }
    portfolio = { ...portfolio, cursorDay: E, ...(isMultiSlot ? { cursorSlot: slot.key } : {}) };
    settledFrom = xE;
  }
  // Après le dernier créneau traité : stops, trailing et objectifs jusqu'à la dernière bougie 1 heure close.
  const lastClosed = Math.floor(nowMs / HOUR) * HOUR;
  await settle(settledFrom, lastClosed);
  if (lastClosed > settledFrom) settledFrom = lastClosed;
  portfolio = { ...portfolio, settledTo: new Date(settledFrom).toISOString() };
  const changed = [...changedDays].sort().map((d) => byDay.get(d)!);
  return { portfolio, changed, events };
}
