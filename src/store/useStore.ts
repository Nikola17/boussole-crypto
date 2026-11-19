// État global persistant (stocké uniquement sur l'appareil, dans le stockage local de l'app).

import { create } from 'zustand';
import type { ExitSteps } from '../lib/exitSteps';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  Account, AirdropItem, AiReport, BasketExecution, BasketPlan, DefiBet, DefiEnvelope, ChatMessage, DcaExecution, DcaPlan, HotNote, ImpulseWait, PaperDayLog, PaperOrder, PaperPortfolio, PaperTrade, PickSnapshot, PortfolioSnapshot, SmartMove, PriceAlert, Profile, ProfileChange, Settings, SmartWallet, SyncDeletion,
  TokenUnlock, TradeEntry, Transaction, WalletAddress, WatchedToken,
} from '../types';
import { defaultProfile, rulesOf } from '../lib/profile';
import { DEFAULT_ENVELOPE } from '../lib/envelope';
import { uid } from '../lib/format';
import { DEFAULT_COMPAT_MODEL, NOUS_BASE_URL } from '../ai/openai';
import { DEFAULT_MISTRAL_MODEL } from '../ai/mistral';
import { BACKUP_KEYS, DATA_VERSION } from '../lib/backup';
import { guardedStorage, migrateState, STORE_KEY, systemStorage, useStorageStatus } from './persistence';
import { saveSecrets, secretsSealed, stripSecrets } from '../lib/secure';
import { fixPaperFees } from '../lib/paper';
import { mergeDayLogs } from '../lib/lab/autoState';

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
  reports: AiReport[];
  chat: ChatMessage[];
  accounts: Account[];
  basket: BasketPlan | null;
  basketExecutions: BasketExecution[];
  /** Paliers de sortie déjà vendus : identifiant de crypto → multiples (×2, ×3…). */
  exitDone: Record<string, number[]>;
  /** Dernière tranche du cœur (Bitcoin, Ethereum) allégée en euphorie : identifiant de crypto → date ISO. */
  coreTrims: Record<string, string>;
  envelope: DefiEnvelope;
  defiBets: DefiBet[];
  /** Portefeuille papier : ordres fictifs aux prix réels (profil « expérimentations », sans risque). */
  paperTrades: PaperTrade[];
  /** Paliers de vente personnalisés par crypto (venus des anciennes thèses). */
  exitSteps: ExitSteps;
  /** Portefeuilles papier (manuels ou en autopilote), leurs ordres en attente et les journaux des autopilotes. */
  paperPortfolios: PaperPortfolio[];
  paperOrders: PaperOrder[];
  paperDays: PaperDayLog[];
  portfolioSnapshots: PortfolioSnapshot[];
  smartMoves: SmartMove[];
  pickSnapshots: PickSnapshot[];
  smartWallets: SmartWallet[];
  hotNotes: HotNote[];
  /** Attentes anti-FOMO : achats sur une crypto qui a trop monté en 7 jours, bloqués 24 h. */
  impulseWaits: ImpulseWait[];
  /** Déblocages de tokens suivis manuellement (alertes J-7 / J-1). */
  unlocks: TokenUnlock[];
  profileHistory: ProfileChange[];
  /** Cryptos que tu as confirmé voir dans l'application Crypto.com. */
  cdcSeen: string[];
  /** Suppressions à propager à l'autre appareil (`collection/identifiant` → date). */
  deletions: SyncDeletion[];
  /** Dernière modification de chaque rubrique sans identifiant (profil, watchlist, panier…), pour la fusion PC ↔ téléphone. */
  syncStamp: Record<string, string>;

  setSettings: (patch: Partial<Settings>) => void;
  setProfile: (patch: Partial<Profile>) => void;
  toggleWatch: (coinId: string) => void;
  addWatchedToken: (t: WatchedToken) => void;
  removeWatchedToken: (id: string) => void;
  addSmartWallet: (w: SmartWallet) => void;
  removeSmartWallet: (id: string) => void;
  upsertHotNote: (n: HotNote) => void;
  removeHotNote: (id: string) => void;
  upsertImpulseWait: (w: ImpulseWait) => void;
  removeImpulseWait: (id: string) => void;
  upsertUnlock: (u: TokenUnlock) => void;
  removeUnlock: (id: string) => void;
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
  addReport: (r: AiReport) => void;
  removeReport: (id: string) => void;
  addChat: (m: ChatMessage) => void;
  clearChat: () => void;
  upsertAccount: (a: Account) => void;
  removeAccount: (id: string) => void;
  setBasket: (b: BasketPlan | null) => void;
  /** Supprime le panier et ses échéances ; `purgeTransactions` retire aussi du journal les achats qu'elles avaient créés. */
  removeBasket: (opts: { purgeTransactions: boolean }) => void;
  /** Enregistre une échéance du panier et met à jour la réserve d'USDC. */
  addBasketExecution: (e: BasketExecution, txs?: Transaction[]) => void;
  removeBasketExecution: (id: string) => void;
  /** Corrige une échéance du panier (montant dépensé, quantité reçue par ligne) : ses transactions et la réserve suivent. */
  updateBasketExecution: (id: string, rows: { usd: number; quantity: number }[]) => void;
  /** Corrige une échéance d'un plan DCA avancé : sa transaction d'achat suit. */
  updateDcaExecution: (id: string, patch: { amount: number; price: number; quantity: number }) => void;
  toggleCdcSeen: (coinId: string) => void;
  toggleExitDone: (coinId: string, multiple: number) => void;
  /** Note qu'une tranche du cœur vient d'être vendue (démarre le délai avant la suivante). */
  markCoreTrim: (coinId: string) => void;
  clearCoreTrim: (coinId: string) => void;
  setEnvelope: (patch: Partial<DefiEnvelope>) => void;
  upsertPaperTrade: (t: PaperTrade) => void;
  removePaperTrade: (id: string) => void;
  upsertPaperPortfolio: (p: PaperPortfolio) => void;
  /** Supprime un portefeuille papier avec ses ordres, ses exécutions et ses journaux (suppressions propagées). */
  removePaperPortfolio: (id: string) => void;
  upsertPaperOrder: (o: PaperOrder) => void;
  removePaperOrder: (id: string) => void;
  /** Enregistre des journaux d'autopilote (seuls ceux dont le contenu change sont réécrits). */
  applyPaperDays: (days: PaperDayLog[]) => void;
  upsertPortfolioSnapshot: (s: PortfolioSnapshot) => void;
  upsertPickSnapshot: (s: PickSnapshot) => void;
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
  locale: 'auto',
  aiProvider: 'compat',
  anthropicKey: '',
  aiModel: 'claude-opus-5-5',
  aiWebSearch: true,
  aiAnonymous: false,
  compatKey: '',
  compatBaseUrl: NOUS_BASE_URL,
  compatModel: DEFAULT_COMPAT_MODEL,
  mistralKey: '',
  mistralModel: DEFAULT_MISTRAL_MODEL,
  briefingAuto: false,
  coingeckoKey: '',
  notifications: true,
  webhookUrl: '',
  closeToTray: true,
  autoStart: false,
  appLock: false,
  disclaimerAccepted: false,
  taxRatePct: 31.4,
  scanSize: 50,
  binanceApiKey: '',
  binanceApiSecret: '',
  syncEnabled: false,
  syncRepo: '',
  syncToken: '',
  syncPassphrase: '',
  syncLastAt: 0,
  deviceId: '',
};

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [item, ...list];
  const copy = [...list];
  copy[i] = item;
  return copy;
}

