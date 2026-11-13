// Prix du marché pour le runner (CoinGecko « simple/price », comme le script d'arrière-plan Android)
// et indice Fear & Greed (alternative.me). Le client HTTP complet de l'application (file d'attente par hôte)
// vit côté navigateur : ici, requête unique, frais, et une erreur explicite — jamais un prix inventé.

import type { Candle } from '../lib/indicators';

export interface CoinPrice {
  usd?: number;
  eur?: number;
  /** Variation 24 h (en %) telle que CoinGecko la donne. */
  change?: number;
}

const TIMEOUT_MS = 20_000;

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctrl.signal });
    if (!res.ok) {
      if (res.status === 429) throw new Error('CoinGecko : limite de requêtes atteinte (ajoute une clé « Demo » gratuite dans la configuration).');
      throw new Error(`CoinGecko a répondu ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Historique journalier du Bitcoin (Binance public, sans clé) pour la « température du marché ».
 * 500 bougies : assez pour les moyennes 200 jours et 200 semaines ; null en cas d'échec (la température attendra).
 */
export async function fetchBtcDaily(): Promise<Candle[] | null> {
  try {
    const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=500', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const raw = (await res.json()) as [number, string, string, string, string, ...unknown[]][];
    return raw.map((k) => ({ time: Math.round(k[0] / 1000), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]) })).filter((c) => Number.isFinite(c.close));
  } catch {
    return null;
  }
}

/** Taux de financement du perpétuel BTC (Binance futures, public) : carburant de la température. */
export async function fetchBtcFunding(): Promise<number | null> {
  try {
    const res = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const r = (await res.json()) as { lastFundingRate?: string };
    const v = Number(r.lastFundingRate);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Prix en USD et EUR (+ variation 24 h) d'une liste d'identifiants CoinGecko.
 * Erreur → exception : l'appelant ne consommera rien ce cycle-ci.
 */
export async function fetchPrices(ids: string[], coingeckoKey: string | null): Promise<Record<string, CoinPrice>> {
  const uniq = [...new Set(ids)].filter(Boolean).slice(0, 90); // même plafond de prudence que le script Android
  if (!uniq.length) return {};
  const headers: Record<string, string> = {};
  if (coingeckoKey) headers['x-cg-demo-api-key'] = coingeckoKey;
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(uniq.join(','))}&vs_currencies=usd,eur&include_24h_change=true`;
  const raw = await getJson<Record<string, { usd?: number; eur?: number; usd_24h_change?: number; eur_24h_change?: number }>>(url, headers);
  const out: Record<string, CoinPrice> = {};
  for (const [id, p] of Object.entries(raw)) {
    if (!p || typeof p !== 'object') continue;
    const change = typeof p.usd_24h_change === 'number' ? p.usd_24h_change : p.eur_24h_change;
    out[id] = { usd: typeof p.usd === 'number' ? p.usd : undefined, eur: typeof p.eur === 'number' ? p.eur : undefined, change: typeof change === 'number' ? change : undefined };
  }
  return out;
}

/** Indice Fear & Greed du jour (null : indisponible, sans bloquer le reste). Mêmes libellés que l'application. */
export async function fetchFearGreed(): Promise<{ value: number; label: string } | null> {
  try {
    const raw = await getJson<{ data?: { value?: string; value_classification?: string }[] }>('https://api.alternative.me/fng/?limit=1&format=json', {});
    const d = raw.data?.[0];
    if (!d || d.value == null) return null;
    const value = Number(d.value);
    if (!Number.isFinite(value)) return null;
    const LABELS: Record<string, string> = { 'Extreme Fear': 'Peur extrême', Fear: 'Peur', Neutral: 'Neutre', Greed: 'Avidité', 'Extreme Greed': 'Avidité extrême' };
    return { value, label: LABELS[d.value_classification ?? ''] ?? d.value_classification ?? '' };
  } catch {
    return null; // le brief n'a pas besoin du Fear & Greed pour exister
  }
}
