// Crypto.com — liste publique des paires au comptant de l'Exchange (sans clé, sans compte).
// Elle sert à vérifier qu'une crypto est achetable sur Crypto.com ; la liste de l'application est très proche.

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { getJson } from './http';

const URL_INSTRUMENTS = 'https://api.crypto.com/exchange/v1/public/get-instruments';
const CACHE_KEY = 'boussole-cdc-listing';

interface Instrument {
  inst_type?: string;
  base_ccy?: string;
  tradable?: boolean;
}

export function parseInstruments(json: unknown): string[] {
  const list = ((json as { result?: { data?: Instrument[] } })?.result?.data ?? []) as Instrument[];
  const set = new Set<string>();
  for (const i of list) if (i.inst_type === 'CCY_PAIR' && i.tradable !== false && i.base_ccy) set.add(i.base_ccy.toUpperCase());
  return [...set].sort();
}

export async function fetchCryptoComSymbols(): Promise<string[]> {
  let json: unknown;
  if (Capacitor.isNativePlatform()) {
    // L'API n'envoie pas d'en-tête CORS : sur Android, la requête part du côté natif.
    const r = await CapacitorHttp.get({ url: URL_INSTRUMENTS, headers: { Accept: 'application/json' }, connectTimeout: 15000, readTimeout: 20000 });
    json = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  } else {
    json = await getJson<unknown>(URL_INSTRUMENTS, { timeoutMs: 20000 });
  }
  const symbols = parseInstruments(json);
  if (symbols.length < 50) throw new Error('Liste Crypto.com inattendue.');
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), symbols })); } catch { /* stockage indisponible */ }
  return symbols;
}

/** Dernière liste mémorisée (utile hors connexion) ; null si elle a plus de 14 jours. */
export function readCachedSymbols(): { at: number; symbols: string[] } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { at: number; symbols: string[] };
    return Date.now() - v.at < 14 * 86400_000 && Array.isArray(v.symbols) ? v : null;
  } catch {
    return null;
  }
}
