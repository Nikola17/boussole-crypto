// Sauvegarde : liste des données conservées, vérification d'un fichier avant import, résumé affiché pour confirmation.
// Fonctions pures (aucun accès au stockage) : un fichier abîmé ou piégé ne doit jamais atteindre les données de l'application.

import type { AiReport, Settings } from '../types';
import { sanitizeReportData } from './reportData';

/**
 * Version du format des données (stockage et fichiers de sauvegarde). À augmenter avec une migration dans store/persistence.ts.
 * v2 (1.8.0) : horodatages des éléments (`updatedAt`), suppressions à propager (`deletions`) et horodatages par rubrique (`syncStamp`).
 * v3 (1.28.0) : plusieurs portefeuilles papier (`paperPortfolios`), ordres en attente (`paperOrders`), journaux des autopilotes (`paperDays`).
 */
export const DATA_VERSION = 3;

/** Toutes les données de l'utilisateur : le stockage et la sauvegarde partent de cette seule liste. */
export const BACKUP_KEYS = [
  'settings', 'profile', 'watchlist', 'watchedTokens', 'transactions', 'wallets', 'dcaPlans', 'dcaExecutions',
  'trades', 'alerts', 'airdrops', 'theses', 'reports', 'chat', 'checklist', 'accounts', 'basket', 'basketExecutions', 'exitDone', 'coreTrims', 'envelope', 'defiBets', 'cdcSeen', 'paperTrades', 'paper', 'paperPortfolios', 'paperOrders', 'paperDays', 'smartWallets', 'hotNotes', 'impulseWaits', 'profileHistory',
  'deletions', 'syncStamp',
] as const;
export type BackupKey = (typeof BACKUP_KEYS)[number];

const STRING_LISTS: BackupKey[] = ['watchlist', 'cdcSeen'];
const OBJECT_LISTS: BackupKey[] = ['watchedTokens', 'transactions', 'wallets', 'dcaPlans', 'dcaExecutions', 'trades', 'alerts', 'airdrops', 'theses', 'reports', 'chat', 'accounts', 'basketExecutions', 'defiBets', 'paperTrades', 'paperPortfolios', 'paperOrders', 'paperDays', 'deletions', 'smartWallets', 'hotNotes', 'impulseWaits', 'profileHistory'];
const PLAIN_OBJECTS: BackupKey[] = ['settings', 'profile', 'checklist', 'exitDone', 'coreTrims', 'envelope', 'syncStamp'];

/**
 * Réglages repris d'une sauvegarde. Jamais : clés API, adresse du serveur d'IA, fournisseur d'IA (un fichier piégé pourrait
 * sinon envoyer ta clé et ton portefeuille ailleurs), ni les réglages propres à un appareil (zone de notification, démarrage).
 */
const IMPORTABLE_SETTINGS: (keyof Settings)[] = ['currency', 'theme', 'taxRatePct', 'scanSize', 'briefingAuto', 'aiWebSearch', 'aiModel', 'compatModel', 'mistralModel'];

export function importableSettings(s: unknown): Partial<Settings> {
  if (typeof s !== 'object' || s === null) return {};
  const src = s as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of IMPORTABLE_SETTINGS) if (k in src) out[k] = src[k];
  if (out.currency !== 'EUR' && out.currency !== 'USD') delete out.currency;
  if (out.theme !== 'system' && out.theme !== 'dark' && out.theme !== 'light') delete out.theme;
  if (typeof out.taxRatePct !== 'number' || !Number.isFinite(out.taxRatePct) || out.taxRatePct < 0 || out.taxRatePct > 100) delete out.taxRatePct;
  if (out.scanSize !== 50 && out.scanSize !== 100) delete out.scanSize;
  for (const k of ['briefingAuto', 'aiWebSearch'] as const) if (typeof out[k] !== 'boolean') delete out[k];
  for (const k of ['aiModel', 'compatModel', 'mistralModel'] as const) if (typeof out[k] !== 'string' || !(out[k] as string).trim()) delete out[k];
  return out as Partial<Settings>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const TX_TYPES = new Set(['buy', 'sell', 'deposit', 'withdraw', 'reward', 'transfer']);

/** Une transaction exploitable : sans cela, les calculs de coût et d'impôt seraient faussés. */
function validTransaction(t: Record<string, unknown>): boolean {
  return isStr(t.id) && isStr(t.coinId) && isStr(t.symbol) && TX_TYPES.has(String(t.type))
    && isNum(t.quantity) && t.quantity >= 0 && isNum(t.price) && t.price >= 0
    && typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t.date)
    && (t.currency === 'EUR' || t.currency === 'USD') && isNum(t.fxEurPerUsd) && t.fxEurPerUsd > 0;
}

export interface BackupSummary {
  exportedAt: string | null;
  version: number | null;
  counts: { label: string; n: number }[];
}

export interface BackupCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Données prêtes à être importées (clés absentes du fichier = non touchées). */
  data: Record<string, unknown>;
  /** Éléments illisibles ignorés. */
  dropped: number;
  summary: BackupSummary;
}

