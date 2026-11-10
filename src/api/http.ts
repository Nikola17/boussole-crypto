// Client HTTP : délai max, nouvelles tentatives, et file d'attente par hôte pour respecter
// les limites des API gratuites (CoinGecko public ≈ 5 à 30 requêtes / minute).

export class HttpError extends Error {
  status: number;
  host: string;
  constructor(status: number, host: string, message: string) {
    super(message);
    this.status = status;
    this.host = host;
  }
}

const MIN_INTERVAL_MS: Record<string, number> = {
  'api.coingecko.com': 4500,
  'api.geckoterminal.com': 2100,
  'api.dexscreener.com': 250,
  'api.gopluslabs.io': 1200,
  'api.rugcheck.xyz': 700,
  'lite-api.jup.ag': 300,
  'mempool.space': 300,
  'yields.llama.fi': 150,
  'api.crypto.com': 300,
};

let coingeckoHasKey = false;
export function setCoinGeckoKeyPresent(v: boolean) {
  coingeckoHasKey = v;
}

const lastCall = new Map<string, number>();
const chains = new Map<string, Promise<void>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function intervalFor(host: string): number {
  if (host === 'api.coingecko.com' && coingeckoHasKey) return 2100;
  return MIN_INTERVAL_MS[host] ?? 0;
}

async function throttle(host: string): Promise<void> {
  const interval = intervalFor(host);
  if (!interval) return;
  const prev = chains.get(host) ?? Promise.resolve();
  const mine = prev.then(async () => {
    const wait = (lastCall.get(host) ?? 0) + interval - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall.set(host, Date.now());
  });
  chains.set(host, mine.catch(() => undefined));
  await mine;
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

function friendly(status: number, host: string): string {
  if (status === 429) {
    if (host.includes('coingecko')) return 'CoinGecko limite le nombre de requêtes. Patiente une minute ou ajoute une clé « Demo » gratuite dans Réglages.';
    return `Trop de requêtes vers ${host}. Réessaie dans un instant.`;
  }
  if (status === 401 || status === 403) return `Accès refusé par ${host}.`;
  if (status === 404) return `Donnée introuvable sur ${host}.`;
  if (status >= 500) return `${host} est momentanément indisponible.`;
  return `Erreur ${status} sur ${host}.`;
}

/**
 * Quand et combien de temps attendre avant de réessayer. Une SEULE couche de nouvelles tentatives existe (ici) :
 * React Query ne réessaie plus, sinon les deux se multipliaient (jusqu'à 6 tentatives, une minute de blocage derrière une erreur 429).
 *  - 429 (limite atteinte) : un seul nouvel essai, après le délai demandé par le serveur mais jamais plus de 8 s ;
 *  - 5xx ou réseau coupé : jusqu'à `maxRetries` essais, avec un délai qui double ;
 *  - autres 4xx (introuvable, accès refusé…) : inutile de réessayer.
 */
export function retryPlan(status: number | null, retryAfter: string | null, attempt: number, maxRetries: number): { retry: boolean; waitMs: number } {
  if (attempt >= maxRetries) return { retry: false, waitMs: 0 };
  if (status === 429) {
    if (attempt >= 1) return { retry: false, waitMs: 0 };
    const ra = Number(retryAfter);
    return { retry: true, waitMs: Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 8000) : 5000 };
  }
  if (status === null) return { retry: true, waitMs: 800 * 2 ** attempt };
  if (status >= 500) return { retry: true, waitMs: 1200 * 2 ** attempt };
  return { retry: false, waitMs: 0 };
}

export async function request(url: string, opts: RequestOptions = {}): Promise<Response> {
  const host = new URL(url).host;
  const retries = opts.retries ?? 2;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(host);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25000);
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener('abort', onAbort);
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: { Accept: 'application/json', ...(opts.headers ?? {}) },
        body: opts.body,
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        const plan = retryPlan(res.status, res.headers.get('retry-after'), attempt, retries);
        if (plan.retry) {
          await sleep(plan.waitMs);
          continue;
        }
      }
      if (!res.ok) throw new HttpError(res.status, host, friendly(res.status, host));
      return res;
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError) throw e;
      if (opts.signal?.aborted) throw e;
      const plan = retryPlan(null, null, attempt, retries);
      if (plan.retry) {
        await sleep(plan.waitMs);
        continue;
      }
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  }
  if (lastErr instanceof Error && lastErr.name === 'AbortError') throw new Error(`Délai dépassé en contactant ${host}.`);
  throw lastErr instanceof Error ? lastErr : new Error(`Impossible de joindre ${host}.`);
}

export async function getJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(url, opts);
  return (await res.json()) as T;
}

export async function postJson<T>(url: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
  const res = await request(url, {
    ...opts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

/** Exécute des tâches asynchrones avec une concurrence limitée. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>, onProgress?: (done: number) => void): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = null;
      }
      done++;
      onProgress?.(done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Comme `pool`, mais sans masquer les échecs : on sait combien de tâches ont échoué et pourquoi.
 * Les appelants lèvent une erreur quand TOUT a échoué (au lieu d'afficher « aucune donnée » comme si c'était normal)
 * et signalent « données partielles » quand une partie seulement a échoué.
 */
export async function poolStrict<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<{ results: (R | null)[]; failed: number; firstError: unknown }> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let failed = 0;
  let firstError: unknown = null;
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (e) {
        failed++;
        if (firstError == null) firstError = e;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return { results, failed, firstError };
}