// ------------------------------------------------------------------ Horodatage et registre des suppressions (synchronisation)

const nowIso = (): string => new Date().toISOString();

/** Horodate un élément modifié : la fusion PC ↔ téléphone garde la version la plus récente. */
function touch<T>(item: T): T {
  return { ...item, updatedAt: nowIso() };
}

/** Note qu'une rubrique entière (profil, watchlist, panier…) vient de changer. */
function bump(s: { syncStamp: Record<string, string> }, key: string): { syncStamp: Record<string, string> } {
  return { syncStamp: { ...s.syncStamp, [key]: nowIso() } };
}

/** Enregistre une suppression pour qu'elle se propage à l'autre appareil. */
function dropped(s: { deletions: SyncDeletion[] }, key: string): { deletions: SyncDeletion[] } {
  return { deletions: [...s.deletions.filter((d) => d.key !== key), { key, at: nowIso() }] };
}

// Plafonds : les rapports IA (surtout ceux du comité) et le chat sont les plus gros consommateurs du stockage local (≈ 5 Mo).
const MAX_REPORTS = 25;
const MAX_CHAT = 60;
/** Seuls les rapports les plus récents gardent le détail de chaque analyste du comité. */
const KEEP_PARTS = 6;

/** Résumé d'une valeur de profil pour l'historique : court, lisible, jamais un objet entier. */
const short = (v: unknown): string => {
  if (v == null) return '—';
  if (typeof v === 'object') {
    try {
      const e = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== null && x !== undefined && x !== '' && !(Array.isArray(x) && !x.length));
      const shown = (e.length > 3 ? `${e.length} réglages` : e.map(([k]) => k).slice(0, 3).join(', '));
      return shown || '—';
    } catch { return '—'; }
  }
  return String(v).slice(0, 40);
};

