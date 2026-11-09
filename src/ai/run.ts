// Point d'entrée unique pour appeler l'IA, quel que soit le fournisseur choisi dans les Réglages.

import type { AiModel, Settings } from '../types';
import { MODEL_INFO, runClaude, type ChatTurn, type Effort, type RunResult } from './claude';
import { NOUS_BASE_URL, runCompat } from './openai';

export interface AiConfig {
  provider: 'anthropic' | 'compat';
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Vrai seulement si le fournisseur sait chercher sur le web ET que l'option est activée. */
  webSearch: boolean;
  name: string;
}

export interface AiRunOptions {
  cfg: AiConfig;
  system: string;
  prompt?: string;
  messages?: ChatTurn[];
  effort?: Effort;
  /** Nombre maximal de recherches web demandées (ignoré si le fournisseur n'en propose pas). */
  searches?: number;
  maxTokens?: number;
  onText?: (textSoFar: string) => void;
  signal?: AbortSignal;
}

export function runAi(o: AiRunOptions): Promise<RunResult> {
  const { cfg } = o;
  if (cfg.provider === 'anthropic') {
    return runClaude({
      apiKey: cfg.apiKey,
      model: cfg.model as AiModel,
      system: o.system,
      prompt: o.prompt,
      messages: o.messages,
      effort: o.effort,
      webSearch: cfg.webSearch ? o.searches ?? 0 : 0,
      maxTokens: o.maxTokens,
      onText: o.onText,
      signal: o.signal,
    });
  }
  return runCompat({
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    system: o.system,
    prompt: o.prompt,
    messages: o.messages,
    effort: o.effort,
    maxTokens: o.maxTokens,
    onText: o.onText,
    signal: o.signal,
  });
}

/** Configuration d'IA déduite des réglages, ou null si aucune clé n'est renseignée. */
export function buildAiConfig(s: Settings, name: string): AiConfig | null {
  if (s.aiProvider === 'anthropic') {
    if (!s.anthropicKey) return null;
    return { provider: 'anthropic', apiKey: s.anthropicKey, model: s.aiModel, baseUrl: '', webSearch: s.aiWebSearch, name };
  }
  if (!s.compatKey) return null;
  return { provider: 'compat', apiKey: s.compatKey, model: s.compatModel, baseUrl: s.compatBaseUrl || NOUS_BASE_URL, webSearch: false, name };
}

export function aiReady(s: Settings): boolean {
  return s.aiProvider === 'anthropic' ? !!s.anthropicKey : !!s.compatKey;
}

/** Nom lisible d'un identifiant de modèle (« deepseek/deepseek-v4.1-flash » → « deepseek-v4.1-flash »). */
export function prettyModel(id: string): string {
  const known = MODEL_INFO[id as AiModel];
  if (known) return known.label;
  return id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;
}

export function aiLabel(s: Settings): string {
  return s.aiProvider === 'anthropic' ? prettyModel(s.aiModel) : prettyModel(s.compatModel);
}

/** Teste la connexion avec une requête minimale. */
export async function testConnection(cfg: AiConfig): Promise<string> {
  const r = await runAi({
    cfg,
    system: 'Réponds en français, en une phrase très courte.',
    prompt: 'Dis bonjour et confirme que la connexion à Boussole fonctionne.',
    effort: 'low',
    maxTokens: 2000,
  });
  return r.text;
}
