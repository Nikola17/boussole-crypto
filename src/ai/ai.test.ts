import { describe, expect, it } from 'vitest';
import { createSseParser, parseSseLine, reasoningEffort, stripThink, type StreamEvent } from './openai';
import { buildAiConfig, prettyModel } from './run';
import { parseRss, pickNews, type NewsItem } from '../api/news';
import { defaultSettings } from '../store/useStore';

function collect(chunks: string[]): StreamEvent[] {
  const events: StreamEvent[] = [];
  const p = createSseParser((e) => events.push(e));
  chunks.forEach((c) => p.push(c));
  p.flush();
  return events;
}

describe('flux SSE compatible OpenAI', () => {
  it('lit le contenu, la fin et l’usage avec le coût', () => {
    const ev = collect([
      'data: {"choices":[{"delta":{"content":"Bon"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"jour"},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":22,"completion_tokens":4,"cost":0.000004}}\n\n',
      'data: [DONE]\n\n',
    ]);
    expect(ev.filter((e) => e.content).map((e) => e.content).join('')).toBe('Bonjour');
    expect(ev.find((e) => e.finish)?.finish).toBe('stop');
    expect(ev.find((e) => e.usage)?.usage).toEqual({ prompt_tokens: 22, completion_tokens: 4, cost: 0.000004 });
    expect(ev[ev.length - 1].done).toBe(true);
  });

  it('recolle une ligne coupée en deux morceaux réseau', () => {
    const line = 'data: {"choices":[{"delta":{"content":"é à ü"}}]}\n';
    const ev = collect([line.slice(0, 20), line.slice(20)]);
    expect(ev).toHaveLength(1);
    expect(ev[0].content).toBe('é à ü');
  });

  it('ignore les commentaires de maintien de connexion et le JSON invalide', () => {
    expect(parseSseLine(': OPENROUTER PROCESSING')).toBeNull();
    expect(parseSseLine('')).toBeNull();
    expect(parseSseLine('data: {pas du json')).toBeNull();
    expect(parseSseLine('event: message')).toBeNull();
  });

  it('remonte une erreur envoyée dans le flux', () => {
    expect(parseSseLine('data: {"error":{"message":"quota dépassé"}}')?.error).toBe('quota dépassé');
  });

  it('accepte un contenu sous forme de liste de parties', () => {
    const e = parseSseLine('data: {"choices":[{"delta":{"content":[{"type":"text","text":"A"},{"type":"text","text":"B"}]}}]}');
    expect(e?.content).toBe('AB');
  });

  it('ne traite pas la réflexion (reasoning_content) comme du texte de réponse', () => {
    const e = parseSseLine('data: {"choices":[{"delta":{"reasoning_content":"je réfléchis"}}]}');
    expect(e?.content).toBeUndefined();
  });
});

describe('réflexion et effort', () => {
  it('retire les blocs <think> complets', () => {
    expect(stripThink('<think>plan secret</think>\n\nRéponse finale')).toBe('Réponse finale');
    expect(stripThink('A <thinking>x</thinking>B')).toBe('A B');
  });

  it('masque un bloc encore ouvert pendant le streaming', () => {
    expect(stripThink('<think>je réfl')).toBe('');
    expect(stripThink('Début <think>suite')).toBe('Début ');
  });

  it('ne touche pas au texte normal', () => {
    expect(stripThink('Le multiple de Mayer est 1,04.')).toBe('Le multiple de Mayer est 1,04.');
  });

  it('ramène l’effort à deux niveaux', () => {
    expect(reasoningEffort('low')).toBe('low');
    expect(reasoningEffort('medium')).toBe('low');
    expect(reasoningEffort('high')).toBe('high');
    expect(reasoningEffort('max')).toBe('high');
    expect(reasoningEffort(undefined)).toBe('low');
  });
});

describe('configuration du fournisseur', () => {
  it('compat : exige une clé, pas de recherche web, adresse Nous par défaut', () => {
    expect(buildAiConfig({ ...defaultSettings, aiProvider: 'compat', compatKey: '' }, 'Nico')).toBeNull();
    const cfg = buildAiConfig({ ...defaultSettings, aiProvider: 'compat', compatKey: 'sk-test' }, 'Nico')!;
    expect(cfg.provider).toBe('compat');
    expect(cfg.webSearch).toBe(false);
    expect(cfg.baseUrl).toBe('https://inference-api.nousresearch.com/v1');
  });

  it('anthropic : la recherche web suit le réglage', () => {
    const cfg = buildAiConfig({ ...defaultSettings, aiProvider: 'anthropic', anthropicKey: 'sk-ant', aiWebSearch: true }, '')!;
    expect(cfg.webSearch).toBe(true);
    expect(buildAiConfig({ ...defaultSettings, aiProvider: 'anthropic', anthropicKey: 'sk-ant', aiWebSearch: false }, '')!.webSearch).toBe(false);
  });

  it('ne place aucune clé dans les réglages par défaut', () => {
    expect(defaultSettings.compatKey).toBe('');
    expect(defaultSettings.anthropicKey).toBe('');
  });

  it('affiche un nom de modèle lisible', () => {
    expect(prettyModel('deepseek/deepseek-v4.1-flash')).toBe('deepseek-v4.1-flash');
    expect(prettyModel('claude-opus-5-5')).toBe('Claude Opus 5.5');
  });
});

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Bitcoin &amp; Ether : rebond après le krach]]></title><link>https://exemple.test/a</link>
<pubDate>Sat, 07 Nov 2026 08:00:00 +0000</pubDate><description><![CDATA[<p>Le <b>BTC</b> repasse &quot;76 000&quot; $.</p>]]></description></item>
<item><title>Sans date valide</title><link>https://exemple.test/b</link><pubDate>n'importe quoi</pubDate></item>
<item><title>Solana lance une mise à jour</title><link>https://exemple.test/c</link><pubDate>Fri, 06 Nov 2026 20:00:00 GMT</pubDate><description>SOL gagne du terrain</description></item>
</channel></rss>`;

describe('actualités RSS', () => {
  it('lit les articles, décode les entités et retire le HTML', () => {
    const items = parseRss(RSS, 'Test');
    expect(items).toHaveLength(2); // l'article sans date valide est ignoré
    expect(items[0].title).toBe('Bitcoin & Ether : rebond après le krach');
    expect(items[0].summary).toBe('Le BTC repasse "76 000" $.');
    expect(items[0].source).toBe('Test');
    expect(items[0].url).toBe('https://exemple.test/a');
  });

  const mk = (title: string, hoursAgo: number): NewsItem => ({ title, source: 'S', url: `https://x.test/${title}`, publishedAt: Date.now() - hoursAgo * 3600_000, summary: '' });

  it('met en avant les articles qui parlent du sujet demandé, puis complète avec les plus récents', () => {
    const items = [mk('Macro : la Fed hésite', 1), mk('Solana (SOL) bat un record', 5), mk('Ethereum en hausse', 2), mk('Regulation en Europe', 3)];
    const picked = pickNews(items, ['Solana', 'SOL'], 3);
    expect(picked).toHaveLength(3);
    expect(picked.map((i) => i.title)).toContain('Solana (SOL) bat un record');
    expect(picked[0].publishedAt).toBeGreaterThanOrEqual(picked[2].publishedAt); // du plus récent au plus ancien
  });

  it('ne confond pas un symbole court avec un mot plus long', () => {
    const items = [mk('The Solution arrives', 1), mk('SOL hits $100', 2)];
    expect(pickNews(items, ['SOL'], 1).map((i) => i.title)).toEqual(['SOL hits $100']);
  });
});
