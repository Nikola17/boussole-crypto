// extractJson : le dernier bloc ```json d'une réponse IA est extrait et retiré du texte affiché.
// Un JSON piégé ou tronqué ne doit jamais faire planter l'affichage : data reste null.

import { describe, expect, it } from 'vitest';
import { extractJson } from './claude';

describe('extractJson', () => {
  it('extrait le dernier bloc json et le retire du texte', () => {
    const out = extractJson('Voici mon analyse.\n```json\n{"ok": true}\n```\nConclusion.');
    expect(out.data).toEqual({ ok: true });
    // le retrait du bloc laisse la mise en page respirer : une ligne entre l'analyse et la conclusion
    expect(out.markdown).toBe('Voici mon analyse.\n\nConclusion.');
  });

  it('quand il y en a deux, seul le dernier est extrait (et retiré)', () => {
    const out = extractJson('```json\n{"n": 1}\n```\n texte\n```json\n{"n": 2}\n```');
    expect(out.data).toEqual({ n: 2 });
    expect(out.markdown).toContain('"n": 1');
    expect(out.markdown).not.toContain('"n": 2');
  });

  it('un JSON illisible ou tronqué laisse data à null sans toucher au texte', () => {
    const txt = 'Rapport tronqué.\n```json\n{"ok": tru';
    expect(extractJson(txt)).toEqual({ data: null, markdown: txt });
    const bad = '```json\n{pas du json}\n```';
    expect(extractJson(bad).data).toBeNull();
  });

  it('aucun bloc json : texte intact', () => {
    const txt = 'Une réponse purement en Markdown, sans code.';
    expect(extractJson(txt)).toEqual({ data: null, markdown: txt });
  });
});
