// Accès à Claude (API Anthropic) directement depuis l'appareil, avec la clé de l'utilisateur.
// Streaming, recherche web côté serveur, reprise des tours mis en pause, repli serveur en cas de refus.

import Anthropic from '@anthropic-ai/sdk';
import type { AiModel, AiSource, AiUsage } from '../types';

export const MODEL_INFO: Record<AiModel, { label: string; input: number; output: number; note: string }> = {
  'claude-opus-5-5': { label: 'Claude Opus 5.5', input: 4, output: 20, note: 'Le plus fiable pour tes décisions (par défaut)' },
  'claude-sonnet-5-5': { label: 'Claude Sonnet 5.5', input: 2, output: 10, note: 'Plus rapide, environ 2× moins cher' },
  'claude-haiku-5-5': { label: 'Claude Haiku 5.5', input: 0.1, output: 0.5, note: 'Très économique, analyses plus simples' },
};

/** Coût d'une recherche web (10 $ pour 1000 recherches). */
const SEARCH_COST_USD = 0.01;

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Un tour de conversation (commun à tous les fournisseurs d'IA). */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface RunOptions {
  apiKey: string;
  model: AiModel;
  system: string;
  prompt?: string;
  messages?: ChatTurn[];
  effort?: Effort;
  /** Nombre maximal de recherches web (0 ou absent = pas de recherche) */
  webSearch?: number;
  maxTokens?: number;
  onText?: (textSoFar: string) => void;
  signal?: AbortSignal;
}

export interface RunResult {
  text: string;
  usage: AiUsage;
  sources: AiSource[];
  model: string;
}

export class AiError extends Error {}

export function estimateCost(model: AiModel, inputTokens: number, outputTokens: number, searches = 0): number {
  const m = MODEL_INFO[model];
  return (inputTokens * m.input + outputTokens * m.output) / 1e6 + searches * SEARCH_COST_USD;
}

function friendlyError(e: unknown): Error {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AiError('Clé API Anthropic invalide. Vérifie-la dans Réglages.');
  if (e instanceof Anthropic.PermissionDeniedError) return new AiError('Cette clé API n’a pas accès à ce modèle ou à la recherche web.');
  if (e instanceof Anthropic.RateLimitError) return new AiError('Limite de requêtes Anthropic atteinte. Réessaie dans une minute.');
  if (e instanceof Anthropic.APIUserAbortError) return new AiError('Analyse annulée.');
  if (e instanceof Anthropic.APIConnectionError) return new AiError('Connexion à l’API Anthropic impossible. Vérifie ta connexion Internet.');
  if (e instanceof Anthropic.BadRequestError) {
    const msg = e.message || '';
    if (/credit balance/i.test(msg)) return new AiError('Crédit Anthropic insuffisant : recharge ton compte sur console.anthropic.com.');
    return new AiError(`Requête refusée par l’API : ${msg}`);
  }
  if (e instanceof Anthropic.APIError) return new AiError(`Erreur API Anthropic (${e.status ?? '?'}) : ${e.message}`);
  return e instanceof Error ? e : new Error(String(e));
}

interface MaybeWebResult {
  type?: string;
  url?: string;
  title?: string;
}

function collectSources(content: Anthropic.Beta.BetaContentBlock[], into: Map<string, AiSource>) {
  for (const block of content) {
    if (block.type === 'text' && Array.isArray(block.citations)) {
      for (const c of block.citations as unknown as MaybeWebResult[]) {
        if (c.url && !into.has(c.url)) into.set(c.url, { url: c.url, title: c.title || c.url });
      }
    }
  }
  // Si le modèle n'a rien cité explicitement, on garde les premiers résultats consultés.
  if (into.size === 0) {
    for (const block of content) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content as unknown as MaybeWebResult[]) {
          if (r.url && into.size < 10 && !into.has(r.url)) into.set(r.url, { url: r.url, title: r.title || r.url });
        }
      }
    }
  }
}

export async function runClaude(o: RunOptions): Promise<RunResult> {
  if (!o.apiKey) throw new AiError('Ajoute ta clé API Anthropic dans Réglages pour activer l’IA.');
  const client = new Anthropic({ apiKey: o.apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 2 });
  const isHaiku = o.model === 'claude-haiku-5-5';
  const tools: Anthropic.Beta.BetaToolUnion[] | undefined = o.webSearch
    ? [isHaiku
      ? { type: 'web_search_20250305', name: 'web_search', max_uses: o.webSearch }
      : { type: 'web_search_20260209', name: 'web_search', max_uses: o.webSearch }]
    : undefined;
  const messages: Anthropic.Beta.BetaMessageParam[] = o.messages
    ? o.messages.map((m) => ({ role: m.role, content: m.content }))
    : [{ role: 'user', content: o.prompt ?? '' }];

  let text = '';
  const usage: AiUsage = { inputTokens: 0, outputTokens: 0, searches: 0, costUsd: 0 };
  const sources = new Map<string, AiSource>();
  let modelUsed: string = o.model;

  try {
    for (let turn = 0; turn < 5; turn++) {
      const stream = client.beta.messages.stream(
        {
          model: o.model,
          max_tokens: o.maxTokens ?? 16000,
          system: o.system,
          messages,
          ...(tools ? { tools } : {}),
          thinking: { type: 'adaptive' },
          output_config: { effort: o.effort ?? 'medium' },
          // Repli automatique côté serveur si le modèle refuse une requête légitime (pas pour Haiku).
          ...(isHaiku ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
        },
        { signal: o.signal },
      );
      stream.on('text', (delta: string) => {
        text += delta;
        o.onText?.(text);
      });
      const msg = await stream.finalMessage();
      modelUsed = msg.model;
      const u = msg.usage;
      const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      usage.inputTokens += input;
      usage.outputTokens += u.output_tokens ?? 0;
      usage.searches += u.server_tool_use?.web_search_requests ?? 0;
      collectSources(msg.content, sources);

      if (msg.stop_reason === 'refusal') {
        throw new AiError('Le modèle a décliné cette demande. Reformule ta question ou essaie un autre modèle dans Réglages.');
      }
      if (msg.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: msg.content as unknown as Anthropic.Beta.BetaContentBlockParam[] });
        continue;
      }
      if (msg.stop_reason === 'max_tokens') text += '\n\n_(Réponse tronquée : limite de longueur atteinte.)_';
      break;
    }
  } catch (e) {
    throw friendlyError(e);
  }
  usage.costUsd = estimateCost(o.model, usage.inputTokens, usage.outputTokens, usage.searches);
  return { text: text.trim(), usage, sources: [...sources.values()], model: modelUsed };
}

/** Extrait le dernier bloc ```json ...``` d'une réponse et renvoie le texte sans ce bloc. */
export function extractJson<T = Record<string, unknown>>(text: string): { data: T | null; markdown: string } {
  const re = /```json\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  let lastMatch: RegExpExecArray | null = null;
  while ((m = re.exec(text))) lastMatch = m;
  if (!lastMatch) return { data: null, markdown: text };
  try {
    const data = JSON.parse(lastMatch[1].trim()) as T;
    const markdown = (text.slice(0, lastMatch.index) + text.slice(lastMatch.index + lastMatch[0].length)).trim();
    return { data, markdown };
  } catch {
    return { data: null, markdown: text };
  }
}
