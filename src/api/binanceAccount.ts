// Binance — compte en LECTURE SEULE : soldes spot via une clé API restreinte (« Enable Reading » uniquement),
// et Simple Earn flexible (endpoint public). Aucune opération d'achat/vente/retrait n'est jamais signée :
// la clé recommandée n'a pas ces permissions, et Boussole ne les demande pas.

import { getJson } from './http';

const API = 'https://api.binance.com';

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256 en hex (WebCrypto : fonctionne dans Electron, la WebView Android et Node ≥ 20). */
export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return toHex(sig);
}

/** Construit la query signée d'un appel privé Binance (signature = HMAC de la query, clé = secret). */
export async function signedQuery(params: Record<string, string>, secret: string): Promise<string> {
  const q = new URLSearchParams({ timestamp: String(Date.now()), recvWindow: '10000', ...params });
  const sig = await hmacSha256Hex(secret, q.toString());
  q.set('signature', sig);
  return q.toString();
}

export interface BinanceAsset {
  asset: string;
  free: number;
  locked: number;
}

/** Soldes spot du compte (clé en lecture seule). */
export async function getBinanceAccount(key: string, secret: string): Promise<BinanceAsset[]> {
  const q = await signedQuery({}, secret);
  const r = await getJson<{ balances: { asset: string; free: string; locked: string }[] }>(`${API}/api/v3/account?${q}`, {
    timeoutMs: 15000,
    headers: { 'X-MBX-APIKEY': key },
  });
  return r.balances
    .map((b) => ({ asset: b.asset, free: Number(b.free), locked: Number(b.locked) }))
    .filter((a) => a.free + a.locked > 0);
}

export interface BinanceKeyTest {
  ok: boolean;
  assets: number;
  error?: string;
}

/** Teste une paire clé/secret : renvoie le nombre d'actifs lus, ou l'erreur (clé invalide, IP non autorisée…). */
export async function testBinanceKey(key: string, secret: string): Promise<BinanceKeyTest> {
  try {
    const assets = await getBinanceAccount(key, secret);
    return { ok: true, assets: assets.length };
  } catch (e) {
    return { ok: false, assets: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface EarnProduct {
  asset: string;
  /** Rendement annuel en % (calculé du taux journalier quand l'annualisé n'est pas fourni). */
  apy: number | null;
  minAmount: number | null;
  flexible: boolean;
}

/**
 * Simple Earn flexible (endpoint public, aucune clé requise). Renvoie null si l'endpoint échoue :
 * l'application affiche alors « données indisponibles » plutôt qu'une liste vide trompeuse.
 */
export async function getBinanceFlexibleEarn(key?: string): Promise<EarnProduct[] | null> {
  try {
    const r = await getJson<Record<string, unknown>[]>(`${API}/sapi/v1/lending/daily/product/list`, {
      timeoutMs: 15000,
      retries: 1,
      headers: key ? { 'X-MBX-APIKEY': key } : undefined,
    });
    if (!Array.isArray(r)) return null;
    return r
      .map((p) => {
        const daily = Number(p.dailyInterestRate);
        const annualized = p.annualizedPercentageRate != null ? Number(p.annualizedPercentageRate) : Number.isFinite(daily) ? daily * 365 : NaN;
        return {
          asset: String(p.asset ?? ''),
          apy: Number.isFinite(annualized) ? annualized * 100 : null,
          minAmount: p.minPurchaseAmount != null && Number.isFinite(Number(p.minPurchaseAmount)) ? Number(p.minPurchaseAmount) : null,
          flexible: true,
        };
      })
      .filter((p) => p.asset && (p.apy != null || p.minAmount != null))
      .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));
  } catch {
    return null;
  }
}
