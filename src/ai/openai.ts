// Client pour les API « compatibles OpenAI » (Nous Portal par défaut, mais aussi OpenRouter, DeepSeek, etc.).
// Streaming SSE, nouvelles tentatives sur 429/5xx, coût renvoyé par la passerelle, catalogue des modèles.

import type { AiUsage } from '../types';
import type { ChatTurn, Effort, RunResult } from './claude';

export const NOUS_BASE_URL = 'https://inference-api.nousresearch.com/v1';
/** Modèle proposé par défaut sur Nous Portal (à confirmer par le test comparatif). */
export const DEFAULT_COMPAT_MODEL = 'deepseek/deepseek-v4.1-flash';

export class CompatError extends Error {}

// ------------------------------------------------------------------ Texte

/**
 * Retire les blocs de réflexion `<think>…</think>` que certains modèles à raisonnement écrivent dans le texte.
 * Un bloc encore ouvert (réponse en cours de streaming) est masqué jusqu'à sa fermeture.
 */
export function stripThink(text: string): string {
  let out = text.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '');
  const open = out.search(/<(think|thinking)>/i);
  if (open !== -1) out = out.slice(0, open);
  return out.replace(/^\s+/, '');
}

// ------------------------------------------------------------------ Flux SSE

export interface CompatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
}

export interface StreamEvent {
  content?: string;
  finish?: string | null;
  usage?: CompatUsage;
  error?: string;
  done?: boolean;
}

function contentOf(delta: unknown): string {
  const c = (delta as { content?: unknown } | undefined)?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p === 'string' ? p : (p as { text?: string })?.text ?? '')).join('');
  return '';
}

/** Interprète une ligne `data: …` d'un flux Server-Sent Events de type OpenAI. */
export function parseSseLine(line: string): StreamEvent | null {
  const l = line.trim();
  if (!l.startsWith('data:')) return null; // commentaires (« : keep-alive »), lignes vides, `event:`…
  const payload = l.slice(5).trim();
  if (payload === '[DONE]') return { done: true };
  let j: {
    choices?: { delta?: unknown; message?: unknown; finish_reason?: string | null }[];
    usage?: CompatUsage;
    error?: { message?: string } | string;
  };
  try {
    j = JSON.parse(payload);
  } catch {
    return null;
  }
  if (j.error) return { error: typeof j.error === 'string' ? j.error : j.error.message ?? 'Erreur du fournisseur' };
  const ch = j.choices?.[0];
  const ev: StreamEvent = {};
  const text = contentOf(ch?.delta ?? ch?.message);
  if (text) ev.content = text;
  if (ch?.finish_reason) ev.finish = ch.finish_reason;
  if (j.usage) ev.usage = j.usage;
  return ev;
}

/** Découpe un flux en lignes complètes (un morceau réseau peut couper une ligne en deux). */
export function createSseParser(onEvent: (e: StreamEvent) => void) {
  let buffer = '';
  const feed = (line: string) => {
    const e = parseSseLine(line);
    if (e) onEvent(e);
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      lines.forEach(feed);
    },
    flush() {
      if (buffer) feed(buffer);
      buffer = '';
    },
  };
}

// ------------------------------------------------------------------ Requête

export interface CompatOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  prompt?: string;
  messages?: ChatTurn[];
  effort?: Effort;
  maxTokens?: number;
  onText?: (textSoFar: string) => void;
  signal?: AbortSignal;
}

/** Ramène l'effort demandé aux deux niveaux acceptés par la plupart des modèles à raisonnement. */
export function reasoningEffort(e: Effort | undefined): 'low' | 'high' {
  return e === 'high' || e === 'xhigh' || e === 'max' ? 'high' : 'low';
}

