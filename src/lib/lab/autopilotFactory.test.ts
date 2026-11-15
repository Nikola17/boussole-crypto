import { describe, expect, it } from 'vitest';
import { newAutopilot, renewAutopilot } from './autopilotFactory';

const base = { strategyId: 'dca-btc', name: 'DCA Bitcoin', startingUsd: 0, params: { amountUsd: 25, daysOfWeek: [2, 5] }, costs: { preset: 'exchange' as const, feePct: 0.1, spreadPct: 0.05 } };

describe('création d’un autopilote', () => {
  it('démarre le lendemain, règles figées', () => {
    const p = newAutopilot(base, Date.parse('2026-11-17T21:30:00Z'));
    expect(p).toMatchObject({ kind: 'auto', strategyId: 'dca-btc', rules: 'dca-btc@1', executionHour: 8, timeZone: 'Europe/Paris', cursorDay: '2026-11-17', liveSince: '2026-11-18' });
    expect(newAutopilot(base, Date.parse('2026-11-17T23:30:00Z')).cursorDay).toBe('2026-11-18'); // minuit passé à Paris
    expect(() => newAutopilot({ ...base, strategyId: 'x' }, 0)).toThrow();
  });
  it('règles changées : archivé et recréé à l’identique', () => {
    const old = { ...newAutopilot(base, Date.parse('2026-11-01T10:00:00Z')), rules: 'dca-btc@0' };
    const r = renewAutopilot(old, Date.parse('2026-12-01T10:00:00Z'));
    expect(r.archived).toMatchObject({ id: old.id, archived: true, name: 'DCA Bitcoin (anciennes règles)' });
    expect(r.fresh).toMatchObject({ name: 'DCA Bitcoin', rules: 'dca-btc@1', params: old.params, liveSince: '2026-12-02' });
    expect(r.fresh!.id).not.toBe(old.id);
  });
});
