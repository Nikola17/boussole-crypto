import { describe, expect, it } from 'vitest';
import { addDays, decisionDay, execInstant, isoWeek, localDay } from './clock';

const iso = (ms: number) => new Date(ms).toISOString();

describe('horloge d’exécution', () => {
  it('8 h à Paris, été comme hiver', () => {
    expect(iso(execInstant('2026-03-28', 8, 'Europe/Paris'))).toBe('2026-03-28T07:00:00.000Z');
    expect(iso(execInstant('2026-03-29', 8, 'Europe/Paris'))).toBe('2026-03-29T06:00:00.000Z');
    expect(iso(execInstant('2026-10-25', 8, 'Europe/Paris'))).toBe('2026-10-25T07:00:00.000Z');
    expect(iso(execInstant('2026-07-01', 8, 'Europe/Paris'))).toBe('2026-07-01T06:00:00.000Z');
  });
  it('fuseau à l’est : l’instant tombe la veille en UTC', () => {
    expect(iso(execInstant('2026-11-17', 8, 'Pacific/Auckland'))).toBe('2026-11-16T19:00:00.000Z');
    expect(decisionDay(execInstant('2026-11-17', 8, 'Pacific/Auckland'))).toBe('2026-11-15');
    expect(decisionDay(execInstant('2026-11-17', 8, 'Europe/Paris'))).toBe('2026-11-16');
  });
  it('jour local, ajout de jours, semaine ISO', () => {
    expect(localDay(Date.parse('2026-11-16T23:30:00Z'), 'Europe/Paris')).toBe('2026-11-17');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(isoWeek('2026-11-16')).toBe('2026-W47');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
  });
});
