// Cache incrémental de bougies (1D et 1H) : partagé par le serveur veilleur et l'application.
// Évite de re-télécharger tout l'historique depuis 2017 à chaque expiration de TTL : seule la queue manquante
// est demandée à Binance puis fusionnée sans doublon. Fonctionne sans dépendance navigateur ni Node.

import { closedCandles, type Candle } from '../indicators';

const HOUR = 3600_000;
const DAY_START_DEFAULT = Date.UTC(2017, 7, 17);

/** Fusion par timestamp (secondes) : triée, sans doublon, les nouvelles bougies remplacent les anciennes. */
export function mergeCandles(existing: Candle[], incoming: Candle[]): Candle[] {
  if (!incoming.length) return existing;
  if (!existing.length) return [...incoming].sort((a, b) => a.time - b.time);
  const byTime = new Map<number, Candle>();
  for (const c of existing) byTime.set(c.time, c);
  for (const c of incoming) byTime.set(c.time, c);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export interface DailyCacheOptions {
  /** Début de l'historique initial (défaut : 17 août 2017, ouverture Binance). */
  startMs?: number;
  /** Durée avant de vérifier s'il existe de nouvelles bougies (défaut : 6 h). */
  refreshMs?: number;
  /** Horloge injectable (tests). */
  now?: () => number;
}

export interface DailyCache {
  get(symbol: string): Promise<Candle[]>;
  clear(): void;
}

/**
 * Cache incrémental de bougies journalières closes.
 * - Premier appel : charge depuis `startMs`.
 * - Appels suivants dans `refreshMs` : zéro appel réseau.
 * - Après `refreshMs` : ne demande que depuis la dernière bougie connue (`last.time * 1000`) et fusionne.
 * - En cas d'erreur réseau au rafraîchissement : conserve la série déjà connue au lieu de tout perdre.
 */
export function createDailyCache(
  fetchSince: (symbol: string, startMs: number) => Promise<Candle[]>,
  opts: DailyCacheOptions = {},
): DailyCache {
  const startMs = opts.startMs ?? DAY_START_DEFAULT;
  const refreshMs = opts.refreshMs ?? 6 * HOUR;
  const now = opts.now ?? Date.now;
  const store = new Map<string, { fetchedAt: number; candles: Candle[] }>();
  const inflight = new Map<string, Promise<Candle[]>>();

  const load = async (symbol: string): Promise<Candle[]> => {
    const t = now();
    const hit = store.get(symbol);
    if (hit && t - hit.fetchedAt < refreshMs) return closedCandles(hit.candles, t);
    const last = hit?.candles[hit.candles.length - 1];
    const from = last ? last.time * 1000 : startMs;
    try {
      const fresh = await fetchSince(symbol, from);
      const merged = hit ? mergeCandles(hit.candles, fresh) : mergeCandles([], fresh);
      store.set(symbol, { fetchedAt: t, candles: merged });
      return closedCandles(merged, t);
    } catch (e) {
      if (hit) return closedCandles(hit.candles, t);
      throw e;
    }
  };

  return {
    get(symbol: string): Promise<Candle[]> {
      const existing = inflight.get(symbol);
      if (existing) return existing;
      const p = load(symbol).finally(() => inflight.delete(symbol));
      inflight.set(symbol, p);
      return p;
    },
    clear() { store.clear(); inflight.clear(); },
  };
}

export interface HourlyCacheOptions {
  /** Nombre maximal de bougies 1 H gardées en mémoire par symbole (défaut : 2500 ≈ 104 jours). */
  maxBars?: number;
  now?: () => number;
}

export interface HourlyCache {
  get(symbol: string, fromMs: number, toMs: number): Promise<Candle[]>;
  clear(): void;
}

/**
 * Cache incrémental de bougies 1 heure closes.
 * Ne demande au réseau que les plages non encore couvertes (avant `minMs` ou après `maxMs`) et borne
 * la mémoire à `maxBars` par symbole.
 */
export function createHourlyCache(
  fetchRange: (symbol: string, fromMs: number, toMs: number) => Promise<Candle[]>,
  opts: HourlyCacheOptions = {},
): HourlyCache {
  const maxBars = opts.maxBars ?? 2500;
  const now = opts.now ?? Date.now;
  const store = new Map<string, { minMs: number; maxMs: number; candles: Candle[] }>();

  const slice = (candles: Candle[], fromMs: number, toMs: number) =>
    candles.filter((c) => c.time * 1000 >= fromMs && c.time * 1000 < toMs);

  return {
    async get(symbol: string, fromMs: number, toMs: number): Promise<Candle[]> {
      const start = Math.floor(fromMs / HOUR) * HOUR;
      const lastClosed = Math.floor(now() / HOUR) * HOUR;
      const end = Math.min(toMs, lastClosed);
      if (end <= start) return [];

      let entry = store.get(symbol);
      if (!entry) {
        const fetched = mergeCandles([], await fetchRange(symbol, start, end));
        const trimmed = fetched.length > maxBars ? fetched.slice(-maxBars) : fetched;
        const minMs = trimmed.length ? Math.min(start, trimmed[0].time * 1000) : start;
        entry = { minMs, maxMs: end, candles: trimmed };
        store.set(symbol, entry);
        return slice(entry.candles, start, end);
      }

      let candles = entry.candles;
      let minMs = entry.minMs;
      let maxMs = entry.maxMs;

      if (start < minMs) {
        const head = await fetchRange(symbol, start, minMs);
        candles = mergeCandles(candles, head);
        minMs = start;
      }
      if (end > maxMs) {
        const tail = await fetchRange(symbol, maxMs, end);
        candles = mergeCandles(candles, tail);
        maxMs = end;
      }
      if (candles.length > maxBars) {
        candles = candles.slice(-maxBars);
        minMs = Math.max(minMs, candles[0].time * 1000);
      }
      store.set(symbol, { minMs, maxMs, candles });
      return slice(candles, start, end);
    },
    clear() { store.clear(); },
  };
}
