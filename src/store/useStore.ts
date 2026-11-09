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
  upsertWallet: (w: WalletAddress) => void;
  removeWallet: (id: string) => void;
  upsertDcaPlan: (p: DcaPlan) => void;
  removeDcaPlan: (id: string) => void;
  addDcaExecution: (e: DcaExecution) => void;
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
  addBasketExecution: (e: BasketExecution) => void;
  removeBasketExecution: (id: string) => void;
  toggleCdcSeen: (coinId: string) => void;
  toggleExitDone: (coinId: string, multiple: number) => void;
  setEnvelope: (patch: Partial<DefiEnvelope>) => void;
  upsertDefiBet: (b: DefiBet) => void;
  removeDefiBet: (id: string) => void;
  /** Ajoute des transactions importées ; celles dont l'identifiant existe déjà sont ignorées (aucun doublon). */
  importTransactions: (txs: Transaction[]) => { added: number; skipped: number };
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

const MAX_REPORTS = 60;
const MAX_CHAT = 80;

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
  envelope: { ...DEFAULT_ENVELOPE },
  defiBets: [] as DefiBet[],
  cdcSeen: [] as string[],
});

/** Stockage tolérant : si le stockage local est indisponible, l'app fonctionne en mémoire. */
const safeStorage = createJSONStorage(() => {
  try {
    const k = '__boussole_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (n: string) => mem.get(n) ?? null,
      setItem: (n: string, v: string) => void mem.set(n, v),
      removeItem: (n: string) => void mem.delete(n),
    };
  }
});

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
      upsertWallet: (w) => set((s) => ({ wallets: upsert(s.wallets, w) })),
      removeWallet: (id) => set((s) => ({
        wallets: s.wallets.filter((x) => x.id !== id),
        accounts: s.accounts.map((a) => (a.walletIds.includes(id) ? { ...a, walletIds: a.walletIds.filter((w) => w !== id) } : a)),
      })),
      upsertDcaPlan: (p) => set((s) => ({ dcaPlans: upsert(s.dcaPlans, p) })),
      removeDcaPlan: (id) => set((s) => ({ dcaPlans: s.dcaPlans.filter((x) => x.id !== id), dcaExecutions: s.dcaExecutions.filter((e) => e.planId !== id) })),
      addDcaExecution: (e) => set((s) => ({ dcaExecutions: [e, ...s.dcaExecutions] })),
      removeDcaExecution: (id) => set((s) => ({ dcaExecutions: s.dcaExecutions.filter((x) => x.id !== id) })),
      upsertTrade: (t) => set((s) => ({ trades: upsert(s.trades, t) })),
      removeTrade: (id) => set((s) => ({ trades: s.trades.filter((x) => x.id !== id) })),
      upsertAlert: (a) => set((s) => ({ alerts: upsert(s.alerts, a) })),
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((x) => x.id !== id) })),
      upsertAirdrop: (a) => set((s) => ({ airdrops: upsert(s.airdrops, a) })),
      removeAirdrop: (id) => set((s) => ({ airdrops: s.airdrops.filter((x) => x.id !== id) })),
      upsertThesis: (t) => set((s) => ({ theses: upsert(s.theses, t) })),
      removeThesis: (id) => set((s) => ({ theses: s.theses.filter((x) => x.id !== id) })),
      addReport: (r) => set((s) => ({ reports: [r, ...s.reports.filter((x) => x.id !== r.id)].slice(0, MAX_REPORTS) })),
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
      addBasketExecution: (e) => set((s) => ({
        basketExecutions: [e, ...s.basketExecutions.filter((x) => x.id !== e.id)],
        basket: s.basket && s.basket.id === e.basketId ? { ...s.basket, reserveUsd: Math.max(0, Math.round((s.basket.reserveUsd + e.reserveDeltaUsd) * 100) / 100) } : s.basket,
      })),
      removeBasketExecution: (id) => set((s) => {
        const e = s.basketExecutions.find((x) => x.id === id);
        return {
          basketExecutions: s.basketExecutions.filter((x) => x.id !== id),
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
      toggleCdcSeen: (coinId) => set((s) => ({ cdcSeen: s.cdcSeen.includes(coinId) ? s.cdcSeen.filter((x) => x !== coinId) : [...s.cdcSeen, coinId] })),
      importTransactions: (txs) => {
        const known = new Set(get().transactions.map((t) => t.id));
        const fresh = txs.filter((t, i) => !known.has(t.id) && txs.findIndex((u) => u.id === t.id) === i);
        if (fresh.length) set((s) => ({ transactions: [...fresh, ...s.transactions] }));
        return { added: fresh.length, skipped: txs.length - fresh.length };
      },
      importAll: (data) => set((s) => {
        const profile = { ...s.profile, ...(data.profile ?? {}) };
        return { ...s, ...data, settings: { ...s.settings, ...(data.settings ?? {}) }, profile: { ...profile, rules: rulesOf(profile) } };
      }),
      resetAll: () => set({ ...initialData() }),
    }),
    {
      name: 'boussole-data',
      version: 1,
      storage: safeStorage,
      partialize: (s) => ({
        settings: s.settings,
        profile: s.profile,
        watchlist: s.watchlist,
        watchedTokens: s.watchedTokens,
        transactions: s.transactions,
        wallets: s.wallets,
        dcaPlans: s.dcaPlans,
        dcaExecutions: s.dcaExecutions,
        trades: s.trades,
        alerts: s.alerts,
        airdrops: s.airdrops,
        theses: s.theses,
        reports: s.reports,
        chat: s.chat,
        checklist: s.checklist,
        accounts: s.accounts,
        basket: s.basket,
        basketExecutions: s.basketExecutions,
        exitDone: s.exitDone,
        envelope: s.envelope,
        defiBets: s.defiBets,
        cdcSeen: s.cdcSeen,
      }),
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

export const BACKUP_KEYS = [
  'settings', 'profile', 'watchlist', 'watchedTokens', 'transactions', 'wallets', 'dcaPlans', 'dcaExecutions',
  'trades', 'alerts', 'airdrops', 'theses', 'reports', 'chat', 'checklist', 'accounts', 'basket', 'basketExecutions', 'exitDone', 'envelope', 'defiBets', 'cdcSeen',
] as const;

export function exportBackup(includeKey = false): string {
  const s = useStore.getState();
  const data: Record<string, unknown> = { app: 'boussole-crypto', version: 1, exportedAt: new Date().toISOString() };
  for (const k of BACKUP_KEYS) data[k] = s[k];
  if (!includeKey) data.settings = { ...s.settings, anthropicKey: '', compatKey: '' };
  return JSON.stringify(data, null, 2);
}

export function parseBackup(json: string): Partial<AppState> {
  const data = JSON.parse(json) as Record<string, unknown>;
  if (data.app !== 'boussole-crypto') throw new Error('Ce fichier n’est pas une sauvegarde Boussole.');
  const out: Record<string, unknown> = {};
  for (const k of BACKUP_KEYS) if (k in data) out[k] = data[k];
  const settings = out.settings as Settings | undefined;
  if (settings) {
    // Les clés ne sont jamais exportées : ne pas écraser celles de cet appareil par des clés vides
    const cur = useStore.getState().settings;
    out.settings = { ...settings, anthropicKey: settings.anthropicKey || cur.anthropicKey, compatKey: settings.compatKey || cur.compatKey };
  }
  return out as Partial<AppState>;
}

export const newId = uid;
