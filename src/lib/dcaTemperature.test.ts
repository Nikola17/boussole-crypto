import { describe, expect, it } from 'vitest';
import { TEMP_TABLES, temperatureMultiplier } from './dca';

describe('multiplicateurs de température', () => {
  it('table actuelle par défaut, mêmes seuils 20/40/60/80 pour les variantes', () => {
    expect([10, 30, 50, 70, 90].map((t) => temperatureMultiplier(t))).toEqual([2, 1.5, 1, 0.5, 0.25]);
    expect([10, 30, 50, 70, 90].map((t) => temperatureMultiplier(t, TEMP_TABLES.plate))).toEqual([1.5, 1.25, 1, 0.75, 0.5]);
    expect([10, 30, 50, 70, 90].map((t) => temperatureMultiplier(t, TEMP_TABLES.pentue))).toEqual([3, 2, 1, 0.33, 0]);
    expect(temperatureMultiplier(NaN, TEMP_TABLES.pentue)).toBe(1);
  });
});