const initialData = () => ({
  settings: { ...defaultSettings },
  profile: defaultProfile(),
  watchlist: ['bitcoin', 'ethereum', 'solana'],
  watchedTokens: [] as WatchedToken[],
  smartWallets: [] as SmartWallet[],
  hotNotes: [] as HotNote[],
  impulseWaits: [] as ImpulseWait[],
  unlocks: [] as TokenUnlock[],
  profileHistory: [] as ProfileChange[],
  transactions: [] as Transaction[],
  wallets: [] as WalletAddress[],
  dcaPlans: [] as DcaPlan[],
  dcaExecutions: [] as DcaExecution[],
  trades: [] as TradeEntry[],
  alerts: [] as PriceAlert[],
  airdrops: [] as AirdropItem[],
  reports: [] as AiReport[],
  chat: [] as ChatMessage[],
  accounts: [] as Account[],
  basket: null as BasketPlan | null,
  basketExecutions: [] as BasketExecution[],
  exitDone: {} as Record<string, number[]>,
  coreTrims: {} as Record<string, string>,
  envelope: { ...DEFAULT_ENVELOPE },
  paperTrades: [] as PaperTrade[],
  exitSteps: {} as ExitSteps,
  paperPortfolios: [{ id: 'manuel', name: 'Papier manuel', kind: 'manual', startingUsd: 1000, createdAt: new Date().toISOString(), costs: { preset: 'exchange', feePct: 0.1, spreadPct: 0.05 } }] as PaperPortfolio[],
  paperOrders: [] as PaperOrder[],
  paperDays: [] as PaperDayLog[],
  portfolioSnapshots: [] as PortfolioSnapshot[],
  smartMoves: [] as SmartMove[],
  pickSnapshots: [] as PickSnapshot[],
  defiBets: [] as DefiBet[],
  cdcSeen: [] as string[],
  deletions: [] as SyncDeletion[],
  syncStamp: {} as Record<string, string>,
});

