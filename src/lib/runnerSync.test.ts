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
