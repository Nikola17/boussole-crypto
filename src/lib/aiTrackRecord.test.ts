import { describe, expect, it } from 'vitest';
import { evaluateAiTrackRecord } from './aiTrackRecord';
import type { AiReport } from '../types';

const rep = (id: string, coinId: string, model: string, verdict: string, entry: number): AiReport => ({
  id, kind: 'quick', coinId, title: coinId, day: '2026-10-01', createdAt: '2026-10-01T10:00:00Z',
  markdown: '', model, data: { verdict, entry },
});

describe('AI Track Record', () => {
  it('note les verdicts haussiers et baissiers par modèle', () => {
    const reports = [
      rep('1', 'solana', 'mistral-large', 'ACCUMULER', 100), // gagné (+20 %)
      rep('2', 'ethereum', 'mistral-large', 'ÉVITER', 3000), // gagné (−10 %)
      rep('3', 'bitcoin', 'claude-sonnet', 'ACHETER PROGRESSIVEMENT', 90000), // perdu (−5 %)
      rep('4', 'cardano', 'claude-sonnet', 'ATTENDRE', 0.5), // neutre ignoré
    ];
    const prices: Record<string, number> = { solana: 120, ethereum: 2700, bitcoin: 85500, cardano: 0.6 };
    const r = evaluateAiTrackRecord(reports, (id) => prices[id] ?? null);
    expect(r.total).toBe(3);
    expect(r.wins).toBe(2);
    expect(r.byModel[0]).toMatchObject({ model: 'mistral-large', total: 2, wins: 2, winRatePct: 100 });
    expect(r.byModel[1]).toMatchObject({ model: 'claude-sonnet', total: 1, wins: 0, winRatePct: 0 });
  });
});
