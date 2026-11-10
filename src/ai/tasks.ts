// Tâches IA de haut niveau : brief quotidien, comité des sages, analyse rapide, « pourquoi ça bouge »,
// éclaireur d'airdrops, coach de trading, vérification de thèse, avis sur une pépite, conseiller (chat).
// Fonctionne avec n'importe quel fournisseur (Claude ou API compatible OpenAI) via `runAi`.

import { extractJson, type Effort, type RunResult } from './claude';
import { runAi, type AiConfig } from './run';
import {
  AIRDROP_SCOUT_TASK, BRIEFING_TASK, COMMITTEE, JOURNAL_TASK, NO_WEB_ADDENDUM, analystTask, gemTask, presidentTask,
  pulseTask, quickTask, systemCore, thesisTask,
} from './prompts';
import { toJsonBlock } from './context';
import { getNews } from '../api/news';
import type { AiReport, AiReportKind, AiSource, AiUsage, ChatMessage } from '../types';
import { isoDay, uid } from '../lib/format';
import { sanitizeReportData } from '../lib/reportData';

export type { AiConfig } from './run';

export interface Progress {
  step: string;
  text?: string;
  done?: number;
  total?: number;
}

function today(): string {
  return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Prompt système : sans recherche web, on interdit explicitement de compléter l'actualité de mémoire. */
function systemFor(cfg: AiConfig): string {
  return systemCore(cfg.name, today()) + (cfg.webSearch ? '' : NO_WEB_ADDENDUM);
}

function sumUsage(list: AiUsage[]): AiUsage {
  return list.reduce((a, u) => ({
    inputTokens: a.inputTokens + u.inputTokens,
    outputTokens: a.outputTokens + u.outputTokens,
    searches: a.searches + u.searches,
    costUsd: a.costUsd + u.costUsd,
    costKnown: a.costKnown !== false && u.costKnown !== false,
  }), { inputTokens: 0, outputTokens: 0, searches: 0, costUsd: 0, costKnown: true });
}

function mergeSources(list: AiSource[][]): AiSource[] {
  const map = new Map<string, AiSource>();
  for (const l of list) for (const s of l) if (!map.has(s.url)) map.set(s.url, s);
  return [...map.values()].slice(0, 30);
}

function makeReport(kind: AiReportKind, title: string, r: { text: string; usage: AiUsage; sources: AiSource[]; model: string }, extra: Partial<AiReport> = {}): AiReport {
  const { data, markdown } = extractJson(r.text);
  return {
    id: uid(),
    kind,
    title,
    createdAt: new Date().toISOString(),
    day: isoDay(),
    model: r.model,
    markdown,
    data: sanitizeReportData(kind, data),
    usage: r.usage,
    sources: r.sources,
    ...extra,
  };
}

/** Actualités réelles à fournir au modèle quand il ne peut pas chercher sur le web. */
async function newsContext(cfg: AiConfig, topics: string[] = [], max = 18): Promise<{ block: string; sources: AiSource[] }> {
  if (cfg.webSearch) return { block: '', sources: [] };
  const items = await getNews(topics, max);
  const rows = items.map((i) => ({
    date: `${new Date(i.publishedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    source: i.source,
    titre: i.title,
    resume: i.summary,
    lien: i.url,
  }));
  return {
    block: toJsonBlock('actualites_recentes', rows.length ? rows : 'aucune actualité récupérée aujourd’hui (flux indisponibles)'),
    sources: items.map((i) => ({ url: i.url, title: `${i.source} — ${i.title}` })),
  };
}

/** Nom et symbole extraits d'un libellé « Solana (SOL) ». */
function topicsOf(coinLabel: string): string[] {
  const m = coinLabel.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? [m[1], m[2]] : [coinLabel];
}

interface SingleOpts {
  prompt: string;
  effort: Effort;
  searches: number;
  maxTokens?: number;
  onProgress?: (p: Progress) => void;
  step: string;
  signal?: AbortSignal;
  /** Sujets pour filtrer l'actualité ; `undefined` = pas d'actualité dans le prompt. */
  topics?: string[];
}

async function single(cfg: AiConfig, opts: SingleOpts): Promise<RunResult> {
  opts.onProgress?.({ step: opts.step });
  const news = opts.topics ? await newsContext(cfg, opts.topics) : { block: '', sources: [] as AiSource[] };
  const r = await runAi({
    cfg,
    system: systemFor(cfg),
    prompt: news.block ? `${opts.prompt}\n\n${news.block}` : opts.prompt,
    effort: opts.effort,
    searches: opts.searches,
    maxTokens: opts.maxTokens,
    signal: opts.signal,
    onText: (t) => opts.onProgress?.({ step: opts.step, text: t }),
  });
  return { ...r, sources: r.sources.length ? r.sources : news.sources };
}

// ------------------------------------------------------------------ Brief quotidien

export async function runBriefing(cfg: AiConfig, ctx: { market: unknown; portfolio: unknown; dca: unknown; profile: unknown; watchlist: unknown; today?: unknown }, onProgress?: (p: Progress) => void, signal?: AbortSignal): Promise<AiReport> {
  const prompt = [
    BRIEFING_TASK,
    toJsonBlock('profil', ctx.profile),
    toJsonBlock('marche', ctx.market),
    toJsonBlock('portefeuille', ctx.portfolio),
    toJsonBlock('plans_dca', ctx.dca),
    ...(ctx.today ? [toJsonBlock('ordre_du_jour', ctx.today)] : []),
    toJsonBlock('signaux_watchlist', ctx.watchlist),
  ].join('\n\n');
  const watch = Array.isArray(ctx.watchlist) ? (ctx.watchlist as { actif?: string; nom?: string }[]) : [];
  const topics = watch.flatMap((w) => [w.nom ?? '', w.actif ?? '']).filter(Boolean);
  const r = await single(cfg, { prompt, effort: 'medium', searches: 6, step: 'Rédaction du brief du jour…', onProgress, signal, topics });
  return makeReport('briefing', `Brief du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`, r);
}

// ------------------------------------------------------------------ Comité des sages

export async function runCommittee(cfg: AiConfig, coinLabel: string, coinId: string, ctx: { coin: unknown; technical: unknown; market: unknown; portfolio: unknown; profile: unknown }, onProgress?: (p: Progress) => void, signal?: AbortSignal): Promise<AiReport> {
  const news = await newsContext(cfg, topicsOf(coinLabel));
  const data = [toJsonBlock('donnees_crypto', ctx.coin), toJsonBlock('analyse_technique', ctx.technical), toJsonBlock('marche', ctx.market), news.block].filter(Boolean).join('\n\n');
  let done = 0;
  onProgress?.({ step: 'Les 4 analystes travaillent en parallèle…', done, total: COMMITTEE.length + 1 });
  const results = await Promise.all(COMMITTEE.map(async (p) => {
    const r = await runAi({
      cfg,
      system: systemFor(cfg),
      prompt: `${analystTask(p, coinLabel)}\n\n${data}`,
      effort: 'medium',
      searches: 4,
      signal,
    });
    done++;
    onProgress?.({ step: `${p.name} a rendu son rapport (${done}/${COMMITTEE.length})`, done, total: COMMITTEE.length + 1 });
    return r;
  }));
  const reports = results.map((r, i) => `### Rapport ${i + 1} — ${COMMITTEE[i].name} (${COMMITTEE[i].focus})\n${r.text}`).join('\n\n---\n\n');
  const prompt = [
    presidentTask(coinLabel),
    `<rapports_analystes>\n${reports}\n</rapports_analystes>`,
    data,
    toJsonBlock('profil', ctx.profile),
    toJsonBlock('portefeuille', ctx.portfolio),
  ].join('\n\n');
  onProgress?.({ step: 'Le Président rédige la synthèse…', done, total: COMMITTEE.length + 1 });
  const final = await runAi({
    cfg,
    system: systemFor(cfg),
    prompt,
    effort: 'high',
    maxTokens: 20000,
    signal,
    onText: (t) => onProgress?.({ step: 'Le Président rédige la synthèse…', text: t, done, total: COMMITTEE.length + 1 }),
  });
  const usage = sumUsage([...results.map((r) => r.usage), final.usage]);
  const sources = mergeSources([...results.map((r) => r.sources), final.sources, news.sources]);
  return makeReport('committee', `Comité des sages — ${coinLabel}`, { ...final, usage, sources }, {
    coinId,
    parts: results.map((r, i) => ({ title: `${COMMITTEE[i].name} · ${COMMITTEE[i].focus}`, markdown: r.text })),
  });
}

// ------------------------------------------------------------------ Autres tâches

export async function runQuick(cfg: AiConfig, coinLabel: string, coinId: string, ctx: { coin: unknown; technical: unknown; market: unknown; portfolio: unknown; profile: unknown }, onProgress?: (p: Progress) => void, signal?: AbortSignal): Promise<AiReport> {
  const prompt = [quickTask(coinLabel), toJsonBlock('donnees_crypto', ctx.coin), toJsonBlock('analyse_technique', ctx.technical), toJsonBlock('marche', ctx.market), toJsonBlock('profil', ctx.profile), toJsonBlock('portefeuille', ctx.portfolio)].join('\n\n');
  const r = await single(cfg, { prompt, effort: 'medium', searches: 4, step: 'Analyse en cours…', onProgress, signal, topics: topicsOf(coinLabel) });
  return makeReport('quick', `Analyse rapide — ${coinLabel}`, r, { coinId });
}

export async function runPulse(cfg: AiConfig, coinLabel: string, coinId: string, move: string, ctx: { coin: unknown; market: unknown }, onProgress?: (p: Progress) => void, signal?: AbortSignal): Promise<AiReport> {
  const prompt = [pulseTask(coinLabel, move), toJsonBlock('donnees_crypto', ctx.coin), toJsonBlock('marche', ctx.market)].join('\n\n');
  const r = await single(cfg, { prompt, effort: 'medium', searches: 5, step: 'Enquête sur le mouvement…', onProgress, signal, topics: topicsOf(coinLabel) });
  return makeReport('pulse', `Pourquoi ça bouge ? — ${coinLabel}`, r, { coinId });
}

export async function runAirdropScout(cfg: AiConfig, ctx: { profile: unknown; radar: unknown }, onProgress?: (p: Progress) => void, signal?: AbortSignal): Promise<AiReport> {
  if (!cfg.webSearch) {
    // Sans web, un modèle inventerait des campagnes d'airdrop périmées : on refuse plutôt que de tromper l'utilisateur.
    throw new Error('L’éclaireur d’airdrops a besoin de la recherche web (disponible avec Claude). Utilise le Radar DeFi, qui fonctionne avec des données réelles.');
  }
  const prompt = [AIRDROP_SCOUT_TASK, toJsonBlock('profil', ctx.profile), toJsonBlock('radar_defillama_protocoles_sans_token', ctx.radar)].join('\n\n');
  const r = await single(cfg, { prompt, effort: 'medium', searches: 8, step: 'Exploration des airdrops en cours…', onProgress, signal });
  return makeReport('airdrops', 'Éclaireur d’airdrops', r);
}

export async function runJournalReview(cfg: AiConfig, ctx: { stats: unknown; trades: unknown; profile: unknown }, onProgress?: (p: Progress) => void, signal?: AbortSignal): Promise<AiReport> {
  const prompt = [JOURNAL_TASK, toJsonBlock('statistiques', ctx.stats), toJsonBlock('trades', ctx.trades), toJsonBlock('profil', ctx.profile)].join('\n\n');
  const r = await single(cfg, { prompt, effort: 'medium', searches: 0, step: 'Le coach analyse ton journal…', onProgress, signal });
  return makeReport('journal', 'Revue du journal de trading', r);
}

export async function runThesisCheck(cfg: AiConfig, coinLabel: string, coinId: string, ctx: { thesis: unknown; coin: unknown; technical: unknown }, onProgress?: (p: Progress) => void, signal?: AbortSignal): Promise<AiReport> {
  const prompt = [thesisTask(coinLabel), toJsonBlock('these', ctx.thesis), toJsonBlock('donnees_crypto', ctx.coin), toJsonBlock('analyse_technique', ctx.technical)].join('\n\n');
  const r = await single(cfg, { prompt, effort: 'medium', searches: 4, step: 'Vérification de la thèse…', onProgress, signal, topics: topicsOf(coinLabel) });
  return makeReport('thesis', `Contrôle de thèse — ${coinLabel}`, r, { coinId });
}

export async function runGem(cfg: AiConfig, label: string, ctx: { token: unknown; security: unknown; profile: unknown }, onProgress?: (p: Progress) => void, signal?: AbortSignal): Promise<AiReport> {
  const prompt = [gemTask(label), toJsonBlock('token', ctx.token), toJsonBlock('scan_securite', ctx.security), toJsonBlock('profil', ctx.profile)].join('\n\n');
  const r = await single(cfg, { prompt, effort: 'low', searches: 3, step: 'Enquête sur le token…', onProgress, signal });
  return makeReport('gem', `Avis pépite — ${label}`, r);
}

// ------------------------------------------------------------------ Conseiller (chat)

export async function runChat(cfg: AiConfig, history: ChatMessage[], question: string, ctx: { market: unknown; portfolio: unknown; profile: unknown; dca: unknown }, onText?: (t: string) => void, signal?: AbortSignal): Promise<RunResult> {
  const news = await newsContext(cfg, [], 12);
  const system = `${systemFor(cfg)}

Tu es en mode CONSEILLER : réponds à la question de l'utilisateur de façon conversationnelle, précise et courte (150 à 350 mots sauf demande contraire), en t'appuyant sur ses données ci-dessous.${cfg.webSearch ? ' Si la question porte sur l\'actualité ou un projet précis, utilise la recherche web.' : ''}

${toJsonBlock('profil', ctx.profile)}
${toJsonBlock('marche', ctx.market)}
${toJsonBlock('portefeuille', ctx.portfolio)}
${toJsonBlock('plans_dca', ctx.dca)}${news.block ? `\n${news.block}` : ''}`;
  const r = await runAi({
    cfg,
    system,
    messages: [
      ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: question },
    ],
    effort: 'low',
    searches: 3,
    onText,
    signal,
  });
  return { ...r, sources: r.sources.length ? r.sources : news.sources };
}

// ------------------------------------------------------------------ Extraction des ordres d'une réponse de Grok

const GROK_EXTRACT_TASK = `Extrais de la réponse ci-dessous les ordres d'achat proposés. Réponds UNIQUEMENT par un bloc \`\`\`json de la forme {"ordres":[{"jeton":"BTC","type":"classique ou decouverte","montant_usdc":12.5,"raison":"…"}],"liste_decouverte":["SYMB"],"alertes":[],"non_verifie":[]}. N'invente rien : si le montant ou le type d'un ordre n'est pas indiqué, ne l'inclus pas.`;

/** Demande à l'IA configurée d'extraire les ordres d'une réponse sans bloc JSON exploitable (≈ 0,003 $ avec DeepSeek V4.1 Flash). */
export async function runGrokExtract(cfg: AiConfig, text: string, signal?: AbortSignal): Promise<string> {
  const r = await runAi({
    cfg,
    system: 'Tu extrais des données structurées d’un texte. Tu ne commentes pas et tu n’inventes aucune donnée.',
    prompt: `${GROK_EXTRACT_TASK}\n\n<reponse_grok>\n${text.slice(0, 12000)}\n</reponse_grok>`,
    effort: 'low',
    searches: 0,
    maxTokens: 900,
    signal,
  });
  return r.text;
}

// ------------------------------------------------------------------ Relecture de l'ordre du jour du panier

export const BASKET_REVIEW_TASK = `Tu relis l'ORDRE DU JOUR d'un DCA en USDC calculé par des règles (température du marché, réserve, « finir une ligne avant d'en ouvrir une autre », plafond par ligne). Joue le contradicteur bienveillant. Réponds en français, 120 mots maximum, avec exactement ces trois paragraphes :
**Ce qui tient** — une phrase.
**Le risque principal** — une à deux phrases, concrètes pour ces cryptos.
**La question à te poser avant de valider** — une phrase.
N'invente aucune donnée ni actualité et ne propose pas d'autres cryptos.`;

export async function runBasketReview(
  cfg: AiConfig,
  payload: { ordre: unknown; marche: unknown; regles: unknown },
  topics: string[],
  signal?: AbortSignal,
): Promise<RunResult> {
  const prompt = [BASKET_REVIEW_TASK, toJsonBlock('ordre_du_jour', payload.ordre), toJsonBlock('marche', payload.marche), toJsonBlock('regles', payload.regles)].join('\n\n');
  return single(cfg, { prompt, effort: 'low', searches: 2, maxTokens: 700, step: 'Relecture de l’ordre du jour…', signal, topics });
}

// ------------------------------------------------------------------ Résumé du bilan de la semaine

export const WEEKLY_TASK = `Voici le bilan de la semaine d'un investisseur qui fait du DCA avec un panier en USDC. Résume-le en 3 phrases maximum, puis donne UNE seule action concrète pour la semaine prochaine. Appuie-toi uniquement sur les données fournies, n'invente rien et reste factuel et bienveillant. Réponds en français.`;

export async function runWeeklySummary(cfg: AiConfig, report: unknown, signal?: AbortSignal): Promise<RunResult> {
  return single(cfg, { prompt: `${WEEKLY_TASK}\n\n${toJsonBlock('bilan_semaine', report)}`, effort: 'low', searches: 0, maxTokens: 500, step: 'Résumé de la semaine…', signal });
}
