// Résumé et tri des actus par l'IA (Mistral, clé facultative). Appel nu à l'API : aucune dépendance,
// aucun SDK — comme les autres requêtes du runner. Sans clé, la veille marche quand même (heuristique,
// sans résumé) : la clé améliore, elle ne conditionne pas.

import type { NewsItem } from './news';

const TIMEOUT_MS = 25_000;

/** Consigne de tri et de résumé ; pure, testée. */
export function newsPrompt(items: NewsItem[]): string {
  const lines = items.map((i, n) => `${n + 1}. [${i.coinName}] ${i.title} (${i.source}) — ${i.summaryText}`).join('\n');
  return [
    'Tu es analyste crypto pour un investisseur particulier français. Chaque entrée ci-dessous est une actualité réelle.',
    'Pour CHAQUE entrée, note son importance pour un détenteur de cette crypto :',
    '- 1-3 : bruit, promo, opinion sans conséquence ;',
    '- 4-5 : information utile mais sans effets directs attendus ;',
    '- 6-7 : à connaître (partenariat, Graham réglementaire, produit, adoption) ;',
    '- 8-10 : peut bouger le prix ou la sécurité (hack, procès, interdiction, listing majeur, ETF…).',
    'Réponds UNIQUEMENT un tableau JSON (bloc ```json), une entrée par actu dans l’ordre :',
    '[{"n": 1, "importance": 6, "resume": "Résumé en 3 phrases courtes en français : ce qui s’est passé, pourquoi c’est important, ce que le détenteur peut faire."}]',
    '',
    lines,
  ].join('\n');
}

/** Extrait le tableau JSON de la réponse de l’IA (bloc ```json ou JSON brut). */
export function parseNewsRatings(text: string, n: number): { importance: number; resume: string }[] {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/i) ?? [null, text];
  const candidate = block[1] ?? '';
  const arr = candidate.slice(candidate.indexOf('['), candidate.lastIndexOf(']') + 1);
  try {
    const raw = JSON.parse(arr) as { n?: unknown; importance?: unknown; resume?: unknown }[];
    const out: { importance: number; resume: string }[] = [];
    for (let i = 0; i < n; i++) {
      const r = raw.find((x) => Number(x.n) === i + 1) ?? raw[i];
      const importance = Number(r?.importance);
      out.push({ importance: Number.isFinite(importance) ? Math.max(0, Math.min(10, importance)) : 0, resume: typeof r?.resume === 'string' ? r.resume.trim() : '' });
    }
    return out;
  } catch {
    return Array.from({ length: n }, () => ({ importance: 0, resume: '' })); // IA illisible : l'heuristique prend le relais
  }
}

/**
 * Note et résume `items` (8 max). Échec → ratings 0 pour tout : le cycle appliquera l'heuristique.
 */
export async function rateNews(apiKey: string, model: string, items: NewsItem[]): Promise<{ importance: number; resume: string }[]> {
  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: newsPrompt(items.slice(0, 8)) }], temperature: 0.2 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return Array.from({ length: items.length }, () => ({ importance: 0, resume: '' }));
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content ?? '';
    return parseNewsRatings(text, items.length);
  } catch {
    return Array.from({ length: items.length }, () => ({ importance: 0, resume: '' }));
  }
}
