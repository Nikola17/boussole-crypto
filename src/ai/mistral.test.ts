// Catalogue Mistral : seuls les modèles de conversation, alias regroupés, modèles retirés à la fin.
import { describe, expect, it } from 'vitest';
import { parseMistralModels } from './mistral';

describe('parseMistralModels', () => {
  it('garde les modèles de conversation, regroupe les alias, met les modèles retirés à la fin', () => {
    const out = parseMistralModels({
      data: [
        { id: 'mistral-large-2511', aliases: ['mistral-large-latest'], capabilities: { completion_chat: true }, max_context_length: 128000 },
        { id: 'mistral-large-latest', aliases: ['mistral-large-2511'], capabilities: { completion_chat: true } },
        { id: 'mistral-embed', capabilities: { completion_chat: false } },
        { id: 'old-model', capabilities: { completion_chat: true }, deprecation: '2026-01-01T00:00:00Z' },
        { id: 'deepseek-v4', name: 'DeepSeek V4', capabilities: { completion_chat: true } },
      ],
    });
    expect(out.map((m) => m.id)).toEqual(['deepseek-v4', 'mistral-large-2511', 'old-model']);
    expect(out.find((m) => m.id === 'mistral-large-2511')?.aliases).toEqual(['mistral-large-latest']);
    expect(out.find((m) => m.id === 'deepseek-v4')?.name).toBe('DeepSeek V4');
  });
  it('réponse inattendue : liste vide', () => {
    expect(parseMistralModels(null)).toEqual([]);
    expect(parseMistralModels({ detail: 'Invalid API Key' })).toEqual([]);
  });
});
