// Calendrier macro/crypto : dates tenues à jour, échéances déduites, conduite à tenir.

import { describe, expect, it } from 'vitest';
import { daysToIso, lastFridayOf, macroEvents, macroWhen, nextMacroEvents } from './macro';

const NOW = new Date(2026, 10, 13); // vendredi 13 novembre 2026

describe('calendrier macro/crypto', () => {
  it('les échéances trimestrielles tombent le dernier vendredi de mars, juin, septembre, décembre', () => {
    // décembre 2026 : le 31 est un jeudi → dernier vendredi = 25.
    expect(lastFridayOf(2026, 11)).toBe('2026-12-25');
    // mars 2026 : le 31 est un mardi → dernier vendredi = 27.
    expect(lastFridayOf(2026, 2)).toBe('2026-03-27');
  });

  it('les événements connus apparaissent, du plus proche au plus lointain', () => {
    const evs = macroEvents(NOW).filter((e) => e.daysTo >= 0);
    expect(evs.map((e) => e.id)).toContain('cpi:2026-12-15'); // le prochain CPI du calendrier
    expect(evs.map((e) => e.id)).toContain('fomc:2026-12-09');
    expect(evs.map((e) => e.id)).toContain('expiry:2026-12-25');
    for (let i = 1; i < evs.length; i++) expect(evs[i].daysTo).toBeGreaterThanOrEqual(evs[i - 1].daysTo);
  });

  it('la petite phrase du compte à rebours', () => {
    expect(macroWhen({ id: 'x', date: '', kind: 'fomc', label: 'x', daysTo: 0, advice: '' })).toBe("aujourd'hui");
    expect(macroWhen({ id: 'x', date: '', kind: 'fomc', label: 'x', daysTo: 1, advice: '' })).toBe('demain');
    expect(macroWhen({ id: 'x', date: '', kind: 'fomc', label: 'x', daysTo: 5, advice: '' })).toBe('dans 5 jours');
  });

  it('nextMacroEvents borne le nombre et l’horizon', () => {
    const next = nextMacroEvents(NOW, 3, 45);
    expect(next.length).toBeLessThanOrEqual(3);
    for (const e of next) expect(e.daysTo).toBeGreaterThanOrEqual(0);
    expect(next[0].daysTo).toBeLessThanOrEqual(next[next.length - 1].daysTo);
  });

  it('chaque événement porte sa conduite à tenir et son compte à rebours exact', () => {
    for (const e of macroEvents(NOW)) {
      expect(e.advice.length).toBeGreaterThan(20);
      expect(e.daysTo).toBe(daysToIso(e.date, NOW));
    }
  });
});