async function httpError(res: Response): Promise<CompatError & { status: number; retryAfter?: number }> {
  let msg = '';
  try {
    const raw = await res.text();
    try {
      const j = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
      msg = typeof j.error === 'string' ? j.error : j.error?.message ?? j.message ?? raw;
    } catch {
      msg = raw;
    }
  } catch {
    /* corps illisible */
  }
  msg = msg.replace(/\s+/g, ' ').slice(0, 240);
  let text: string;
  if (res.status === 401 || res.status === 403) text = 'Clé API refusée par le fournisseur. Vérifie-la dans Réglages.';
  else if (res.status === 402) text = 'Crédit insuffisant chez le fournisseur : recharge ton compte (Nous Portal ou autre).';
  else if (res.status === 404) text = `Modèle ou adresse introuvable (${msg || '404'}). Vérifie le nom du modèle dans Réglages.`;
  else if (res.status === 429) text = 'Limite de requêtes atteinte chez le fournisseur. Réessaie dans une minute.';
  else if (res.status >= 500) text = `Le fournisseur d’IA est momentanément indisponible (${res.status}).`;
  else text = `Requête refusée (${res.status}) : ${msg}`;
  const err = new CompatError(text) as CompatError & { status: number; retryAfter?: number };
  err.status = res.status;
  const ra = Number(res.headers.get('retry-after'));
  if (Number.isFinite(ra) && ra > 0) err.retryAfter = ra;
  return err;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runCompat(o: CompatOptions): Promise<RunResult> {
  if (!o.apiKey) throw new CompatError('Ajoute ta clé API dans Réglages pour activer l’IA.');
  if (!/^https?:\/\//i.test(o.baseUrl)) throw new CompatError('L’adresse de l’API est invalide (elle doit commencer par https://).');
  const url = `${o.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const turns: ChatTurn[] = o.messages ?? [{ role: 'user', content: o.prompt ?? '' }];
  const messages = [{ role: 'system', content: o.system }, ...turns];

  let withExtras = true; // paramètres facultatifs (raisonnement, usage en flux) : retirés si le fournisseur les refuse
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    if (o.signal?.aborted) throw new CompatError('Analyse annulée.');
    // État du flux (objet : TypeScript ne « voit » pas les modifications faites dans les fonctions de rappel)
    const st = { raw: '', usage: undefined as CompatUsage | undefined, finish: null as string | null, streamError: null as string | null };
    try {
      const body: Record<string, unknown> = { model: o.model, messages, stream: true, max_tokens: o.maxTokens ?? 16000 };
      if (withExtras) {
        body.stream_options = { include_usage: true };
        body.reasoning = { effort: reasoningEffort(o.effort) };
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${o.apiKey.trim()}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: o.signal,
      });
      if (!res.ok) throw await httpError(res);

      const ctype = res.headers.get('content-type') ?? '';
      if (!res.body || ctype.includes('application/json')) {
        // Le fournisseur a ignoré `stream` : réponse complète en JSON
        const j = (await res.json()) as { choices?: { message?: { content?: unknown }; finish_reason?: string }[]; usage?: CompatUsage };
        st.raw = contentOf(j.choices?.[0]?.message);
        st.usage = j.usage;
        st.finish = j.choices?.[0]?.finish_reason ?? null;
        o.onText?.(stripThink(st.raw));
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = createSseParser((e) => {
          if (e.error) st.streamError = e.error;
          if (e.content) {
            st.raw += e.content;
            o.onText?.(stripThink(st.raw));
          }
          if (e.finish) st.finish = e.finish;
          if (e.usage) st.usage = e.usage;
        });
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.push(decoder.decode(value, { stream: true }));
        }
        parser.push(decoder.decode());
        parser.flush();
      }
    } catch (e) {
      lastErr = e;
      if (e instanceof DOMException && e.name === 'AbortError') throw new CompatError('Analyse annulée.');
      const status = (e as { status?: number }).status;
      if (status === 400 || status === 422) {
        if (withExtras) { withExtras = false; continue; } // on réessaie sans les paramètres facultatifs
        throw e;
      }
      const retryable = status === 429 || (status != null && status >= 500) || status == null; // status == null : erreur réseau
      if (retryable && attempt < 3) {
        const ra = (e as { retryAfter?: number }).retryAfter;
        await sleep(Math.min((ra ?? 4 * 2 ** attempt) * 1000, 30000));
        continue;
      }
      if (status == null) throw new CompatError('Connexion au fournisseur d’IA impossible. Vérifie ta connexion Internet.');
      throw e;
    }

    if (st.streamError) throw new CompatError(`Le fournisseur a interrompu la réponse : ${st.streamError}`);
    let text = stripThink(st.raw).trim();
    if (!text) {
      throw new CompatError(st.finish === 'length'
        ? 'Le modèle a épuisé sa limite de longueur en réfléchissant, sans écrire de réponse. Réessaie, ou choisis un modèle plus rapide dans Réglages.'
        : 'Le modèle n’a renvoyé aucune réponse. Réessaie dans un instant.');
    }
    if (st.finish === 'length') text += '\n\n_(Réponse tronquée : limite de longueur atteinte.)_';
    const u: AiUsage = {
      inputTokens: st.usage?.prompt_tokens ?? 0,
      outputTokens: st.usage?.completion_tokens ?? 0,
      searches: 0,
      costUsd: typeof st.usage?.cost === 'number' ? st.usage.cost : 0,
      costKnown: typeof st.usage?.cost === 'number',
    };
    return { text, usage: u, sources: [], model: o.model };
  }
  throw lastErr instanceof Error ? lastErr : new CompatError('Le fournisseur d’IA n’a pas répondu.');
}

// ------------------------------------------------------------------ Catalogue des modèles

export interface CompatModel {
  id: string;
  name: string;
  inPerM: number | null; // dollars par million de jetons
  outPerM: number | null;
  context: number | null;
  created: number | null; // secondes
}

interface RawModel {
  id: string;
  name?: string;
  created?: number;
  context_length?: number;
  pricing?: { prompt?: string | number; completion?: string | number };
  architecture?: { output_modalities?: string[] };
}

const perM = (v: string | number | undefined): number | null => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n * 1e6 : null;
};

export async function listCompatModels(baseUrl: string, apiKey?: string): Promise<CompatModel[]> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey.trim()}` } : undefined,
  });
  if (!res.ok) throw new CompatError(`Impossible de charger la liste des modèles (${res.status}).`);
  const j = (await res.json()) as { data?: RawModel[] };
  return (j.data ?? [])
    .filter((m) => !m.architecture?.output_modalities || m.architecture.output_modalities.every((x) => x === 'text'))
    .map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      inPerM: perM(m.pricing?.prompt),
      outPerM: perM(m.pricing?.completion),
      context: m.context_length ?? null,
      created: m.created ?? null,
    }))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
}
