// État global persistant (stocké uniquement sur l'appareil, dans le stockage local de l'app).

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  Account, AirdropItem, AiReport, BasketExecution, BasketPlan, DefiBet, DefiEnvelope, ChatMessage, DcaExecution, DcaPlan, PriceAlert, Profile, Settings, Thesis,
  TradeEntry, Transaction, WalletAddress, WatchedToken,
} from '../types';
import { defaultProfile, rulesOf } from '../lib/profile';
import { DEFAULT_ENVELOPE } from '../lib/envelope';
import { uid } from '../lib/format';
import { DEFAULT_COMPAT_MODEL, NOUS_BASE_URL } from '../ai/openai';
import { BACKUP_KEYS, DATA_VERSION } from '../lib/backup';
import { guardedStorage, migrateState, STORE_KEY, systemStorage, useStorageStatus } from './persistence';

export interface AppState {
  settings: Settings;
  profile: Profile;
  watchlist: string[];
  watchedTokens: WatchedToken[];
  transactions: Transaction[];
  wallets: WalletAddress[];
  dcaPlans: DcaPlan[];
  dcaExecutions: DcaExecution[];
  trades: TradeEntry[];
  alerts: PriceAlert[];
  airdrops: AirdropItem[];
  theses: Thesis[];
  reports: AiReport[];
  chat: ChatMessage[];
  checklist: Record<string, boolean>;
  accounts: Account[];
  basket: BasketPlan | null;
  basketExecutions: BasketExecution[];
  /** Paliers de sortie déjà vendus : identifiant de crypto → multiples (×2, ×3…). */
  exitDone: Record<string, number[]>;
  /** Dernière tranche du cœur (Bitcoin, Ethereum) allégée en euphorie : identifiant de crypto → date ISO. */
  coreTrims: Record<string, string>;
  envelope: DefiEnvelope;
  defiBets: DefiBet[];
  /** Cryptos que tu as confirmé voir dans l'application Crypto.com. */
  cdcSeen: string[];

  setSettings: (patch: Partial<Settings>) => void;
  setProfile: (patch: Partial<Profile>) => void;
  toggleWatch: (coinId: string) => void;
  addWatchedToken: (t: WatchedToken) => void;
  removeWatchedToken: (id: string) => void;
  upsertTransaction: (tx: Transaction) => void;
  removeTransaction: (id: string) => void;
  /** Ajoute plusieurs transactions en une seule écriture (regroupement, échanges…). */
  addTransactions: (txs: Transaction[]) => void;
  upsertWallet: (w: WalletAddress) => void;
  removeWallet: (id: string) => void;
  upsertDcaPlan: (p: DcaPlan) => void;
  removeDcaPlan: (id: string) => void;
  /** Enregistre une échéance et ses transactions en UNE écriture ; supprimer l'échéance retire aussi ces transactions. */
  addDcaExecution: (e: DcaExecution, txs?: Transaction[]) => void;
  removeDcaExecution: (id: string) => void;
  upsertTrade: (t: TradeEntry) => void;
  removeTrade: (id: string) => void;
  upsertAlert: (a: PriceAlert) => void;
  removeAlert: (id: string) => void;
  upsertAirdrop: (a: AirdropItem) => void;
  removeAirdrop: (id: string) => void;
  upsertThesis: (t: Thesis) => void;
  removeThesis: (id: string) => void;
  addReport: (r: AiReport) => void;
  removeReport: (id: string) => void;
  addChat: (m: ChatMessage) => void;
  clearChat: () => void;
  setChecklist: (c: Record<string, boolean>) => void;
  upsertAccount: (a: Account) => void;
  removeAccount: (id: string) => void;
  setBasket: (b: BasketPlan | null) => void;
  /** Enregistre une échéance du panier et met à jour la réserve d'USDC. */
  addBasketExecution: (e: BasketExecution, txs?: Transaction[]) => void;
  removeBasketExecution: (id: string) => void;
  toggleCdcSeen: (coinId: string) => void;
  toggleExitDone: (coinId: string, multiple: number) => void;
  /** Note qu'une tranche du cœur vient d'être vendue (démarre le délai avant la suivante). */
  markCoreTrim: (coinId: string) => void;
  clearCoreTrim: (coinId: string) => void;
  setEnvelope: (patch: Partial<DefiEnvelope>) => void;
  upsertDefiBet: (b: DefiBet) => void;
  removeDefiBet: (id: string) => void;
  /** Ajoute des transactions importées ; celles dont l'identifiant existe déjà sont ignorées (aucun doublon). */
  importTransactions: (txs: Transaction[], opts?: { replaceIds?: string[]; extra?: Transaction[] }) => { added: number; skipped: number; replaced: number; extra: number };
  importAll: (data: Partial<AppState>) => void;
  resetAll: () => void;
}

