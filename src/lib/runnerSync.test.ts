import { beforeEach, describe, expect, it, vi } from 'vitest';

const dispatch = vi.fn();
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/background-runner', () => ({ BackgroundRunner: { dispatchEvent: (...a: unknown[]) => dispatch(...a), requestPermissions: vi.fn() } }));

const state = (price: number) => ({ alerts: [{ id: 'a', coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', condition: 'above' as const, priceUsd: price }], exits: [] });

describe('envoi de l’état au script d’arrière-plan Android', () => {
  beforeEach(async () => {
    dispatch.mockReset();
    dispatch.mockResolvedValue({});
    (await import('./runnerSync')).resetRunnerSync();
  });

  it('un état identique n’est envoyé qu’une fois (l’écran se redessine, pas le script)', async () => {
    const { syncRunner } = await import('./runnerSync');
    await syncRunner(state(90000), () => undefined);
    await syncRunner(state(90000), () => undefined);
    await syncRunner(state(90000), () => undefined);
    expect(dispatch).toHaveBeenCalledTimes(2); // getFired + syncWatch, une seule fois
  });

  it('un état modifié est renvoyé', async () => {
    const { syncRunner } = await import('./runnerSync');
    await syncRunner(state(90000), () => undefined);
    await syncRunner(state(95000), () => undefined);
    expect(dispatch).toHaveBeenCalledTimes(4);
  });

  it('une erreur du plugin n’empêche pas de réessayer ensuite', async () => {
    const { syncRunner } = await import('./runnerSync');
    dispatch.mockRejectedValueOnce(new Error('indisponible'));
    await syncRunner(state(90000), () => undefined);
    await syncRunner(state(90000), () => undefined);
    expect(dispatch.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('les alertes déjà notifiées en arrière-plan sont remontées', async () => {
    const { syncRunner } = await import('./runnerSync');
    dispatch.mockResolvedValueOnce({ alerts: ['a'] });
    const fired = vi.fn();
    await syncRunner(state(90000), fired);
    expect(fired).toHaveBeenCalledWith(['a']);
  });
});

describe('phrase d’état de la surveillance', () => {
  it('dit si les contrôles tournent vraiment', async () => {
    const { describeRunnerStatus } = await import('./runnerSync');
    const NOW = 1_000_000_000_000;
    const st = (over: object) => ({ okAt: null, attemptAt: null, error: null, watching: 2, ...over });
    expect(describeRunnerStatus(null, NOW).ok).toBe(false);
    expect(describeRunnerStatus(st({ watching: 0 }), NOW)).toMatchObject({ ok: true });
    expect(describeRunnerStatus(st({}), NOW).text).toContain('Pas encore');
    expect(describeRunnerStatus(st({ attemptAt: NOW - 1000, error: 'limite atteinte' }), NOW)).toMatchObject({ ok: false });
    expect(describeRunnerStatus(st({ okAt: NOW - 12 * 60_000 }), NOW)).toEqual({ ok: true, text: 'Alertes surveillées en arrière-plan : dernier contrôle réussi il y a 12 min.' });
    const stale = describeRunnerStatus(st({ okAt: NOW - 5 * 3600_000, error: 'CoinGecko a répondu 429' }), NOW);
    expect(stale.ok).toBe(false);
    expect(stale.text).toContain('il y a 5 h');
    expect(stale.text).toContain('429');
  });
});

describe('échec au lancement : la surveillance n’est pas laissée vide', () => {
  it('réessaie avec un délai croissant jusqu’à ce que le script réponde', async () => {
    vi.useFakeTimers();
    try {
      const { syncRunner, resetRunnerSync } = await import('./runnerSync');
      resetRunnerSync();
      dispatch.mockReset();
      dispatch.mockRejectedValueOnce(new Error('runner is not started')).mockResolvedValue({});
      await syncRunner(state(90000), () => undefined);
      expect(dispatch).toHaveBeenCalledTimes(1); // l'envoi a échoué
      await vi.advanceTimersByTimeAsync(4100);
      expect(dispatch.mock.calls.length).toBeGreaterThanOrEqual(3); // nouvelle tentative : getFired + syncWatch
      const calls = dispatch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(200_000);
      expect(dispatch.mock.calls.length).toBe(calls); // réussi : plus de tentative
    } finally {
      vi.useRealTimers();
    }
  });

  it('un envoi plus récent remplace la tentative en attente', async () => {
    vi.useFakeTimers();
    try {
      const { syncRunner, resetRunnerSync } = await import('./runnerSync');
      resetRunnerSync();
      dispatch.mockReset();
      dispatch.mockRejectedValueOnce(new Error('runner is not started')).mockResolvedValue({});
      await syncRunner(state(90000), () => undefined);
      await syncRunner(state(95000), () => undefined); // l'état a changé avant la nouvelle tentative
      await vi.advanceTimersByTimeAsync(200_000);
      const synced = dispatch.mock.calls.filter((c) => (c[0] as { event: string }).event === 'syncWatch').map((c) => (c[0] as { details: { state: { alerts: { priceUsd: number }[] } } }).details.state.alerts[0].priceUsd);
      expect(synced).toEqual([95000]); // seul l'état le plus récent est envoyé
    } finally {
      vi.useRealTimers();
    }
  });

  it('abandonne après plusieurs essais au lieu de boucler indéfiniment', async () => {
    vi.useFakeTimers();
    try {
      const { syncRunner, resetRunnerSync } = await import('./runnerSync');
      resetRunnerSync();
      dispatch.mockReset();
      dispatch.mockRejectedValue(new Error('runner is not started'));
      await syncRunner(state(90000), () => undefined);
      await vi.advanceTimersByTimeAsync(1_000_000);
      expect(dispatch.mock.calls.length).toBeLessThanOrEqual(8); // 1 essai + 6 nouvelles tentatives
    } finally {
      vi.useRealTimers();
    }
  });
});