const system = systemStorage();
if (system.memory) useStorageStatus.getState().setStatus({ kind: 'memory' });
const safeStorage = createJSONStorage(() => guardedStorage(system.backend, (st) => useStorageStatus.getState().setStatus(st)));

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialData(),
      // Les secrets (clés API, jeton, phrase de passe) ne vivent pas dans le stockage principal de l'application :
      // sur Windows ils sont chiffrés par le système et rangés à part (see lib/secure.ts).
      setSettings: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
        saveSecrets(useStore.getState().settings);
      },
      setProfile: (patch) => set((s) => {
        const changes: string[] = [];
        for (const [k, v] of Object.entries(patch)) {
          const before = (s.profile as unknown as Record<string, unknown>)[k];
          if (JSON.stringify(before) !== JSON.stringify(v)) changes.push(`${k} : ${short(before)} → ${short(v)}`);
        }
        const history = changes.length
          ? [touch({ id: uid(), at: new Date().toISOString(), summary: changes.join(' ; ').slice(0, 400) }), ...s.profileHistory].slice(0, 120)
          : s.profileHistory;
        return { profile: { ...s.profile, ...patch }, profileHistory: history, ...bump(s, 'profile') };
      }),
      toggleWatch: (coinId) => set((s) => ({ watchlist: s.watchlist.includes(coinId) ? s.watchlist.filter((x) => x !== coinId) : [...s.watchlist, coinId], ...bump(s, 'watchlist') })),
      addWatchedToken: (t) => set((s) => ({ watchedTokens: [touch(t), ...s.watchedTokens.filter((x) => x.id !== t.id)] })),
      removeWatchedToken: (id) => set((s) => ({ watchedTokens: s.watchedTokens.filter((x) => x.id !== id), ...dropped(s, `watchedTokens/${id}`) })),
      addSmartWallet: (w) => set((s) => ({ smartWallets: [touch(w), ...s.smartWallets.filter((x) => x.id !== w.id)] })),
      removeSmartWallet: (id) => set((s) => ({ smartWallets: s.smartWallets.filter((x) => x.id !== id), ...dropped(s, `smartWallets/${id}`) })),
      upsertHotNote: (n) => set((s) => ({ hotNotes: upsert(s.hotNotes, touch(n)) })),
      removeHotNote: (id) => set((s) => ({ hotNotes: s.hotNotes.filter((x) => x.id !== id), ...dropped(s, `hotNotes/${id}`) })),
      upsertImpulseWait: (w) => set((s) => ({ impulseWaits: upsert(s.impulseWaits, touch(w)) })),
      removeImpulseWait: (id) => set((s) => ({ impulseWaits: s.impulseWaits.filter((x) => x.id !== id), ...dropped(s, `impulseWaits/${id}`) })),
      upsertUnlock: (u) => set((s) => ({ unlocks: upsert(s.unlocks, touch(u)) })),
      removeUnlock: (id) => set((s) => ({ unlocks: s.unlocks.filter((x) => x.id !== id), ...dropped(s, `unlocks/${id}`) })),
      upsertTransaction: (tx) => set((s) => ({ transactions: upsert(s.transactions, touch(tx)) })),
      removeTransaction: (id) => set((s) => ({ transactions: s.transactions.filter((x) => x.id !== id), ...dropped(s, `transactions/${id}`) })),
      addTransactions: (txs) => set((s) => ({ transactions: [...txs.map(touch), ...s.transactions] })),
      upsertWallet: (w) => set((s) => ({ wallets: upsert(s.wallets, touch(w)) })),
      removeWallet: (id) => set((s) => ({
        wallets: s.wallets.filter((x) => x.id !== id),
        accounts: s.accounts.map((a) => (a.walletIds.includes(id) ? touch({ ...a, walletIds: a.walletIds.filter((w) => w !== id) }) : a)),
        ...dropped(s, `wallets/${id}`),
      })),
      upsertDcaPlan: (p) => set((s) => ({ dcaPlans: upsert(s.dcaPlans, touch(p)) })),
      removeDcaPlan: (id) => set((s) => {
        let deletions = [...s.deletions.filter((d) => d.key !== `dcaPlans/${id}`), { key: `dcaPlans/${id}`, at: nowIso() }];
        for (const e of s.dcaExecutions.filter((x) => x.planId === id)) deletions = [...deletions.filter((d) => d.key !== `dcaExecutions/${e.id}`), { key: `dcaExecutions/${e.id}`, at: nowIso() }];
        return { dcaPlans: s.dcaPlans.filter((x) => x.id !== id), dcaExecutions: s.dcaExecutions.filter((e) => e.planId !== id), deletions };
      }),
      addDcaExecution: (e, txs) => set((s) => ({
        dcaExecutions: [txs?.length ? { ...touch(e), txIds: txs.map((t) => t.id) } : touch(e), ...s.dcaExecutions],
        transactions: txs?.length ? [...txs.map(touch), ...s.transactions] : s.transactions,
      })),
      removeDcaExecution: (id) => set((s) => {
        // Ses transactions disparaissent avec elle : les suppressions de l'une et des autres partent ensemble.
        const gone = new Set(s.dcaExecutions.find((x) => x.id === id)?.txIds ?? []);
        let deletions = s.deletions;
        for (const tid of gone) deletions = [...deletions.filter((d) => d.key !== `transactions/${tid}`), { key: `transactions/${tid}`, at: nowIso() }];
        deletions = [...deletions.filter((d) => d.key !== `dcaExecutions/${id}`), { key: `dcaExecutions/${id}`, at: nowIso() }];
        return {
          dcaExecutions: s.dcaExecutions.filter((x) => x.id !== id),
          transactions: gone.size ? s.transactions.filter((t) => !gone.has(t.id)) : s.transactions,
          deletions,
        };
      }),
      upsertTrade: (t) => set((s) => ({ trades: upsert(s.trades, touch(t)) })),
      removeTrade: (id) => set((s) => ({ trades: s.trades.filter((x) => x.id !== id), ...dropped(s, `trades/${id}`) })),
      upsertAlert: (a) => set((s) => ({ alerts: upsert(s.alerts, touch(a)) })),
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((x) => x.id !== id), ...dropped(s, `alerts/${id}`) })),
      upsertAirdrop: (a) => set((s) => ({ airdrops: upsert(s.airdrops, touch(a)) })),
      removeAirdrop: (id) => set((s) => ({ airdrops: s.airdrops.filter((x) => x.id !== id), ...dropped(s, `airdrops/${id}`) })),
      addReport: (r) => set((s) => ({
        reports: [r, ...s.reports.filter((x) => x.id !== r.id)].slice(0, MAX_REPORTS).map((x, i) => (i >= KEEP_PARTS && x.parts ? { ...x, parts: undefined } : x)),
      })),
      removeReport: (id) => set((s) => ({ reports: s.reports.filter((x) => x.id !== id) })),
      addChat: (m) => set((s) => ({ chat: [...s.chat, m].slice(-MAX_CHAT) })),
      clearChat: () => set({ chat: [] }),
      upsertAccount: (a) => set((s) => ({ accounts: upsert(s.accounts, touch(a)) })),
      removeAccount: (id) => set((s) => ({
        accounts: s.accounts.filter((x) => x.id !== id),
        // Les opérations de ce compte redeviennent « sans compte » au lieu de disparaître.
        transactions: s.transactions.map((t) => (t.accountId === id || t.toAccountId === id
          ? touch({ ...t, accountId: t.accountId === id ? undefined : t.accountId, toAccountId: t.toAccountId === id ? undefined : t.toAccountId })
          : t)),
        ...dropped(s, `accounts/${id}`),
      })),
      setBasket: (b) => set((s) => ({ basket: b, ...bump(s, 'basket') })),
      removeBasket: ({ purgeTransactions }) => set((s) => {
        if (!s.basket) return {};
        const id = s.basket.id;
        const execs = s.basketExecutions.filter((e) => e.basketId === id);
        const gone = new Set(purgeTransactions ? execs.flatMap((e) => e.txIds ?? []) : []);
        let deletions = s.deletions;
        const drop = (key: string) => { deletions = [...deletions.filter((d) => d.key !== key), { key, at: nowIso() }]; };
        for (const e of execs) drop(`basketExecutions/${e.id}`);
        for (const tid of gone) drop(`transactions/${tid}`);
        return {
          basket: null,
          basketExecutions: s.basketExecutions.filter((e) => e.basketId !== id),
          transactions: gone.size ? s.transactions.filter((t) => !gone.has(t.id)) : s.transactions,
          deletions,
          ...bump(s, 'basket'),
        };
      }),
      addBasketExecution: (e, txs) => set((s) => ({
        // La réserve d'USDC vit dans le panier : l'écrire avec l'échéance la date aussi.
        basketExecutions: [txs?.length ? { ...touch(e), txIds: txs.map((t) => t.id) } : touch(e), ...s.basketExecutions.filter((x) => x.id !== e.id)],
        transactions: txs?.length ? [...txs.map(touch), ...s.transactions] : s.transactions,
        basket: s.basket && s.basket.id === e.basketId ? { ...touch(s.basket), reserveUsd: Math.max(0, Math.round((s.basket.reserveUsd + e.reserveDeltaUsd) * 100) / 100) } : s.basket,
        ...bump(s, 'basket'),
      })),
      removeBasketExecution: (id) => set((s) => {
        const e = s.basketExecutions.find((x) => x.id === id);
        const gone = new Set(e?.txIds ?? []);
        let deletions = s.deletions;
        for (const tid of gone) deletions = [...deletions.filter((d) => d.key !== `transactions/${tid}`), { key: `transactions/${tid}`, at: nowIso() }];
        deletions = [...deletions.filter((d) => d.key !== `basketExecutions/${id}`), { key: `basketExecutions/${id}`, at: nowIso() }];
        return {
          basketExecutions: s.basketExecutions.filter((x) => x.id !== id),
          transactions: gone.size ? s.transactions.filter((t) => !gone.has(t.id)) : s.transactions,
          basket: e && s.basket && s.basket.id === e.basketId ? { ...touch(s.basket), reserveUsd: Math.max(0, Math.round((s.basket.reserveUsd - e.reserveDeltaUsd) * 100) / 100) } : s.basket,
          deletions,
          ...bump(s, 'basket'),
        };
      }),
      updateBasketExecution: (id, rows) => set((s) => {
        const e = s.basketExecutions.find((x) => x.id === id);
        if (!e || e.skipped || rows.length !== e.orders.length) return {};
        const r2 = (x: number) => Math.round(x * 100) / 100;
        const orders = e.orders.map((o, i) => ({ ...o, usd: rows[i].usd, quantity: rows[i].quantity, price: rows[i].quantity > 0 ? rows[i].usd / rows[i].quantity : o.price }));
        const invested = r2(orders.reduce((sum, o) => sum + o.usd, 0));
        // La réserve absorbe l'écart : ce qui n'a pas été dépensé y retourne, ce qui a été dépensé en plus en sort.
        const reserveDeltaUsd = r2(e.reserveDeltaUsd + (e.investedUsd - invested));
        // Les transactions de l'échéance vont par paires, dans l'ordre des lignes : l'achat, puis la sortie d'USDC.
        const ids = e.txIds ?? [];
        const patch = new Map<string, Partial<Transaction>>();
        orders.forEach((o, i) => {
          const buy = s.transactions.find((t) => t.id === ids[2 * i] && t.type === 'buy' && t.coinId === o.coinId)
            ?? s.transactions.find((t) => ids.includes(t.id) && t.type === 'buy' && t.coinId === o.coinId);
          const usdc = s.transactions.find((t) => t.id === ids[2 * i + 1] && t.type === 'sell');
          if (buy) patch.set(buy.id, { quantity: o.quantity, price: o.quantity > 0 ? o.usd / o.quantity : buy.price });
          if (usdc) patch.set(usdc.id, { quantity: o.usd });
        });
        return {
          basketExecutions: s.basketExecutions.map((x) => (x.id === id ? touch({ ...x, orders, investedUsd: invested, reserveDeltaUsd }) : x)),
          transactions: patch.size ? s.transactions.map((t) => (patch.has(t.id) ? touch({ ...t, ...patch.get(t.id) }) : t)) : s.transactions,
          basket: s.basket && s.basket.id === e.basketId ? { ...touch(s.basket), reserveUsd: Math.max(0, r2(s.basket.reserveUsd + (reserveDeltaUsd - e.reserveDeltaUsd))) } : s.basket,
          ...bump(s, 'basket'),
        };
      }),
      updateDcaExecution: (id, p) => set((s) => {
        const e = s.dcaExecutions.find((x) => x.id === id);
        if (!e || e.skipped) return {};
        const buyId = (e.txIds ?? [])[0];
        return {
          dcaExecutions: s.dcaExecutions.map((x) => (x.id === id ? touch({ ...x, amount: p.amount, price: p.price, quantity: p.quantity }) : x)),
          transactions: buyId ? s.transactions.map((t) => (t.id === buyId ? touch({ ...t, quantity: p.quantity, price: p.price }) : t)) : s.transactions,
        };
      }),
      setEnvelope: (patch) => set((s) => ({ envelope: { ...s.envelope, ...patch }, ...bump(s, 'envelope') })),
      upsertPaperTrade: (t) => set((s) => ({ paperTrades: upsert(s.paperTrades, touch(t)) })),
      removePaperTrade: (id) => set((s) => ({ paperTrades: s.paperTrades.filter((x) => x.id !== id), ...dropped(s, `paperTrades/${id}`) })),
      upsertPaperPortfolio: (p) => set((s) => ({ paperPortfolios: upsert(s.paperPortfolios, touch(p)) })),
      removePaperPortfolio: (id) => set((s) => {
        const orders = s.paperOrders.filter((o) => o.portfolioId === id);
        const trades = s.paperTrades.filter((t) => t.portfolioId === id);
        const days = s.paperDays.filter((d) => d.portfolioId === id);
        let deletions = dropped(s, `paperPortfolios/${id}`).deletions;
        for (const key of [...orders.map((o) => `paperOrders/${o.id}`), ...trades.map((t) => `paperTrades/${t.id}`), ...days.map((d) => `paperDays/${d.id}`)]) deletions = dropped({ deletions }, key).deletions;
        return {
          paperPortfolios: s.paperPortfolios.filter((p) => p.id !== id),
          paperOrders: s.paperOrders.filter((o) => o.portfolioId !== id),
          paperTrades: s.paperTrades.filter((t) => t.portfolioId !== id),
          paperDays: s.paperDays.filter((d) => d.portfolioId !== id),
          deletions,
        };
      }),
      upsertPortfolioSnapshot: (x) => set((s) => ({ portfolioSnapshots: upsert(s.portfolioSnapshots, touch(x)) })),
      upsertPickSnapshot: (x) => set((s) => ({ pickSnapshots: upsert(s.pickSnapshots, touch(x)) })),
      upsertPaperOrder: (o) => set((s) => ({ paperOrders: upsert(s.paperOrders, touch(o)) })),
      removePaperOrder: (id) => set((s) => ({ paperOrders: s.paperOrders.filter((x) => x.id !== id), ...dropped(s, `paperOrders/${id}`) })),
      applyPaperDays: (days) => set((s) => {
        // Seuls les journaux dont le contenu change sont réécrits (deux appareils calculent le même jour à l'identique).
        const { changed } = mergeDayLogs(s.paperDays, days);
        if (!changed.length) return {};
        let list = s.paperDays;
        for (const d of changed) list = upsert(list, touch(d));
        return { paperDays: list };
      }),
      upsertDefiBet: (b) => set((s) => ({ defiBets: upsert(s.defiBets, touch(b)) })),
      removeDefiBet: (id) => set((s) => ({ defiBets: s.defiBets.filter((x) => x.id !== id), ...dropped(s, `defiBets/${id}`) })),
      toggleExitDone: (coinId, multiple) => set((s) => {
        const cur = s.exitDone[coinId] ?? [];
        return { exitDone: { ...s.exitDone, [coinId]: cur.includes(multiple) ? cur.filter((m) => m !== multiple) : [...cur, multiple] }, ...bump(s, 'exitDone') };
      }),
      markCoreTrim: (coinId) => set((s) => ({ coreTrims: { ...s.coreTrims, [coinId]: nowIso() }, ...bump(s, 'coreTrims') })),
      clearCoreTrim: (coinId) => set((s) => { const next = { ...s.coreTrims }; delete next[coinId]; return { coreTrims: next, ...bump(s, 'coreTrims') }; }),
      toggleCdcSeen: (coinId) => set((s) => ({ cdcSeen: s.cdcSeen.includes(coinId) ? s.cdcSeen.filter((x) => x !== coinId) : [...s.cdcSeen, coinId], ...bump(s, 'cdcSeen') })),
      // Une seule écriture : les saisies remplacées sortent et les lignes importées (plus d'éventuels soldes d'ouverture) entrent ensemble.
      importTransactions: (txs, opts) => {
        const replace = new Set(opts?.replaceIds ?? []);
        const known = new Set(get().transactions.filter((t) => !replace.has(t.id)).map((t) => t.id));
        const fresh = txs.filter((t, i) => !known.has(t.id) && txs.findIndex((u) => u.id === t.id) === i);
        const extra = (opts?.extra ?? []).filter((t, i, all) => !known.has(t.id) && all.findIndex((u) => u.id === t.id) === i);
        const removed = get().transactions.filter((t) => replace.has(t.id)).length;
        if (fresh.length || extra.length || removed) set((s) => {
          let deletions = s.deletions;
          // Les saisies remplacées sont supprimées : la suppression se propage à l'autre appareil.
          for (const id of replace) deletions = [...deletions.filter((d) => d.key !== `transactions/${id}`), { key: `transactions/${id}`, at: nowIso() }];
          return { transactions: [...fresh, ...extra, ...s.transactions.filter((t) => !replace.has(t.id))].map(touch), deletions };
        });
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
      partialize: (s) => Object.fromEntries(BACKUP_KEYS.map((k) => [k, k === 'settings' && secretsSealed() ? stripSecrets(s.settings) : s[k]])) as Partial<AppState>,
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
          // Correctif 1.23.0 : les anciens ordres papier payaient 10 % de frais au lieu de 0,1 %.
          paperTrades: fixPaperFees(p.paperTrades ?? current.paperTrades, nowIso()).trades,
        };
      },
    },
  ),
);

/**
 * Contenu d'un fichier de sauvegarde. Jamais les clés API (Claude, Nous Portal, CoinGecko) ni les secrets de
 * synchronisation (jeton GitHub, phrase de passe) : le fichier contient en revanche tout l'historique, les
 * adresses suivies et les clés publiques étendues (xpub) : à ranger comme un document financier.
 */
export function exportBackup(includeKeys = false): string {
  const s = useStore.getState();
  const data: Record<string, unknown> = { app: 'boussole-crypto', version: DATA_VERSION, exportedAt: new Date().toISOString() };
  for (const k of BACKUP_KEYS) data[k] = s[k];
  if (!includeKeys) data.settings = { ...s.settings, anthropicKey: '', compatKey: '', mistralKey: '', coingeckoKey: '', binanceApiKey: '', binanceApiSecret: '' };
  data.settings = { ...(data.settings as Settings), syncToken: '', syncPassphrase: '' };
  return JSON.stringify(data, null, 2);
}

export const newId = uid;
