// Sources de données du serveur pour les autopilotes : Binance (bougies), CoinGecko (classement, petites
// capitalisations), alternative.me et bitcoin-data.com (température), Crypto.com (disponibilité). Mémorisées
// entre les cycles : le serveur tourne toutes les 5 minutes, ces données bougent au plus une fois par heure.

import type { CgMarket } from '../api/coingecko';
import { getAllPrices, getDailyHistory } from '../api/binance';
import { parseInstruments } from '../api/cryptocom';
import { autoBaseUniverse } from '../lib/autoBasket';
import { hourlyBetween, pairOf } from '../lib/lab/pairs';
import { temperatureSeries } from '../lib/lab/replayTemp';
import type { AutopilotSources } from '../lib/lab/autopilot';
import type { Candle } from '../lib/indicators';
import type { ProfileRules } from '../types';

const H = 3600_000;
const memo = new Map<string, { at: number; value: unknown }>();
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

export async function runnerAutopilotSources(coingeckoKey: string | null, rules: ProfileRules): Promise<AutopilotSources> {
  const top = await cached('markets', 24 * H, () => markets(coingeckoKey, 1));
  const prices = await getAllPrices();
  const symbolOf = (coinId: string) => {
    const m = top.find((x) => x.id === coinId);
    return pairOf({ coinId, symbol: m?.symbol ?? coinId }, prices, m?.current_price ?? null);
  };
  const daily = (sym: string) => cached<Candle[]>(`daily:${sym}`, 6 * H, async () => {
    const cs = await getDailyHistory(sym, Date.UTC(2017, 7, 17));
    const last = cs[cs.length - 1];
    return last && last.time + 86400 > Date.now() / 1000 ? cs.slice(0, -1) : cs; // bougies closes seulement
  });
  const temps = await cached('temps', 6 * H, async () => {
    const btc = await daily('BTCUSDT');
    const fngRows = await getJson<{ data: { value: string; timestamp: string }[] }>('https://api.alternative.me/fng/?limit=0&format=json').then((r) => r.data).catch(() => []);
    const mvrvRows = await getJson<{ d: string; mvrv: number }[]>('https://bitcoin-data.com/v1/mvrv').catch(() => []);
    const fng = new Map(fngRows.map((x) => [new Date(Number(x.timestamp) * 1000).toISOString().slice(0, 10), Number(x.value)]));
    const mvrv = new Map(mvrvRows.filter((x) => Number(x.mvrv) > 0).map((x) => [x.d, Number(x.mvrv)]));
    return temperatureSeries(btc, fng, mvrv);
  });
  const available = await cached<string[] | null>('cdc', 6 * H, () => getJson<unknown>('https://api.crypto.com/exchange/v1/public/get-instruments').then(parseInstruments).catch(() => null));
  return {
    daily: async (coinId) => { const s = symbolOf(coinId); return s ? daily(s) : []; },
    hourly: async (coinId, fromMs, toMs) => { const s = symbolOf(coinId); return s ? hourlyBetween(s, fromMs, toMs) : []; },
    temperatureAt: (day) => temps.get(day) ?? null,
    universe: async () => autoBaseUniverse(top).map((u) => ({ coinId: u.id, symbol: u.symbol, name: u.name, rank: u.rank, available: available ? available.includes(u.symbol.toUpperCase()) : null })),
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
