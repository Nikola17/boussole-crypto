// Simulateur de portefeuille du banc d'essai : rejoue une stratégie jour par jour sur l'historique.
// Décision sur les bougies closes de la veille (D), exécution le jour E, à l'ouverture (`nextOpen`) ou à la
// clôture (`nextClose`, variante pessimiste). Mêmes règles d'exécution que le papier et l'autopilote.

import { sma, type Candle } from '../indicators';
import { AUTOPILOT_UNIVERSE_TOP } from '../autoBasket';
import { applyIntent, delist, pendingHit, settleBar } from './fills';
import { computeAssetMetrics, type AssetMetrics } from './features';
import type { DayPoint } from './metrics';
import { buildRegimeSeries } from './regime';
import { applyRiskOverlay } from './riskOverlay';
import { dayOf, toCoinId, toSymbol, universeAt, type Asset } from './universe';
import type { Book, CostModel, Fill, ParamValue, Strategy, StrategyContext } from './types';

export interface SimData { assets: Asset[]; temperature: Map<string, number>; btcId: string }
export interface SimConfig { startCashUsd: number; costs: CostModel; fill: 'nextOpen' | 'nextClose'; from: string; to: string; minOrderUsd: number; /** Taille de l'univers simulé (défaut : celle de la stratégie, sinon AUTOPILOT_UNIVERSE_TOP = 100). */ universeTop?: number }
export interface SimResult { series: DayPoint[]; fills: Fill[]; skipped: { day: string; symbol: string; why: string }[] }

const dow = (day: string) => ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

