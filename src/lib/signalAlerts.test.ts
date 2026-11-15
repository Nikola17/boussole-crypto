import { describe, expect, it } from 'vitest';
import { localSignalStep, runnerSilent } from './signalAlerts';

const NOW = Date.UTC(2026, 10, 20, 9, 0);
const sol = (keys: string[]) => ({ solana: { symbol: 'sol', keys } });

describe('alertes de signal dans l’application', () => {
  it('le serveur est muet sans pointage depuis 45 minutes (ou sans pointage lisible)', () => {
    expect(runnerSilent(JSON.stringify({ at: new Date(NOW - 10 * 60_000).toISOString() }), NOW)).toBe(false);
    expect(runnerSilent(JSON.stringify({ at: new Date(NOW - 50 * 60_000).toISOString() }), NOW)).toBe(true);
    expect(runnerSilent(null, NOW)).toBe(true);
    expect(runnerSilent('pas du json', NOW)).toBe(true);
  });
  it('premier calcul mémorisé, puis une alerte par épisode, seulement si le serveur est muet, une fois par jour', () => {
    const s1 = localSignalStep(null, sol([]), '2026-11-19', true);
    expect(s1.events).toEqual([]);
    const s2 = localSignalStep(s1.next, sol(['inv:Alléger']), '2026-11-20', true);
    expect(s2.events.map((e) => e.signal)).toEqual(['inv:Alléger']);
    expect(localSignalStep(s2.next, sol([]), '2026-11-20', true).events).toEqual([]); // même jour : rien de recalculé
    const quiet = localSignalStep(s1.next, sol(['inv:Alléger']), '2026-11-20', false);
    expect(quiet.events).toEqual([]); // le serveur s'en charge
    expect(quiet.next.active.solana).toEqual(['inv:Alléger']); // mais l'état avance
  });
  it('trois alertes au plus', () => {
    const base = localSignalStep(null, {}, '2026-11-19', true).next;
    const many = Object.fromEntries(['a', 'b', 'c', 'd'].map((id) => [id, { symbol: id, keys: ['inv:Alléger'] }]));
    expect(localSignalStep(base, many, '2026-11-20', true).events).toHaveLength(3);
  });
});
