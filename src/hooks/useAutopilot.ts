// Fait tourner les autopilotes dans l'application : au lancement, puis toutes les 15 minutes. Les jours manqués
// (application fermée) sont rattrapés à l'identique ; le serveur veilleur fait le même calcul application fermée.

import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { useMarkets } from './useMarket';
import { useCryptoComListing } from './useCryptoCom';
import { getAllPrices, getKlines } from '../api/binance';
import { getMarkets, type CgMarket } from '../api/coingecko';
import { getFearGreed } from '../api/feargreed';
import { loadDailyHistory } from '../api/history';
import { createHourlyCache } from '../lib/lab/candleCache';
import { hourlyBetween, pairOf } from '../lib/lab/pairs';
import { topBaseUniverse, AUTOPILOT_UNIVERSE_TOP } from '../lib/autoBasket';
import { rulesOf } from '../lib/profile';
import { temperatureSeries } from '../lib/lab/replayTemp';
import { needsArchive, tickAutopilot, type AutopilotSources } from '../lib/lab/autopilot';
import { renewAutopilot } from '../lib/lab/autopilotFactory';
import type { Candle } from '../lib/indicators';
import type { ProfileRules } from '../types';

const appHourlyCache = createHourlyCache((sym, fromMs, toMs) => hourlyBetween(sym, fromMs, toMs));
const app4hCache = new Map<string, { at: number; data: Candle[] }>();
let appFundingCache: { at: number; map: Map<string, number> } | null = null;

async function loadAllFunding(): Promise<Map<string, number>> {
  if (appFundingCache && Date.now() - appFundingCache.at < 15 * 60_000) return appFundingCache.map;
  try {
    const r = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex', { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return appFundingCache?.map ?? new Map();
    const rows = (await r.json()) as { symbol: string; lastFundingRate: string }[];
    const map = new Map<string, number>();
    for (const row of rows) {
      const v = Number(row.lastFundingRate);
      if (Number.isFinite(v)) map.set(row.symbol, v);
    }
    appFundingCache = { at: Date.now(), map };
    return map;
  } catch {
    return appFundingCache?.map ?? new Map();
  }
}

async function load4hClosed(sym: string): Promise<Candle[]> {
  const hit = app4hCache.get(sym);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.data;
  const raw = await getKlines(sym, '4h', 250).catch(() => [] as Candle[]);
  const last = raw[raw.length - 1];
  const closed = last && last.time + 4 * 3600 > Date.now() / 1000 ? raw.slice(0, -1) : raw;
  if (closed.length) app4hCache.set(sym, { at: Date.now(), data: closed });
  return closed;
}

/** Sources de données de l'application (Binance, CoinGecko, alternative.me) pour le tick. */
export async function appSources(markets: CgMarket[], cdcSymbols: string[] | null, rules: ProfileRules): Promise<AutopilotSources> {
  const [prices, fundingMap] = await Promise.all([getAllPrices(), loadAllFunding()]);
  const symbolOf = (coinId: string) => {
    const m = markets.find((x) => x.id === coinId);
    return pairOf({ coinId, symbol: m?.symbol ?? coinId }, prices, m?.current_price ?? null);
  };
  const btc = await loadDailyHistory('BTCUSDT');
  const fng = new Map((await getFearGreed(0).catch(() => [])).map((p) => [new Date(p.time * 1000).toISOString().slice(0, 10), p.value]));
  const temps = temperatureSeries(btc, fng, new Map());
  let smallCaps: CgMarket[] | null | undefined;
  return {
    daily: async (coinId) => { const s = symbolOf(coinId); return s ? loadDailyHistory(s) : []; },
    hourly: async (coinId, fromMs, toMs) => { const s = symbolOf(coinId); return s ? appHourlyCache.get(s, fromMs, toMs) : []; },
    candles4h: async (coinId) => { const s = symbolOf(coinId); return s ? load4hClosed(s) : []; },
    fundingAt: (coinId) => { const s = symbolOf(coinId); return s ? fundingMap.get(s) ?? null : null; },
    temperatureAt: (day) => temps.get(day) ?? null,
    universe: async () => topBaseUniverse(markets.map((m) => ({ id: m.id, symbol: m.symbol, name: m.name, image: m.image, rank: m.market_cap_rank })), AUTOPILOT_UNIVERSE_TOP)
      .filter((u) => symbolOf(u.id) != null)
      .map((u) => ({ coinId: u.id, symbol: u.symbol, name: u.name, rank: u.rank, available: cdcSymbols ? cdcSymbols.includes(u.symbol.toUpperCase()) : null })),
    live: async () => {
      if (smallCaps === undefined) {
        const pages = await Promise.allSettled([2, 3, 4, 5].map((page) => getMarkets({ page, perPage: 250 })));
        const ok = pages.flatMap((p) => (p.status === 'fulfilled' ? p.value : []));
        smallCaps = ok.length ? ok : null;
      }
      return markets.length ? { markets, smallCaps, rules } : null;
    },
  };
}

export function useAutopilot(): void {
  const markets = useMarkets();
  const cdc = useCryptoComListing();
  const ref = useRef({ markets: markets.data, cdc: cdc.data });
  ref.current = { markets: markets.data, cdc: cdc.data };
  const ready = !!markets.data;
  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const st = useStore.getState();
        const active = st.paperPortfolios.filter((p) => p.kind === 'auto' && !p.archived && !p.paused);
        if (!active.length) return;
        // Règles changées depuis la création : l'autopilote est archivé et un neuf démarre (verdict reparti de zéro).
        for (const p of active.filter((x) => needsArchive(x))) {
          const r = renewAutopilot(p, Date.now());
          st.upsertPaperPortfolio(r.archived);
          if (r.fresh) st.upsertPaperPortfolio(r.fresh);
        }
        const src = await appSources(ref.current.markets ?? [], ref.current.cdc ?? null, rulesOf(st.profile));
        const device = st.settings.deviceId || 'application';
        for (const p of useStore.getState().paperPortfolios.filter((x) => x.kind === 'auto' && !x.archived && !x.paused)) {
          if (stopped) return;
          const now = useStore.getState();
          const r = await tickAutopilot(p, now.paperDays.filter((l) => l.portfolioId === p.id), Date.now(), src, device);
          if (r.changed.length) useStore.getState().applyPaperDays(r.changed);
          if (r.portfolio.cursorDay !== p.cursorDay || r.portfolio.cursorSlot !== p.cursorSlot || r.portfolio.settledTo !== p.settledTo || r.portfolio.universeWeek !== p.universeWeek) useStore.getState().upsertPaperPortfolio(r.portfolio);
        }
      } catch {
        /* réseau indisponible : on réessaiera ; aucun jour n'est inventé */
      } finally {
        running = false;
      }
    };
    void run();
    const timer = setInterval(() => void run(), 15 * 60_000);
    return () => { stopped = true; clearInterval(timer); };
  }, [ready]);
}