export const defaultSettings: Settings = {
  currency: 'EUR',
  theme: 'system',
  aiProvider: 'compat',
  anthropicKey: '',
  aiModel: 'claude-opus-5-5',
  aiWebSearch: true,
  aiAnonymous: false,
  compatKey: '',
  compatBaseUrl: NOUS_BASE_URL,
  compatModel: DEFAULT_COMPAT_MODEL,
  briefingAuto: false,
  coingeckoKey: '',
  notifications: true,
  closeToTray: true,
  autoStart: false,
  disclaimerAccepted: false,
  taxRatePct: 31.4,
  scanSize: 50,
};

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [item, ...list];
  const copy = [...list];
  copy[i] = item;
  return copy;
}

// Plafonds : les rapports IA (surtout ceux du comité) et le chat sont les plus gros consommateurs du stockage local (≈ 5 Mo).
const MAX_REPORTS = 25;
const MAX_CHAT = 60;
/** Seuls les rapports les plus récents gardent le détail de chaque analyste du comité. */
const KEEP_PARTS = 6;

const initialData = () => ({
  settings: { ...defaultSettings },
  profile: defaultProfile(),
  watchlist: ['bitcoin', 'ethereum', 'solana'],
  watchedTokens: [] as WatchedToken[],
  transactions: [] as Transaction[],
  wallets: [] as WalletAddress[],
  dcaPlans: [] as DcaPlan[],
  dcaExecutions: [] as DcaExecution[],
  trades: [] as TradeEntry[],
  alerts: [] as PriceAlert[],
  airdrops: [] as AirdropItem[],
  theses: [] as Thesis[],
  reports: [] as AiReport[],
  chat: [] as ChatMessage[],
  checklist: {} as Record<string, boolean>,
  accounts: [] as Account[],
  basket: null as BasketPlan | null,
  basketExecutions: [] as BasketExecution[],
  exitDone: {} as Record<string, number[]>,
  coreTrims: {} as Record<string, string>,
  envelope: { ...DEFAULT_ENVELOPE },
  defiBets: [] as DefiBet[],
  cdcSeen: [] as string[],
});