const COUNT_LABELS: [BackupKey, string][] = [
  ['transactions', 'transactions'], ['accounts', 'comptes'], ['wallets', 'wallets suivis'], ['dcaPlans', 'plans DCA'],
  ['basketExecutions', 'échéances du panier'], ['theses', 'thèses'], ['trades', 'trades'], ['alerts', 'alertes'], ['reports', 'rapports IA'],
];

/** Vérifie un fichier de sauvegarde (déjà décodé) et prépare ce qui peut être importé. N'écrit rien nulle part. */
export function validateBackup(raw: unknown): BackupCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data: Record<string, unknown> = {};
  let dropped = 0;
  const summary: BackupSummary = { exportedAt: null, version: null, counts: [] };
  const fail = (): BackupCheck => ({ ok: false, errors, warnings, data: {}, dropped, summary });

  if (!isObj(raw) || raw.app !== 'boussole-crypto') {
    errors.push('Ce fichier n’est pas une sauvegarde Boussole.');
    return fail();
  }
  summary.exportedAt = typeof raw.exportedAt === 'string' ? raw.exportedAt : null;
  summary.version = isNum(raw.version) ? raw.version : null;
  if (summary.version == null) warnings.push('Le fichier n’indique pas sa version.');
  else if (summary.version > DATA_VERSION) {
    errors.push(`Cette sauvegarde vient d’une version plus récente de Boussole (format ${summary.version}). Mets l’application à jour avant de l’importer.`);
    return fail();
  }

  for (const k of BACKUP_KEYS) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (k === 'basket') {
      if (v === null || (isObj(v) && isStr(v.id))) data[k] = v;
      else errors.push('Le panier DCA du fichier est illisible.');
    } else if (PLAIN_OBJECTS.includes(k)) {
      if (isObj(v)) data[k] = v;
      else errors.push(`La rubrique « ${k} » est illisible.`);
    } else if (STRING_LISTS.includes(k)) {
      if (Array.isArray(v)) data[k] = v.filter((x) => typeof x === 'string');
      else errors.push(`La rubrique « ${k} » est illisible.`);
    } else if (OBJECT_LISTS.includes(k)) {
      if (!Array.isArray(v)) { errors.push(`La rubrique « ${k} » est illisible.`); continue; }
      const kept = v.filter((x) => isObj(x) && isStr(x.id) && (k !== 'transactions' || validTransaction(x)));
      dropped += v.length - kept.length;
      data[k] = k === 'reports'
        ? (kept as unknown as AiReport[]).map((r) => ({ ...r, markdown: typeof r.markdown === 'string' ? r.markdown : '', data: sanitizeReportData(r.kind, r.data) }))
        : kept;
    }
  }
  if (errors.length) return fail();

  if (isObj(data.exitDone)) {
    const clean: Record<string, number[]> = {};
    for (const [coin, list] of Object.entries(data.exitDone)) if (Array.isArray(list)) clean[coin] = list.filter(isNum);
    data.exitDone = clean;
  }
  if (isObj(data.syncStamp)) {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.syncStamp)) if (typeof v === 'string' && v) clean[k] = v;
    data.syncStamp = clean;
  }
  if (Array.isArray(data.deletions)) {
    data.deletions = (data.deletions as unknown[]).filter((d): d is { key: string; at: string } => isObj(d) && isStr(d.key) && isStr(d.at) && /^\d{4}-\d{2}-\d{2}T/.test(d.at));
  }
  if (isObj(data.coreTrims)) {
    const clean: Record<string, string> = {};
    for (const [coin, d] of Object.entries(data.coreTrims)) if (typeof d === 'string' && Number.isFinite(Date.parse(d))) clean[coin] = d;
    data.coreTrims = clean;
  }
  if ('settings' in data) data.settings = importableSettings(data.settings);
  if (dropped) warnings.push(`${dropped} élément${dropped > 1 ? 's' : ''} illisible${dropped > 1 ? 's' : ''} ignoré${dropped > 1 ? 's' : ''}.`);
  if (!Object.keys(data).length) {
    errors.push('Le fichier ne contient aucune donnée Boussole.');
    return fail();
  }
  for (const [k, label] of COUNT_LABELS) if (Array.isArray(data[k])) summary.counts.push({ label, n: (data[k] as unknown[]).length });
  return { ok: true, errors, warnings, data, dropped, summary };
}

/** Compte les mêmes rubriques dans l'état actuel (pour comparer avec le fichier avant de le remplacer). */
export function countsOf(state: Partial<Record<BackupKey, unknown>>): { label: string; n: number }[] {
  return COUNT_LABELS.map(([k, label]) => ({ label, n: Array.isArray(state[k]) ? (state[k] as unknown[]).length : 0 }));
}

/** Vrai si l'état contient autre chose que les valeurs d'un premier lancement (évite de sauvegarder du vide). */
export function hasUserData(state: Partial<Record<BackupKey, unknown>>): boolean {
  const lists: BackupKey[] = ['transactions', 'wallets', 'accounts', 'dcaPlans', 'trades', 'alerts', 'airdrops', 'theses', 'basketExecutions', 'defiBets', 'watchedTokens'];
  return lists.some((k) => Array.isArray(state[k]) && (state[k] as unknown[]).length > 0) || !!state.basket;
}