export function simulate<P extends Record<string, ParamValue>>(s: Strategy<P>, params: P, data: SimData, cfg: SimConfig): SimResult {
  const byId = new Map(data.assets.map((a) => [a.id, a]));
  const assetOf = (coinId: string) => byId.get(toSymbol(coinId)) ?? byId.get(coinId);
  const btc = byId.get(data.btcId);
  const btcSma = btc ? sma(btc.candles.map((c) => c.close), 200) : [];
  const regimes = btc ? buildRegimeSeries(btc.candles, (day) => data.temperature.get(day) ?? null) : new Map();
  const days = [...new Set(data.assets.flatMap((a) => [...a.dayIndex.keys()]))].sort();
  const lastDayOf = new Map(data.assets.map((a) => [a.id, dayOf(a.candles[a.candles.length - 1].time)]));

  /** Index de la dernière bougie close ≤ jour (null si l'actif n'a pas encore coté). */
  const idxAt = (a: Asset, day: string): number | null => {
    const i = a.dayIndex.get(day);
    if (i != null) return i;
    const j = a.candles.findLastIndex((c) => dayOf(c.time) <= day);
    return j >= 0 ? j : null;
  };
  const lastClose = (coinId: string, day: string): number | null => {
    const a = assetOf(coinId);
    const i = a ? idxAt(a, day) : null;
    return a && i != null ? a.candles[i].close : null;
  };

  let book: Book = { cashUsd: cfg.startCashUsd, positions: {} };
  let peak = cfg.startCashUsd;
  let trough = cfg.startCashUsd;
  const fills: Fill[] = [];
  const skipped: SimResult['skipped'] = [];
  const series: DayPoint[] = [];
  const lastFill = new Map<string, string>();
  const record = (f: Fill, day: string) => {
    fills.push(f);
    if (f.tag) { lastFill.set(f.tag, day); lastFill.set(`${f.tag}|${f.coinId}`, day); }
  };
  const equity = (day: string) => book.cashUsd + Object.values(book.positions).reduce((sum, p) => sum + p.quantity * (lastClose(p.coinId, day) ?? 0), 0);

  const settle = (E: string, openedToday: Set<string>) => {
    for (const coinId of Object.keys(book.positions).sort()) {
      const a = assetOf(coinId);
      const i = a?.dayIndex.get(E);
      if (a && i != null) {
        const r = settleBar(book, coinId, a.candles[i], cfg.costs, `${E}T12:00:00.000Z`, { gapRule: !openedToday.has(coinId) });
        book = r.book;
        for (const f of r.fills) record(f, E);
      } else if (a && (lastDayOf.get(a.id) ?? '') < E) {
        const r = delist(book, coinId, a.candles[a.candles.length - 1].close, cfg.costs, `${E}T00:00:00.000Z`);
        book = r.book;
        if (r.fill) record(r.fill, E);
      }
    }
  };

  const universeTop = cfg.universeTop ?? s.universeTop ?? AUTOPILOT_UNIVERSE_TOP;
  for (let n = 1; n < days.length; n++) {
    const E = days[n];
    if (E < cfg.from || E > cfg.to) continue;
    const D = days[n - 1];
    const scheduled = (dw: number[]) => dw.includes(dow(E));
    const dep = s.deposit({ execDay: E, scheduled }, params);
    if (dep > 0) book = { ...book, cashUsd: book.cashUsd + dep };
    if (cfg.fill === 'nextClose') settle(E, new Set());

    const bi = btc ? btc.dayIndex.get(D) : undefined;
    const btcWin = btc && bi != null ? btc.candles.slice(Math.max(0, bi - 399), bi + 1) : [];
    const metricsCache = new Map<string, AssetMetrics | null>();
    const candlesFn = (coinId: string) => {
      const a = assetOf(coinId);
      const i = a ? idxAt(a, D) : null;
      return a && i != null ? a.candles.slice(Math.max(0, i - 399), i + 1) : [];
    };
    const ctx: StrategyContext = {
      decidedOn: D, execDay: E, scheduled,
      timeframe: '1d', slotIso: `${E}T08:00:00.000Z`,
      universe: universeAt(data.assets, D, { top: universeTop }).map((a, k) => ({ coinId: toCoinId(a.id), symbol: a.id.toLowerCase(), name: a.id, rank: k + 1, available: null })),
      candles: candlesFn,
      temperature: data.temperature.get(D) ?? null,
      btcAboveSma200: btc && bi != null && Number.isFinite(btcSma[bi]) ? btc.candles[bi].close > btcSma[bi] : null,
      regime: regimes.get(D) ?? null,
      metrics: (coinId: string) => {
        if (!metricsCache.has(coinId)) metricsCache.set(coinId, computeAssetMetrics(candlesFn(coinId), btcWin));
        return metricsCache.get(coinId) ?? null;
      },
      portfolio: {
        cashUsd: book.cashUsd, equityUsd: equity(D), peakEquityUsd: peak, minSincePeakUsd: trough,
        positions: Object.values(book.positions),
        lastFillOn: (tag, coinId) => lastFill.get(coinId ? `${tag}|${coinId}` : tag) ?? null,
      },
    };
    const field = cfg.fill === 'nextOpen' ? 'open' : 'close';
    const openedToday = new Set<string>();
    const overlay = applyRiskOverlay(s.decide(ctx, params), ctx, s.riskOverlay);
    for (const sk of overlay.skipped) skipped.push({ day: E, symbol: sk.symbol, why: sk.why });
    for (const intent of overlay.intents) {
      const a = assetOf(intent.coinId);
      const idxE = a?.dayIndex.get(E);
      const barE = a && idxE != null ? a.candles[idxE] : null;
      if (!barE) { skipped.push({ day: E, symbol: intent.symbol, why: 'pas de cotation ce jour-là' }); continue; }
      const isLimit = intent.orderType === 'limit' && intent.limitPrice != null && intent.side === 'buy';
      const price = isLimit ? pendingHit('limitBuy', intent.limitPrice!, barE) : barE[field];
      if (price == null) { skipped.push({ day: E, symbol: intent.symbol, why: 'ordre limite non touché' }); continue; }
      const r = applyIntent(book, intent, price, cfg.costs, { at: `${E}T${field === 'open' ? '00:00:00' : '23:59:59'}.000Z`, day: E, minOrderUsd: cfg.minOrderUsd, asLimit: isLimit });
      if (r.skip) { skipped.push({ day: E, symbol: intent.symbol, why: r.skip }); continue; }
      book = r.book;
      if (r.fill) { record(r.fill, E); if (r.fill.side === 'buy') openedToday.add(intent.coinId); }
    }
    if (cfg.fill === 'nextOpen') settle(E, openedToday);
    const value = equity(E);
    if (value >= peak) { peak = value; trough = value; } else trough = Math.min(trough, value);
    series.push({ day: E, valueUsd: value, cashUsd: book.cashUsd, flowUsd: dep });
  }
  return { series, fills, skipped };
}

/** Bougies d'un actif pour un identifiant de stratégie (utile aux rapports). */
export const candlesOf = (assets: Asset[], coinId: string): Candle[] => assets.find((a) => a.id === toSymbol(coinId))?.candles ?? [];
