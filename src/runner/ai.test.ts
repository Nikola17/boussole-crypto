// Notes d'importance et résumés de la veille presse par l'IA : consigne et lecture de la réponse.

import { describe, expect, it } from 'vitest';
import { newsPrompt, parseNewsRatings } from './ai';
import type { NewsItem } from './news';

const item = (n: number, title: string): NewsItem => ({
  coinId: 'solana', coinName: 'Solana', title, url: `https://news.google.com/r/${n}`,
  source: 'Journal Crypto', publishedAt: 0, summaryText: 'Un pont a été exploité…',
});

describe('notes et résumés IA de la veille presse', () => {
  it('la consigne cite chaque actu, explique l’échelle et exige un tableau JSON', () => {
    const p = newsPrompt([item(1, 'Hack')]);
    expect(p).toContain('[Solana] Hack (Journal Crypto)');
    expect(p).toContain('8-10');
    expect(p).toContain('```json');
  });

  it('la réponse est lue dans un bloc JSON comme en JSON brut, dans l’ordre des entrées', () => {
    const raw = '```json\n[{"n":1,"importance":7,"resume":"Un hack."},{"n":2,"importance":2,"resume":"Peu utile."}]\n```';
    const r = parseNewsRatings(raw, 2);
    expect(r).toEqual([{ importance: 7, resume: 'Un hack.' }, { importance: 2, resume: 'Peu utile.' }]);
    const r2 = parseNewsRatings('[{"n":1,"importance":6,"resume":"ETF approuvé."}]', 1);
    expect(r2).toEqual([{ importance: 6, resume: 'ETF approuvé.' }]);
  });

  it('importance bornée à 1-10, entrée manquante = 0, réponse illisible = tout à zéro (l’heuristique reprend)', () => {
    const r = parseNewsRatings('[{"n":1,"importance":99,"resume":"a"},{"n":2,"importance":-5,"resume":"b"}]', 2);
    expect(r[0].importance).toBe(10);
    expect(r[1].importance).toBe(0);
    const bad = parseNewsRatings('L’IA a décidé de bavarder.', 2);
    expect(bad).toEqual([{ importance: 0, resume: '' }, { importance: 0, resume: '' }]);
  });
});
