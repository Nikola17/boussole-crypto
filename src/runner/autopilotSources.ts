// Sources de données du serveur pour les autopilotes : Binance (bougies), CoinGecko (classement, petites
// capitalisations), alternative.me et bitcoin-data.com (température), Crypto.com (disponibilité). Mémorisées
// entre les cycles : le serveur tourne toutes les 5 minutes, ces données bougent au plus une fois par heure.

import type { CgMarket } from '../api/coingecko';
import { getAllPrices, getDailyHistory, getKlines } from '../api/binance';
import { parseInstruments } from '../api/cryptocom';
import { topBaseUniverse, AUTOPILOT_UNIVERSE_TOP } from '../lib/autoBasket';
import { createDailyCache, createHourlyCache } from '../lib/lab/candleCache';
import { hourlyBetween, pairOf } from '../lib/lab/pairs';
import { temperatureSeries } from '../lib/lab/replayTemp';
import type { AutopilotSources } from '../lib/lab/autopilot';
import type { Candle } from '../lib/indicators';
import type { ProfileRules } from '../types';

const H = 3600_000;
const memo = new Map<string, { at: number; value: unknown }>();
const dailyCache = createDailyCache((sym, startMs) => getDailyHistory(sym, startMs), { refreshMs: 6 * H });
const hourlyCache = createHourlyCache((sym, fromMs, toMs) => hourlyBetween(sym, fromMs, toMs));

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  memo.set(key, { at: Date.now(), value });
  return value;
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${new URL(url).host} a répondu ${r.status}`);
  return (await r.json()) as T;
}

const markets = (key: string | null, page: number) => getJson<CgMarket[]>(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&price_change_percentage=7d,30d`, key ? { 'x-cg-demo-api-key': key } : {});

/** Top 500 CoinGecko (pages 1 et 2, repli gracieux sur la page 1 si la page 2 échoue). */
async function loadTop500(key: string | null): Promise<CgMarket[]> {
  const p1 = await markets(key, 1);
  const p2 = await markets(key, 2).catch(() => [] as CgMarket[]);
  const seen = new Set<string>();
  const out: CgMarket[] = [];
  for (const row of [...p1, ...p2]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export async function runnerAutopilotSources(coingeckoKey: string | null, rules: ProfileRules): Promise<AutopilotSources> {
  const top = await cached('markets:top500', 24 * H, () => loadTop500(coingeckoKey));
  // Liste des paires Binance : sert à trouver le symbole de chaque crypto ; mémorisée 10 minutes (alertes de trades, signaux et autopilotes l'appellent à chaque cycle).
  const prices = await cached('prices', 10 * 60_000, getAllPrices);
  const fundingMap = await cached('funding:all', 15 * 60_000, async () => {
    const rows = await getJson<{ symbol: string; lastFundingRate: string }[]>('https://fapi.binance.com/fapi/v1/premiumIndex').catch(() => []);
    const map = new Map<string, number>();
    for (const r of rows) { const v = Number(r.lastFundingRate); if (Number.isFinite(v)) map.set(r.symbol, v); }
    return map;
  });
  const symbolOf = (coinId: string) => {
    const m = top.find((x) => x.id === coinId);
    return pairOf({ coinId, symbol: m?.symbol ?? coinId }, prices, m?.current_price ?? null);
  };
  const temps = await cached('temps', 6 * H, async () => {
    const btc = await dailyCache.get('BTCUSDT');
    const fngRows = await getJson<{ data: { value: string; timestamp: string }[] }>('https://api.alternative.me/fng/?limit=0&format=json').then((r) => r.data).catch(() => []);
    const mvrvRows = await getJson<{ d: string; mvrv: number }[]>('https://bitcoin-data.com/v1/mvrv').catch(() => []);
    const fng = new Map(fngRows.map((x) => [new Date(Number(x.timestamp) * 1000).toISOString().slice(0, 10), Number(x.value)]));
    const mvrv = new Map(mvrvRows.filter((x) => Number(x.mvrv) > 0).map((x) => [x.d, Number(x.mvrv)]));
    return temperatureSeries(btc, fng, mvrv);
  });
  const available = await cached<string[] | null>('cdc', 6 * H, () => getJson<unknown>('https://api.crypto.com/exchange/v1/public/get-instruments').then(parseInstruments).catch(() => null));
  const load4h = (sym: string) => cached<Candle[]>(`4h:${sym}`, 30 * 60_000, async () => {
    const raw = await getKlines(sym, '4h', 250).catch(() => [] as Candle[]);
    const last = raw[raw.length - 1];
    return last && last.time + 4 * 3600 > Date.now() / 1000 ? raw.slice(0, -1) : raw;
  });
  return {
    daily: async (coinId) => { const s = symbolOf(coinId); return s ? dailyCache.get(s) : []; },
    hourly: async (coinId, fromMs, toMs) => { const s = symbolOf(coinId); return s ? hourlyCache.get(s, fromMs, toMs) : []; },
    candles4h: async (coinId) => { const s = symbolOf(coinId); return s ? load4h(s) : []; },
    fundingAt: (coinId) => { const s = symbolOf(coinId); return s ? fundingMap.get(s) ?? null : null; },
    temperatureAt: (day) => temps.get(day) ?? null,
    universe: async () => topBaseUniverse(top.map((m) => ({ id: m.id, symbol: m.symbol, name: m.name, image: m.image, rank: m.market_cap_rank })), AUTOPILOT_UNIVERSE_TOP)
      .filter((u) => symbolOf(u.id) != null)
      .map((u) => ({ coinId: u.id, symbol: u.symbol, name: u.name, rank: u.rank, available: available ? available.includes(u.symbol.toUpperCase()) : null })),
    live: async () => {
      const smallCaps = await cached<CgMarket[] | null>('smallcaps', 24 * H, async () => {
        const pages = await Promise.allSettled([2, 3, 4, 5].map((p) => markets(coingeckoKey, p)));
        const ok = pages.flatMap((p) => (p.status === 'fulfilled' ? p.value : []));
        return ok.length ? ok : null;
      });
      return { markets: top, smallCaps, rules };
    },
  };
}
