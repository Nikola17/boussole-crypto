import { describe, expect, it } from 'vitest';
import { appendJournal, consistencyPct, trialsPerCandidate, JOURNAL_HEADER } from './journal';

describe('protocole du lot 3', () => {
  it('cohérence entre cryptos : seules celles qui ont au moins 5 épisodes comptent', () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => ({ asset: `a${i}`, episodes: 6, medianPct: 2, baselineMedianPct: 0 })),
      { asset: 'b', episodes: 9, medianPct: -1, baselineMedianPct: 0 },
      { asset: 'c', episodes: 3, medianPct: -5, baselineMedianPct: 0 },
      { asset: 'd', episodes: 4, medianPct: -5, baselineMedianPct: 0 },
    ];
    expect(consistencyPct(rows, 'bull')).toBeCloseTo((7 / 8) * 100, 9);
    expect(consistencyPct(rows, 'bear')).toBeCloseTo((1 / 8) * 100, 9);
    expect(consistencyPct([], 'bull')).toBeNull();
  });
  it('un regard sur le contrôle = une ligne au journal', () => {
    const one = appendJournal(JOURNAL_HEADER, [{ day: '2026-11-15', key: 'cand:F3:h20v15', period: 'contrôle', result: 'validé (contrôle 54 % / 43 %)' }]);
    expect(one.trim().split('\n').length).toBe(JOURNAL_HEADER.trim().split('\n').length + 1);
    const two = appendJournal(one, [{ day: '2026-11-16', key: 'cand:F3:h55v15', period: 'contrôle', result: 'sans effet' }]);
    expect(trialsPerCandidate(two)).toEqual({ F3: 2 });
    // Même jeu de paramètres regardé une seconde fois (méthode corrigée) : ce n'est pas un nouvel essai.
    const again = appendJournal(two, [{ day: '2026-11-17', key: 'cand:F3:h20v15', period: 'contrôle (méthode corrigée)', result: 'validé' }]);
    expect(trialsPerCandidate(again)).toEqual({ F3: 2 });
  });
});
