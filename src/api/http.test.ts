import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError, poolStrict, request, retryPlan } from './http';

describe('nouvelles tentatives : une seule couche, délais bornés', () => {
  it('429 : un seul nouvel essai, après le délai du serveur plafonné à 8 s', () => {
    expect(retryPlan(429, null, 0, 2)).toEqual({ retry: true, waitMs: 5000 });
    expect(retryPlan(429, '3', 0, 2)).toEqual({ retry: true, waitMs: 3000 });
    expect(retryPlan(429, '120', 0, 2)).toEqual({ retry: true, waitMs: 8000 });
    expect(retryPlan(429, null, 1, 2).retry).toBe(false);
  });
  it('5xx et réseau coupé : jusqu’à `maxRetries` essais, délai qui double', () => {
    expect(retryPlan(503, null, 0, 2)).toEqual({ retry: true, waitMs: 1200 });
    expect(retryPlan(503, null, 1, 2)).toEqual({ retry: true, waitMs: 2400 });
    expect(retryPlan(503, null, 2, 2).retry).toBe(false);
    expect(retryPlan(null, null, 0, 2)).toEqual({ retry: true, waitMs: 800 });
  });
  it('autres 4xx : jamais de nouvel essai ; `retries: 0` les désactive tous', () => {
    for (const s of [400, 401, 403, 404]) expect(retryPlan(s, null, 0, 2).retry).toBe(false);
    expect(retryPlan(503, null, 0, 0).retry).toBe(false);
    expect(retryPlan(429, null, 0, 0).retry).toBe(false);
  });
});

describe('request : le nombre réel d’appels', () => {
  const URL = 'https://exemple.test/api'; // hôte sans limitation de débit
  const res = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Lance la requête et laisse passer les attentes (fausses horloges). */
  async function run(opts?: Parameters<typeof request>[1]) {
    const p = request(URL, opts).then((r) => ({ ok: true as const, r }), (e: unknown) => ({ ok: false as const, e }));
    await vi.advanceTimersByTimeAsync(60_000);
    return p;
  }

  it('429 puis succès : 2 appels', async () => {
    fetchMock.mockResolvedValueOnce(res(429, {}, { 'retry-after': '2' })).mockResolvedValueOnce(res(200));
    const out = await run();
    expect(out.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('429 répété : 2 appels seulement (avant : jusqu’à 6 avec React Query) puis erreur claire', async () => {
    fetchMock.mockImplementation(async () => res(429));
    const out = await run();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.e).toBeInstanceOf(HttpError);
      expect((out.e as HttpError).status).toBe(429);
    }
  });

  it('404 : 1 seul appel', async () => {
    fetchMock.mockImplementation(async () => res(404));
    const out = await run();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(false);
  });

  it('500 puis succès : 2 appels ; panne réseau deux fois puis succès : 3 appels', async () => {
    fetchMock.mockResolvedValueOnce(res(500)).mockResolvedValueOnce(res(200));
    expect((await run()).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new TypeError('network')).mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(res(200));
    expect((await run()).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('`retries: 0` : jamais de nouvel essai', async () => {
    fetchMock.mockImplementation(async () => res(503));
    const out = await run({ retries: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(false);
  });
});

describe('poolStrict : les échecs ne sont plus masqués', () => {
  it('compte les échecs et garde la première erreur', async () => {
    const r = await poolStrict([1, 2, 3, 4], 2, async (n) => {
      if (n % 2 === 0) throw new Error(`échec ${n}`);
      return n * 10;
    });
    expect(r.results).toEqual([10, null, 30, null]);
    expect(r.failed).toBe(2);
    expect((r.firstError as Error).message).toBe('échec 2');
  });
  it('liste vide : rien n’échoue', async () => {
    expect(await poolStrict([], 3, async () => 1)).toEqual({ results: [], failed: 0, firstError: null });
  });
});
