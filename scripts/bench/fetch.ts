// Données du banc d'essai : bougies journalières Binance (paires retirées comprises), Fear & Greed, MVRV.
// Cache local `.cache/bench/` (hors dépôt), réutilisé s'il a moins de 24 h. La bougie du jour en cours est retirée.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Candle } from '../../src/lib/indicators';

export const CACHE_DIR = join(process.cwd(), '.cache', 'bench');
const START = Date.UTC(2017, 7, 17);
const DAY_MS = 86400_000;

function cached<T>(file: string): T | null {
  const p = join(CACHE_DIR, file);
  if (!existsSync(p) || Date.now() - statSync(p).mtimeMs > DAY_MS) return null;
  return JSON.parse(readFileSync(p, 'utf-8')) as T;
}
function save(file: string, data: unknown): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, file), JSON.stringify(data));
}

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'boussole-bench' } });
    if (r.ok) return (await r.json()) as T;
    if (r.status === 400) throw new Error(`absent (${r.status})`);
    if (attempt >= 3) throw new Error(`${url} → ${r.status}`);
    await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
  }
}

/** Toutes les bougies journalières closes d'une paire USDT depuis 2017 ; null si la paire n'existe pas. */
export async function loadDaily(symbol: string): Promise<Candle[] | null> {
  const file = `${symbol}-1d.json`;
  const hit = cached<Candle[]>(file);
  if (hit) return hit;
  const out: Candle[] = [];
  let cursor = START;
  for (let page = 0; page < 12; page++) {
    let raw: (string | number)[][];
    try {
      raw = await getJson<(string | number)[][]>(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=1000&startTime=${cursor}`);
    } catch (e) {
      if (String(e).includes('absent')) return null;
      throw e;
    }
    if (!raw.length) break;
    for (const k of raw) out.push({ time: Math.floor(Number(k[0]) / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[7], ...(k[10] != null ? { takerBuyQuote: +k[10] } : {}) } as Candle);
    if (raw.length < 1000) break;
    cursor = (out[out.length - 1].time + 86400) * 1000;
  }
  const last = out[out.length - 1];
  if (last && last.time + 86400 > Date.now() / 1000) out.pop();
  save(file, out);
  return out;
}

export async function loadFng(): Promise<Map<string, number>> {
  let rows = cached<{ value: string; timestamp: string }[]>('fng.json');
  if (!rows) {
    rows = (await getJson<{ data: { value: string; timestamp: string }[] }>('https://api.alternative.me/fng/?limit=0&format=json')).data;
    save('fng.json', rows);
  }
  return new Map(rows.map((x) => [new Date(Number(x.timestamp) * 1000).toISOString().slice(0, 10), Number(x.value)]));
}

export async function loadMvrv(): Promise<Map<string, number>> {
  let rows = cached<{ d: string; mvrv: number }[]>('mvrv.json');
  if (!rows) {
    try {
      rows = await getJson<{ d: string; mvrv: number }[]>('https://bitcoin-data.com/v1/mvrv');
    } catch {
      rows = []; // indisponible : la température rejouable s'en passe
    }
    save('mvrv.json', rows);
  }
  return new Map(rows.filter((r) => Number(r.mvrv) > 0).map((r) => [r.d, Number(r.mvrv)]));
}
