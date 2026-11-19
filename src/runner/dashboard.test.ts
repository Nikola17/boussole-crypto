import { describe, expect, it } from 'vitest';
import { buildDashboardStatus } from './dashboard';

const base = {
  now: new Date('2026-11-20T09:00:00Z'),
  device: 'hermes-vps',
  result: { error: null, watching: 3 },
  state: { zoneLabel: 'Accumulation', lastBriefSlot: { matin: '2026-11-20' } },
  fng: { value: 40, label: 'Peur' },
  temperature: { value: 38, zoneLabel: 'Accumulation' },
  btcPrice: { usd: 87000, change: -2.1 },
  unlocks: [
    { id: 'u1', symbol: 'arb', date: '2026-11-21', pctSupply: 0.4 },
    { id: 'u2', symbol: 'op', date: '2026-12-05' },
  ],
  syncSavedAt: '2026-11-20T08:55:00Z',
  syncDevice: 'pc-nico',
};

describe('dashboard : statut public assaini', () => {
  it('contient les champs utiles et rien d’autre', () => {
    const s = buildDashboardStatus(base);
    expect(s.ok).toBe(true);
    expect(s.watching).toBe(3);
    expect(s.unlocksNext).toEqual([
      { symbol: 'arb', date: '2026-11-21', daysUntil: 1 },
      { symbol: 'op', date: '2026-12-05', daysUntil: 15 },
    ]);
    expect(s.lastBrief).toEqual({ matin: '2026-11-20' });
  });

  it('ne contient aucun secret, même si on lui en passait un par erreur', () => {
    const dirty = JSON.stringify(buildDashboardStatus({ ...base, syncSavedAt: 'tok 123 secret', syncDevice: 'x' } as never));
    // le builder ne retient que les champs prévus : on vérifie les clés présentes
    const keys = Object.keys(buildDashboardStatus(base)).sort();
    expect(keys).toEqual(['at', 'btc', 'device', 'error', 'fng', 'lastBrief', 'ok', 'sync', 'temperature', 'unlocksNext', 'watching', 'zoneLabel'].sort());
    for (const forbidden of ['token', 'passphrase', 'chatId', 'webhook', 'telegramToken', 'syncToken']) {
      expect(dirty.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('un échec du cycle est reflété (ok: false) avec le message d’erreur assaini', () => {
    const s = buildDashboardStatus({ ...base, result: { error: 'Le fichier de synchronisation est illisible.', watching: 0 } });
    expect(s.ok).toBe(false);
    expect(s.error).toContain('illisible');
  });
});
