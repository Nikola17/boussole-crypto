import { describe, expect, it } from 'vitest';
import { claimNotification, weekKey } from './notified';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('alertes sans répétition', () => {
  const DAY = 86400_000;
  it('envoie une alerte une seule fois pendant sa durée de validité', () => {
    const s = memory();
    expect(claimNotification('exit:sui:2', 7 * DAY, 1_000, s)).toBe(true);
    expect(claimNotification('exit:sui:2', 7 * DAY, 1_000 + 3 * DAY, s)).toBe(false);
    expect(claimNotification('exit:sui:2', 7 * DAY, 1_000 + 8 * DAY, s)).toBe(true);
  });
  it('les alertes différentes sont indépendantes', () => {
    const s = memory();
    expect(claimNotification('a', DAY, 0, s)).toBe(true);
    expect(claimNotification('b', DAY, 0, s)).toBe(true);
    expect(claimNotification('a', DAY, 10, s)).toBe(false);
  });
  it('sans stockage, on prévient (jamais de silence)', () => {
    expect(claimNotification('x', DAY, 0, null)).toBe(true);
  });
  it('une mémoire corrompue ne bloque rien', () => {
    const s = memory();
    s.setItem('boussole-notified', '{pas du json');
    expect(claimNotification('x', DAY, 5, s)).toBe(true);
  });
  it('la clé de semaine est le lundi', () => {
    expect(weekKey(new Date(2026, 10, 8))).toBe('2026-11-02'); // dimanche 8 nov. 2026
    expect(weekKey(new Date(2026, 10, 9))).toBe('2026-11-09');
  });
});