const system = systemStorage();
if (system.memory) useStorageStatus.getState().setStatus({ kind: 'memory' });
const safeStorage = createJSONStorage(() => guardedStorage(system.backend, (st) => useStorageStatus.getState().setStatus(st)));

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialData(),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      toggleWatch: (coinId) => set((s) => ({ watchlist: s.watchlist.includes(coinId) ? s.watchlist.filter((x) => x !== coinId) : [...s.watchlist, coinId] })),
      addWatchedToken: (t) => set((s) => ({ watchedTokens: [t, ...s.watchedTokens.filter((x) => x.id !== t.id)] })),
      removeWatchedToken: (id) => set((s) => ({ watchedTokens: s.watchedTokens.filter((x) => x.id !== id) })),
      upsertTransaction: (tx) => set((s) => ({ transactions: upsert(s.transactions, tx) })),
      removeTransaction: (id) => set((s) => ({ transactions: s.transactions.filter((x) => x.id !== id) })),
      addTransactions: (txs) => set((s) => ({ transactions: [...txs, ...s.transactions] })),
      upsertWallet: (w) => set((s) => ({ wallets: upsert(s.wallets, w) })),
      removeWallet: (id) => set((s) => ({
        wallets: s.wallets.filter((x) => x.id !== id),
        accounts: s.accounts.map((a) => (a.walletIds.includes(id) ? { ...a, walletIds: a.walletIds.filter((w) => w !== id) } : a)),
      })),
      upsertDcaPlan: (p) => set((s) => ({ dcaPlans: upsert(s.dcaPlans, p) })),
      removeDcaPlan: (id) => set((s) => ({ dcaPlans: s.dcaPlans.filter((x) => x.id !== id), dcaExecutions: s.dcaExecutions.filter((e) => e.planId !== id) })),
      addDcaExecution: (e, txs) => set((s) => ({
        dcaExecutions: [txs?.length ? { ...e, txIds: txs.map((t) => t.id) } : e, ...s.dcaExecutions],
        transactions: txs?.length ? [...txs, ...s.transactions] : s.transactions,
      })),
      removeDcaExecution: (id) => set((s) => {
        const gone = new Set(s.dcaExecutions.find((x) => x.id === id)?.txIds ?? []);
        return { dcaExecutions: s.dcaExecutions.filter((x) => x.id !== id), transactions: gone.size ? s.transactions.filter((t) => !gone.has(t.id)) : s.transactions };
      }),
      upsertTrade: (t) => set((s) => ({ trades: upsert(s.trades, t) })),
      removeTrade: (id) => set((s) => ({ trades: s.trades.filter((x) => x.id !== id) })),
      upsertAlert: (a) => set((s) => ({ alerts: upsert(s.alerts, a) })),
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((x) => x.id !== id) })),
      upsertAirdrop: (a) => set((s) => ({ airdrops: upsert(s.airdrops, a) })),
      removeAirdrop: (id) => set((s) => ({ airdrops: s.airdrops.filter((x) => x.id !== id) })),
      upsertThesis: (t) => set((s) => ({ theses: upsert(s.theses, t) })),
      removeThesis: (id) => set((s) => ({ theses: s.theses.filter((x) => x.id !== id) })),
      addReport: (r) => set((s) => ({
        reports: [r, ...s.reports.filter((x) => x.id !== r.id)].slice(0, MAX_REPORTS).map((x, i) => (i >= KEEP_PARTS && x.parts ? { ...x, parts: undefined } : x)),
      })),
      removeReport: (id) => set((s) => ({ reports: s.reports.filter((x) => x.id !== id) })),
      addChat: (m) => set((s) => ({ chat: [...s.chat, m].slice(-MAX_CHAT) })),
      clearChat: () => set({ chat: [] }),
      setChecklist: (c) => set({ checklist: c }),
      upsertAccount: (a) => set((s) => ({ accounts: upsert(s.accounts, a) })),
      removeAccount: (id) => set((s) => ({
        accounts: s.accounts.filter((x) => x.id !== id),
        // Les opérations de ce compte redeviennent « sans compte » au lieu de disparaître.
        transactions: s.transactions.map((t) => (t.accountId === id || t.toAccountId === id
          ? { ...t, accountId: t.accountId === id ? undefined : t.accountId, toAccountId: t.toAccountId === id ? undefined : t.toAccountId }
          : t)),
      })),
      setBasket: (b) => set({ basket: b }),
      addBasketExecution: (e, txs) => set((s) => ({
        basketExecutions: [txs?.length ? { ...e, txIds: txs.map((t) => t.id) } : e, ...s.basketExecutions.filter((x) => x.id !== e.id)],
        transactions: txs?.length ? [...txs, ...s.transactions] : s.transactions,
        basket: s.basket && s.basket.id === e.basketId ? { ...s.basket, reserveUsd: Math.max(0, Math.round((s.basket.reserveUsd + e.reserveDeltaUsd) * 100) / 100) } : s.basket,
      })),
      removeBasketExecution: (id) => set((s) => {
        const e = s.basketExecutions.find((x) => x.id === id);
        const gone = new Set(e?.txIds ?? []);
        return {
          basketExecutions: s.basketExecutions.filter((x) => x.id !== id),
          transactions: gone.size ? s.transactions.filter((t) => !gone.has(t.id)) : s.transactions,
          basket: e && s.basket && s.basket.id === e.basketId ? { ...s.basket, reserveUsd: Math.max(0, Math.round((s.basket.reserveUsd - e.reserveDeltaUsd) * 100) / 100) } : s.basket,
        };
      }),
      setEnvelope: (patch) => set((s) => ({ envelope: { ...s.envelope, ...patch } })),
      upsertDefiBet: (b) => set((s) => ({ defiBets: upsert(s.defiBets, b) })),
      removeDefiBet: (id) => set((s) => ({ defiBets: s.defiBets.filter((x) => x.id !== id) })),
      toggleExitDone: (coinId, multiple) => set((s) => {
        const cur = s.exitDone[coinId] ?? [];
        return { exitDone: { ...s.exitDone, [coinId]: cur.includes(multiple) ? cur.filter((m) => m !== multiple) : [...cur, multiple] } };
      }),
      markCoreTrim: (coinId) => set((s) => ({ coreTrims: { ...s.coreTrims, [coinId]: new Date().toISOString() } })),
      clearCoreTrim: (coinId) => set((s) => { const next = { ...s.coreTrims }; delete next[coinId]; return { coreTrims: next }; }),
      toggleCdcSeen: (coinId) => set((s) => ({ cdcSeen: s.cdcSeen.includes(coinId) ? s.cdcSeen.filter((x) => x !== coinId) : [...s.cdcSeen, coinId] })),
      // Une seule écriture : les saisies remplacées sortent et les lignes importées (plus d'éventuels soldes d'ouverture) entrent ensemble.
      importTransactions: (txs, opts) => {
        const replace = new Set(opts?.replaceIds ?? []);
        const known = new Set(get().transactions.filter((t) => !replace.has(t.id)).map((t) => t.id));
        const fresh = txs.filter((t, i) => !known.has(t.id) && txs.findIndex((u) => u.id === t.id) === i);
        const extra = (opts?.extra ?? []).filter((t, i, all) => !known.has(t.id) && all.findIndex((u) => u.id === t.id) === i);
        const removed = get().transactions.filter((t) => replace.has(t.id)).length;
        if (fresh.length || extra.length || removed) set((s) => ({ transactions: [...fresh, ...extra, ...s.transactions.filter((t) => !replace.has(t.id))] }));
        return { added: fresh.length, skipped: txs.length - fresh.length, replaced: removed, extra: extra.length };
      },
      importAll: (data) => set((s) => {
        // Seules les rubriques connues sont reprises, et les réglages passent par une liste blanche (voir lib/backup.ts).
        const next: Record<string, unknown> = {};
        for (const k of BACKUP_KEYS) if (k in data) next[k] = (data as Record<string, unknown>)[k];
        const profile = { ...s.profile, ...((next.profile as Partial<Profile> | undefined) ?? {}) };
        return {
          ...next,
          settings: { ...s.settings, ...((next.settings as Partial<Settings> | undefined) ?? {}) },
          profile: { ...profile, rules: rulesOf(profile) },
        } as Partial<AppState>;
      }),
      resetAll: () => set({ ...initialData() }),
    }),
    {
      name: STORE_KEY,
      version: DATA_VERSION,
      migrate: migrateState as (persisted: unknown, version: number) => AppState,
      storage: safeStorage,
      partialize: (s) => Object.fromEntries(BACKUP_KEYS.map((k) => [k, s[k]])) as Partial<AppState>,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        const saved = (p.settings ?? {}) as Partial<Settings>;
        // Réglages enregistrés avant l'ajout du second fournisseur : si une clé Claude existe, on reste sur Claude.
        if (saved.aiProvider === undefined && saved.anthropicKey) saved.aiProvider = 'anthropic';
        const profile = { ...current.profile, ...(p.profile ?? {}) };
        return {
          ...current,
          ...p,
          settings: { ...current.settings, ...saved },
          // Les règles ajoutées après coup (anti-éparpillement) reçoivent la valeur de ton profil.
          profile: { ...profile, rules: rulesOf(profile) },
        };
      },
    },
  ),
);

/**
 * Contenu d'un fichier de sauvegarde. Jamais les clés API (Claude, Nous Portal, CoinGecko) : le fichier contient en revanche
 * tout l'historique, les adresses suivies et les clés publiques étendues (xpub) : à ranger comme un document financier.
 */
export function exportBackup(includeKeys = false): string {
  const s = useStore.getState();
  const data: Record<string, unknown> = { app: 'boussole-crypto', version: DATA_VERSION, exportedAt: new Date().toISOString() };
  for (const k of BACKUP_KEYS) data[k] = s[k];
  if (!includeKeys) data.settings = { ...s.settings, anthropicKey: '', compatKey: '', coingeckoKey: '' };
  return JSON.stringify(data, null, 2);
}

export const newId = uid;
