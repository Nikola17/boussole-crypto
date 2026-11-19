import { describe, expect, it } from 'vitest';
import { upcomingUnlocks, unlockBadge } from './unlocks';
import type { TokenUnlock } from '../types';

const u = (id: string, date: string): TokenUnlock => ({ id, symbol: 'XYZ', date });

describe('upcomingUnlocks', () => {
  const list = [u('a', '2026-11-19'), u('b', '2026-11-25'), u('c', '2026-12-20'), u('d', '2026-11-10'), u('e', 'bad')];
  it('garde 0..30 jours, triés, ignore les passés et les dates illisibles', () => {
    const out = upcomingUnlocks(list, '2026-11-18');
    expect(out.map((x) => x.id)).toEqual(['a', 'b']); // c = 32 j > 30, d = passé, e = illisible
    expect(out[0].daysUntil).toBe(1);
    expect(out[1].daysUntil).toBe(7);
  });
  it('respecte l’horizon', () => {
    expect(upcomingUnlocks(list, '2026-11-18', 7).map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('badge J-1 puis J-7', () => {
    expect(unlockBadge(0)).toBe('J-1');
    expect(unlockBadge(1)).toBe('J-1');
    expect(unlockBadge(5)).toBe('J-7');
    expect(unlockBadge(20)).toBeNull();
  });
});
