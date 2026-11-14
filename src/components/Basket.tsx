// Panier DCA : plan (jours, budget en USDC, cœur et liste « découverte »), ordre du jour, validation et historique.

import { Check, Pencil, Plus, Shield, SkipForward, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { newId, useStore } from '../store/useStore';
import { useBasket } from '../hooks/useBasket';
import { usePortfolio } from '../hooks/usePortfolio';
import { useFearGreed, useFx } from '../hooks/useMarket';
import { DAY_LABEL, MAX_DISCOVERY, type PlannedOrder } from '../lib/basket';
import { fmtDate, fmtMoney, fmtNum, fmtQty, isoDay } from '../lib/format';
import type { BasketCoin, BasketExecution, BasketOrderLog, BasketPlan, CoinRef, Transaction } from '../types';
import { CoinPicker } from './CoinPicker';
import { CdcBadge } from './CdcBadge';
import { useCryptoCom } from '../hooks/useCryptoCom';
import { Markdown } from './Markdown';
import { useAiConfig } from './AiBlocks';
import { runBasketOptimize, runBasketReview } from '../ai/tasks';
import { applyDcaAiAdvice, dcaAiPayload, parseDcaAiReply, type AppliedAdvice, type DcaAiAdvice, type PoolCoin } from '../lib/dcaAi';
import { Badge, Banner, Button, Card, CoinIcon, Empty, ErrorNote, Field, Input, Modal, NumberInput, Segmented, Select, Spinner, Toggle } from './ui';
import { AUTO_BASE_TOP, AUTO_MAX_LINES } from '../lib/autoBasket';

const SHORT = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const BTC: CoinRef = { coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin' };
const ETH: CoinRef = { coinId: 'ethereum', symbol: 'eth', name: 'Ethereum' };

function defaultBasket(held: { coinId?: string; symbol: string; name: string; image?: string; bucket: string }[]): BasketPlan {
  const discovery = held
    .filter((h) => h.coinId && (h.bucket === 'mid' || h.bucket === 'small' || h.bucket === 'large'))
    .slice(0, MAX_DISCOVERY)
    .map((h) => ({ coinId: h.coinId as string, symbol: h.symbol.toLowerCase(), name: h.name, image: h.image }));
  return {
    id: newId(), name: 'Mon panier DCA', active: true, amountUsd: 25, daysOfWeek: [2, 5], startDate: isoDay(), discoveryMaxPct: 50,
    mode: 'auto', basePct: 70, maxBaseLines: AUTO_MAX_LINES, maxDiscoveryLines: AUTO_MAX_LINES, discoverySource: 'both',
    core: [{ ...BTC, weight: 70 }, { ...ETH, weight: 30 }], discovery, reserveUsd: 0, minOrderUsd: 5, reminder: true, createdAt: new Date().toISOString(),
  };
}

export function BasketEditor({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: BasketPlan | null }) {
  const setBasket = useStore((s) => s.setBasket);
  const [askDelete, setAskDelete] = useState(false);
  const accounts = useStore((s) => s.accounts);
  const pf = usePortfolio();
  const [d, setD] = useState<BasketPlan>(() => initial ?? defaultBasket([]));
  useEffect(() => {
    // Pré-remplissage une seule fois, à l'ouverture : la liste « découverte » reprend tes lignes actuelles hors cœur.
    if (open) setD(initial ?? defaultBasket(pf.holdings));
  }, [open, initial]);

  const set = (p: Partial<BasketPlan>) => setD((cur) => ({ ...cur, ...p }));
  const auto = d.mode === 'auto';
  const basePct = Math.max(0, Math.min(100, d.basePct ?? 70));
  const valid = d.name.trim() && d.amountUsd > 0 && d.daysOfWeek.length > 0 && (auto || d.core.some((c) => c.weight > 0));
  const addCore = (c: CoinRef) => { if (!d.core.some((x) => x.coinId === c.coinId)) set({ core: [...d.core, { ...c, weight: 10 }] }); };
  const addDisc = (c: CoinRef) => { if (d.discovery.length < MAX_DISCOVERY && !d.discovery.some((x) => x.coinId === c.coinId)) set({ discovery: [...d.discovery, c] }); };

  return (
    <>
    <Modal open={open && !askDelete} onClose={onClose} wide title={initial ? 'Modifier mon panier' : 'Créer mon panier DCA'}
      footer={<>
        {initial && <Button variant="danger" className="mr-auto" icon={<Trash2 className="size-4" />} onClick={() => setAskDelete(true)}>Supprimer ce DCA</Button>}
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" disabled={!valid} onClick={() => { setBasket({ ...d, name: d.name.trim(), basePct }); onClose(); }}>Enregistrer</Button>
      </>}>
      <div className="space-y-4">
        <div>
          <Segmented
            value={auto ? 'auto' : 'custom'}
            onChange={(v) => set({ mode: v })}
            options={[{ value: 'auto', label: 'Automatique' }, { value: 'custom', label: 'Personnalisé' }]}
          />
          <p className="mt-1.5 text-xs text-muted">
            {auto
              ? `Tu règles le montant, les jours et la part base / découverte. Boussole te dit exactement quoi acheter : jusqu’à ${AUTO_MAX_LINES} cryptos du top ${AUTO_BASE_TOP} (hors stablecoins) pour la base, jusqu’à ${AUTO_MAX_LINES} découvertes.`
              : 'Tu composes toi-même le cœur (poids relatifs) et la liste découverte.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Nom" className="col-span-2"><Input value={d.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Montant par échéance (USDC)" className="col-span-2 sm:col-span-1"><NumberInput value={d.amountUsd} onChange={(v) => set({ amountUsd: v === '' ? 0 : v })} /></Field>
          {!auto && <Field label="Minimum par ordre (USDC)"><NumberInput value={d.minOrderUsd} onChange={(v) => set({ minOrderUsd: v === '' ? 0 : v })} /></Field>}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-ink-2">Jours d’achat</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button key={n} type="button" onClick={() => set({ daysOfWeek: d.daysOfWeek.includes(n) ? d.daysOfWeek.filter((x) => x !== n) : [...d.daysOfWeek, n].sort() })}
                className={`rounded-lg border px-3 py-1.5 text-sm ${d.daysOfWeek.includes(n) ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-2'}`}>{SHORT[n]}</button>
            ))}
          </div>
        </div>
        {auto && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Base (%) — top ${AUTO_BASE_TOP} hors stablecoins`}><NumberInput value={basePct} onChange={(v) => set({ basePct: v === '' ? 0 : Math.min(100, Math.max(0, v)) })} /></Field>
              <Field label="Découverte (%) — pépites ou autres"><NumberInput value={100 - basePct} onChange={(v) => set({ basePct: 100 - (v === '' ? 0 : Math.min(100, Math.max(0, v))) })} /></Field>
            </div>
            <p className="-mt-2 text-xs text-muted">Sur {fmtNum(d.amountUsd, 2)} USDC : {fmtNum((d.amountUsd * basePct) / 100, 2)} pour la base, {fmtNum((d.amountUsd * (100 - basePct)) / 100, 2)} pour la découverte, avant la modulation par la température du marché.</p>
            <details className="rounded-lg border border-line p-3">
              <summary className="cursor-pointer text-sm text-ink-2">Options</summary>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Cryptos de base (max)"><Select value={d.maxBaseLines ?? AUTO_MAX_LINES} onChange={(e) => set({ maxBaseLines: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
                <Field label="Découvertes (max)"><Select value={d.maxDiscoveryLines ?? AUTO_MAX_LINES} onChange={(e) => set({ maxDiscoveryLines: Number(e.target.value) })}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
                <Field label="Découvertes parmi">
                  <Select value={d.discoverySource ?? 'both'} onChange={(e) => set({ discoverySource: e.target.value as BasketPlan['discoverySource'] })}>
                    <option value="both">Pépites et milieu de classement</option>
                    <option value="gems">Pépites (petites capis)</option>
                    <option value="mid">Milieu de classement (rangs 21-250)</option>
                  </Select>
                </Field>
                <Field label="Minimum par ordre (USDC)"><NumberInput value={d.minOrderUsd} onChange={(v) => set({ minOrderUsd: v === '' ? 0 : v })} /></Field>
                <Field label="Réserve d’USDC" hint="Alimentée quand le marché est chaud, puisée quand il a peur."><NumberInput value={d.reserveUsd} onChange={(v) => set({ reserveUsd: v === '' ? 0 : v })} /></Field>
              </div>
            </details>
            <Toggle checked={!!d.aiOptimize} onChange={(v) => set({ aiOptimize: v })} label="Optimiser l’ordre avec l’IA à chaque échéance" hint="L’IA relit l’ordre des règles avec l’actualité et peut remplacer une ligne par une autre candidate autorisée, sans jamais changer les montants. Une analyse par échéance (quelques centimes au plus)." />
          </>
        )}
        {!auto && (
        <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Part « découverte » maximale (%)" hint="Elle baisse toute seule quand tes altcoins approchent de ta cible."><NumberInput value={d.discoveryMaxPct} onChange={(v) => set({ discoveryMaxPct: v === '' ? 0 : Math.min(100, v) })} /></Field>
          <Field label="Réserve d’USDC" hint="Alimentée quand le marché est chaud, puisée quand il a peur."><NumberInput value={d.reserveUsd} onChange={(v) => set({ reserveUsd: v === '' ? 0 : v })} /></Field>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-ink-2">Cœur du panier (poids relatifs)</p>
          <ul className="space-y-2">
            {d.core.map((c: BasketCoin) => (
              <li key={c.coinId} className="flex items-center gap-3">
                <CoinIcon src={c.image} symbol={c.symbol} size={22} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name} <span className="text-muted">{c.symbol.toUpperCase()}</span></span>
                <div className="w-24"><NumberInput value={c.weight} onChange={(v) => set({ core: d.core.map((x) => (x.coinId === c.coinId ? { ...x, weight: v === '' ? 0 : v } : x)) })} /></div>
                <Button size="sm" variant="ghost" aria-label="Retirer" icon={<X className="size-3.5" />} onClick={() => set({ core: d.core.filter((x) => x.coinId !== c.coinId) })} />
              </li>
            ))}
          </ul>
          <div className="mt-2"><CoinPicker value={null} onChange={addCore} placeholder="Ajouter une crypto au cœur…" /></div>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-ink-2">Découverte : qui choisit la crypto ?</p>
          <Segmented
            value={d.discoveryMode === 'auto' ? 'auto' : 'manual'}
            onChange={(v) => set({ discoveryMode: v })}
            options={[{ value: 'manual', label: 'Moi (ma liste)' }, { value: 'auto', label: 'Boussole (automatique)' }]}
          />
          <p className="mt-1.5 text-xs text-muted">
            {d.discoveryMode === 'auto'
              ? 'Rien à choisir : à chaque échéance, Boussole pioche parmi les pépites du scan (celles de « Petites capis »), tes règles filtrent, et une seule est achetée. Tu ne règles que la part, ci-dessus.'
              : 'Ta liste à toi : une seule est achetée par échéance, la mieux placée selon tes règles.'}
          </p>
        </div>
        {d.discoveryMode !== 'auto' && (
        <div>
          <p className="mb-1 text-xs font-medium text-ink-2">Liste « découverte » ({d.discovery.length}/{MAX_DISCOVERY}) : une seule est achetée par échéance</p>
          <div className="flex flex-wrap gap-2">
            {d.discovery.map((c) => (
              <span key={c.coinId} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 py-1 pl-2 pr-1 text-sm text-ink">
                <CoinIcon src={c.image} symbol={c.symbol} size={16} />{c.symbol.toUpperCase()}
                <button type="button" aria-label={`Retirer ${c.name}`} className="rounded p-0.5 text-muted hover:text-ink" onClick={() => set({ discovery: d.discovery.filter((x) => x.coinId !== c.coinId) })}><X className="size-3.5" /></button>
              </span>
            ))}
          </div>
          {d.discovery.length < MAX_DISCOVERY && <div className="mt-2"><CoinPicker value={null} onChange={addDisc} placeholder="Ajouter une crypto à étudier…" /></div>}
        </div>
        )}
        </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.length > 0 && (
            <Field label="Compte où tu passes les ordres">
              <Select value={d.accountId ?? ''} onChange={(e) => set({ accountId: e.target.value || undefined })}>
                <option value="">Aucun compte précis</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          )}
          <Toggle checked={d.reminder} onChange={(v) => set({ reminder: v })} label="Rappel le jour d’achat" hint="Notification à 9 h (Android)." />
        </div>
      </div>
    </Modal>
    {initial && <DeleteBasketModal open={askDelete} basket={initial} onClose={() => setAskDelete(false)} onDeleted={() => { setAskDelete(false); onClose(); }} />}
    </>
  );
}

/** Supprimer le DCA : ses échéances partent avec lui ; les achats du journal restent (ils ont eu lieu), sauf si tu demandes leur retrait. */
function DeleteBasketModal({ open, basket, onClose, onDeleted }: { open: boolean; basket: BasketPlan; onClose: () => void; onDeleted: () => void }) {
  const removeBasket = useStore((s) => s.removeBasket);
  const execs = useStore((s) => s.basketExecutions);
  const [purge, setPurge] = useState(false);
  const mine = execs.filter((e) => e.basketId === basket.id);
  const txCount = mine.reduce((n, e) => n + (e.txIds?.length ?? 0), 0);
  const plural = mine.length > 1 ? 's' : '';
  return (
    <Modal open={open} onClose={onClose} title={`Supprimer « ${basket.name} » ?`}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="danger" onClick={() => { removeBasket({ purgeTransactions: purge }); onDeleted(); }}>Supprimer</Button></>}>
      <div className="space-y-3 text-sm text-ink-2">
        <p>Le DCA s’arrête : plus d’ordre du jour ni de rappel. {mine.length > 0 ? `Ses ${mine.length} échéance${plural} enregistrée${plural} ser${mine.length > 1 ? 'ont' : 'a'} supprimée${plural} avec lui.` : 'Aucune échéance n’a encore été enregistrée.'}</p>
        {txCount > 0 && <Toggle checked={purge} onChange={setPurge} label={`Retirer aussi les ${txCount} opérations du journal`} hint="À ne cocher que si ces achats n’ont pas vraiment eu lieu : sinon ton portefeuille et ton prix de revient seraient faux." />}
        <p className="text-xs text-muted">La suppression se propage à tes autres appareils synchronisés.</p>
      </div>
    </Modal>
  );
}

const USDC: CoinRef = { coinId: 'usd-coin', symbol: 'usdc', name: 'USDC' };
const n2 = (x: number) => fmtNum(Math.round(x * 100) / 100, 2);

/** Confirmation des ordres réellement passés : la quantité reçue vient de ta plateforme, pas d'une estimation. */
function ExecuteModal({ open, onClose, b, custom }: { open: boolean; onClose: () => void; b: ReturnType<typeof useBasket>; custom: PlannedOrder[] | null }) {
  const addExec = useStore((s) => s.addBasketExecution);
  const fx = useFx();
  const [orders, setOrders] = useState<PlannedOrder[]>([]);
  const [rows, setRows] = useState<{ usd: number | ''; qty: number | '' }[]>([]);
  useEffect(() => {
    if (!open) return;
    // Photo des ordres à l'ouverture : un rafraîchissement des cours ne doit pas écraser ce que tu saisis.
    const list = custom ?? b.plan?.orders ?? [];
    setOrders(list);
    setRows(list.map((o) => {
      const p = b.priceOf(o.coinId);
      return { usd: o.usd, qty: p ? Math.round((o.usd / p) * 1e6) / 1e6 : '' };
    }));
  }, [open]);

  const invested = rows.reduce((s, r) => s + (r.usd === '' ? 0 : r.usd), 0);
  const valid = rows.length === 0 || rows.every((r) => r.usd !== '' && r.usd > 0 && r.qty !== '' && r.qty > 0);

  function confirm() {
    if (!b.basket || !b.periodKey || !valid) return;
    const bk = b.basket;
    const now = new Date();
    const logs: BasketOrderLog[] = [];
    const txs: Transaction[] = [];
    orders.forEach((o, i) => {
      const usd = Number(rows[i].usd);
      const qty = Number(rows[i].qty);
      const note = `Panier DCA · ${bk.name}`;
      const common = { date: isoDay(now), time: now.toISOString(), currency: 'USD' as const, fee: 0, fxEurPerUsd: fx, source: 'dca' as const, note, accountId: bk.accountId };
      txs.push({ id: newId(), coinId: o.coinId, symbol: o.symbol, name: o.name, image: o.image, type: 'buy', quantity: qty, price: usd / qty, fromFiat: false, ...common } satisfies Transaction);
      txs.push({ id: newId(), ...USDC, type: 'sell', quantity: usd, price: 1, toFiat: false, ...common } satisfies Transaction);
      logs.push({ coinId: o.coinId, symbol: o.symbol, name: o.name, image: o.image, usd, quantity: qty, price: usd / qty, kind: o.kind });
    });
    const exec: BasketExecution = { id: newId(), basketId: bk.id, periodKey: b.periodKey, date: isoDay(now), orders: logs, investedUsd: invested, reserveDeltaUsd: Math.round((bk.amountUsd - invested) * 100) / 100 };
    // Une seule écriture : l'échéance, ses achats, ses sorties d'USDC et la réserve. Annuler l'échéance retire aussi ces transactions.
    addExec(exec, txs);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={orders.length ? 'Confirmer les ordres passés' : 'Mettre le montant en réserve'}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!valid} onClick={confirm}>{orders.length ? 'Enregistrer' : 'Valider'}</Button></>}>
      <div className="space-y-3">
        {orders.length === 0 && <p className="text-sm text-ink-2">Aucun ordre aujourd’hui : les {n2(b.basket?.amountUsd ?? 0)} USDC restent en réserve.</p>}
        {orders.map((o, i) => (
          <div key={o.coinId} className="rounded-lg border border-line p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"><CoinIcon src={o.image} symbol={o.symbol} size={20} />{o.name} <span className="text-muted">{o.symbol.toUpperCase()}</span></p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Montant dépensé (USDC)"><NumberInput value={rows[i]?.usd ?? ''} onChange={(v) => setRows(rows.map((r, j) => (j === i ? { ...r, usd: v } : r)))} /></Field>
              <Field label={`Quantité reçue (${o.symbol.toUpperCase()})`} hint="Lis-la dans la confirmation de l’application."><NumberInput value={rows[i]?.qty ?? ''} onChange={(v) => setRows(rows.map((r, j) => (j === i ? { ...r, qty: v } : r)))} /></Field>
            </div>
            {rows[i] && rows[i].usd !== '' && rows[i].qty !== '' && Number(rows[i].qty) > 0 && <p className="mt-1 text-xs text-muted">Prix payé : {fmtMoney(Number(rows[i].usd) / Number(rows[i].qty), 'USD', 4)} · cours du marché : {b.priceOf(o.coinId) != null ? fmtMoney(b.priceOf(o.coinId), 'USD', 4) : '—'}</p>}
          </div>
        ))}
        {b.basket && <p className="text-xs text-muted">Investi : {n2(invested)} USDC · réserve {invested <= b.basket.amountUsd ? '+' : ''}{n2(b.basket.amountUsd - invested)} USDC. Les achats et la sortie d’USDC sont ajoutés à ton journal.</p>}
      </div>
    </Modal>
  );
}

function dayList(b: BasketPlan): string {
  return b.daysOfWeek.map((n) => DAY_LABEL[n]).join(' et ');
}

export function BasketSection() {
  const b = useBasket();
  const history = useStore((s) => s.basketExecutions);
  const addExec = useStore((s) => s.addBasketExecution);
  const removeExec = useStore((s) => s.removeBasketExecution);
  const [editExec, setEditExec] = useState<BasketExecution | null>(null);
  const cdc = useCryptoCom(b.markets);
  const [editor, setEditor] = useState(false);
  const [exec, setExec] = useState(false);
  const [allHistory, setAllHistory] = useState(false);
  const [custom, setCustom] = useState<PlannedOrder[] | null>(null);
  const fng = useFearGreed(2);
  const cfg = useAiConfig();
  const opt = useDcaOptimizer(b, cfg, fng.data?.[fng.data.length - 1]?.value ?? null);
  const [review, setReview] = useState<{ text: string; cost: string } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const bk = b.basket;

  async function askReview() {
    if (!cfg || !b.plan || !b.ctx) return;
    const { plan, ctx } = b;
    setReviewBusy(true);
    try {
      const r = await runBasketReview(cfg, {
        ordre: { ordres: plan.orders.map((o) => ({ jeton: o.symbol.toUpperCase(), type: o.kind === 'core' ? 'cœur' : 'découverte', usdc: o.usd, raison: o.reason })), reserve_variation_usdc: plan.reserveDeltaUsd, notes: plan.notes, avertissements: plan.warnings, ecartees: plan.excluded },
        marche: { temperature: ctx.temperature, part_altcoins_pct: Math.round(ctx.altCurrentPct * 10) / 10, cible_altcoins_pct: Math.round(ctx.altTargetPct * 10) / 10 },
        regles: ctx.rules,
      }, plan.orders.flatMap((o) => [o.name, o.symbol]));
      setReview({ text: r.text, cost: r.usage.costKnown !== false ? `≈ ${r.usage.costUsd.toFixed(4)} $` : '' });
    } catch (e) {
      setReview({ text: e instanceof Error ? e.message : 'Relecture impossible.', cost: '' });
    } finally {
      setReviewBusy(false);
    }
  }

  if (!bk) {
    return (
      <>
        <Empty icon={<Sparkles className="size-8" />} title="Un panier DCA pour tes achats de la semaine" action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditor(true)}>Créer mon panier</Button>}>
          Indique un montant, tes jours d’achat et la part base / découverte : à chaque échéance, Boussole te dit exactement quoi acheter (jusqu’à 3 cryptos du top 20 et 3 découvertes), modulé par la température du marché, avec une réserve et des règles contre l’éparpillement.
        </Empty>
        <BasketEditor open={editor} onClose={() => setEditor(false)} initial={null} />
      </>
    );
  }

  const mineAll = history.filter((e) => e.basketId === bk.id);
  const mine = allHistory ? mineAll : mineAll.slice(0, 6);
  const kindLabel = (k: PlannedOrder['kind']) => (k === 'core' ? (b.fullAuto ? 'Base' : 'Cœur') : 'Découverte');
  const plan = b.plan;
  const skip = () => {
    if (!b.periodKey) return;
    addExec({ id: newId(), basketId: bk.id, periodKey: b.periodKey, date: isoDay(), orders: [], investedUsd: 0, reserveDeltaUsd: bk.amountUsd, skipped: true });
  };

  return (
    <>
      <Card
        title={<span className="inline-flex items-center gap-2">{b.fullAuto ? <Wand2 className="size-4 text-accent" /> : <Sparkles className="size-4 text-accent" />}{bk.name}</span>}
        subtitle={b.fullAuto
          ? `${dayList(bk)} · ${n2(bk.amountUsd)} USDC par échéance · automatique : base ${Math.round(bk.basePct ?? 70)} % (top ${AUTO_BASE_TOP}) / découverte ${100 - Math.round(bk.basePct ?? 70)} %`
          : `${dayList(bk)} · ${n2(bk.amountUsd)} USDC par échéance · cœur ${bk.core.map((c) => `${c.symbol.toUpperCase()} ${Math.round(c.weight)} %`).join(' / ')} · découverte ≤ ${Math.round(bk.discoveryMaxPct)} %${bk.discoveryMode === 'auto' ? ' (choisie par Boussole)' : ''}`}
        actions={<Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditor(true)}>Modifier ou supprimer</Button>}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          {b.due && b.last && <Badge tone="warn">Échéance du {fmtDate(b.last)} à faire</Badge>}
          {b.done && b.last && <Badge tone="up" icon={<Check className="size-3" />}>Échéance du {fmtDate(b.last)} faite</Badge>}
          {b.next && <span className="text-xs text-muted">Prochaine échéance : {fmtDate(b.next)}</span>}
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-ink-2"><Shield className="size-3.5" />Réserve : <b className="text-ink">{n2(bk.reserveUsd)} USDC</b></span>
        </div>

        {b.loading && <Spinner label="Calcul de l’ordre du jour (marché, portefeuille, disponibilité Crypto.com)…" />}
        {b.loadError && !b.ready && <ErrorNote error={b.loadError} onRetry={b.retry} />}
        {b.missingCoins && <Banner tone="warn">Les cours de certaines cryptos du panier n’ont pas pu être chargés (CoinGecko limite les requêtes : ajoute une clé « Demo » gratuite dans Réglages). Les règles qui dépendent de ces cours (anti-FOMO, prix indicatif) sont alors moins précises.</Banner>}
        {(bk.discoveryMode === 'auto' || b.fullAuto) && b.autoCandidates.length > 0 && (
          <details className="mb-1 text-xs text-muted">
            <summary className="cursor-pointer">Découverte automatique : {b.autoCandidates.length} candidates, {b.fullAuto ? `jusqu’à ${bk.maxDiscoveryLines ?? AUTO_MAX_LINES} retenues` : 'une seule sera achetée'}</summary>
            <ul className="mt-1 list-disc pl-5">
              {b.autoCandidates.map((p) => (<li key={p.coin.coinId}>{p.coin.symbol.toUpperCase()} — {p.reason}</li>))}
            </ul>
          </details>
        )}
        {b.done && b.doneExecution && <DoneExecution e={b.doneExecution} />}
        {plan && (
          <PreviewWrap collapsed={b.done} next={b.next}>
          <div className="space-y-3">
            {!b.done && <p className="text-xs font-medium text-ink-2">{b.due ? 'Ordre du jour' : 'Aperçu pour la prochaine échéance'}</p>}
            {plan.orders.length === 0 && <Banner tone="info" title="Aucun ordre aujourd’hui">Le montant de l’échéance ({n2(plan.baseUsd)} USDC) part en réserve.</Banner>}
            <ul className="space-y-2">
              {plan.orders.map((o) => (
                <li key={o.coinId} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <CoinIcon src={o.image ?? b.markets.find((m) => m.id === o.coinId)?.image} symbol={o.symbol} size={26} />
                    <span className="min-w-0 flex-1 text-sm font-medium text-ink">{o.name} <span className="text-muted">{o.symbol.toUpperCase()}</span></span>
                    <Badge tone={o.kind === 'core' ? 'accent' : 'neutral'}>{kindLabel(o.kind)}</Badge>
                    <CdcBadge status={cdc.status(o.coinId)} ready={cdc.ready} />
                    <span className="tnum text-lg font-semibold text-ink">{n2(o.usd)} <span className="text-xs font-normal text-muted">USDC</span></span>
                  </div>
                  <p className="mt-1 text-xs text-ink-2">{o.reason}</p>
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink-2">Investi <b className="text-ink">{n2(plan.investUsd)} USDC</b> · réserve <b className={plan.reserveDeltaUsd < 0 ? 'text-down' : 'text-ink'}>{plan.reserveDeltaUsd > 0 ? '+' : ''}{n2(plan.reserveDeltaUsd)} USDC</b> (→ {n2(Math.max(0, bk.reserveUsd + plan.reserveDeltaUsd))})</p>
            {plan.warnings.map((w) => <Banner key={w} tone="warn">{w}</Banner>)}
            {plan.notes.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">{plan.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            {plan.excluded.length > 0 && <details className="text-xs text-muted"><summary className="cursor-pointer">Écartées aujourd’hui ({plan.excluded.length})</summary><ul className="mt-1 list-disc pl-5">{plan.excluded.map((e) => <li key={e.symbol}>{e.symbol} : {e.reason}</li>)}</ul></details>}
            {cfg && plan.orders.length > 0 && b.fullAuto && !b.done && <OptimizePanel opt={opt} />}
            {cfg && plan.orders.length > 0 && !b.fullAuto && !b.done && (
              <div>
                <Button size="sm" loading={reviewBusy} icon={<Sparkles className="size-3.5" />} onClick={() => void askReview()}>Avis de l’IA sur cet ordre</Button>
                {review && <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3 text-sm"><Markdown>{review.text}</Markdown>{review.cost && <p className="mt-1 text-xs text-muted">Coût de cette relecture {review.cost}</p>}</div>}
              </div>
            )}
            {b.due && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="primary" icon={<Check className="size-4" />} onClick={() => { setCustom(null); setExec(true); }}>{plan.orders.length ? 'J’ai passé ces ordres' : 'Mettre en réserve'}</Button>
                {opt.result?.applied.changes.length ? <Button icon={<Sparkles className="size-4" />} onClick={() => { setCustom(opt.result!.applied.orders); setExec(true); }}>J’ai passé l’ordre optimisé</Button> : null}
                <Button icon={<SkipForward className="size-4" />} onClick={skip}>Sauter cette échéance</Button>
              </div>
            )}
          </div>
          </PreviewWrap>
        )}

        {mine.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-1 text-xs font-medium text-ink-2">{allHistory ? `Toutes les échéances (${mineAll.length})` : 'Dernières échéances'}</p>
            <ul className="divide-y divide-line text-sm">
              {mine.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate text-ink-2">{fmtDate(e.periodKey)} · {e.skipped ? 'sautée' : e.orders.length ? e.orders.map((o) => `${o.symbol.toUpperCase()} ${n2(o.usd)} (${fmtQty(o.quantity)})`).join(' + ') : 'mise en réserve'}</span>
                  <span className="flex shrink-0 items-center gap-2"><span className="tnum text-xs text-muted">réserve {e.reserveDeltaUsd > 0 ? '+' : ''}{n2(e.reserveDeltaUsd)}</span>{!e.skipped && e.orders.length > 0 && <Button size="sm" variant="ghost" aria-label="Corriger cette échéance" icon={<Pencil className="size-3.5" />} onClick={() => setEditExec(e)} />}<Button size="sm" variant="ghost" aria-label="Annuler cette échéance" icon={<Trash2 className="size-3.5" />} onClick={() => removeExec(e.id)} /></span>
                </li>
              ))}
            </ul>
            {mineAll.length > 6 && <button type="button" className="mt-1 text-xs font-medium text-accent hover:underline" onClick={() => setAllHistory((v) => !v)}>{allHistory ? 'Voir moins' : `Voir les ${mineAll.length} échéances`}</button>}
            <p className="mt-1 text-xs text-muted">Le crayon corrige une échéance (montant dépensé, quantité reçue) : ses transactions et ta réserve suivent. La corbeille la supprime : ses achats sortent du journal et la réserve revient comme avant.</p>
          </div>
        )}
      </Card>
      <BasketEditor open={editor} onClose={() => setEditor(false)} initial={bk} />
      <ExecuteModal open={exec} onClose={() => setExec(false)} b={b} custom={custom} />
      <EditExecutionModal exec={editExec} onClose={() => setEditExec(null)} />
    </>
  );
}

/** Échéance validée : ce que tu as réellement passé, tel qu'enregistré. Rien n'est recalculé. */
function DoneExecution({ e }: { e: BasketExecution }) {
  return (
    <div className="mb-3 rounded-lg border border-line bg-surface-2 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-ink"><Check className="size-4 text-up" />Échéance du {fmtDate(e.periodKey)} validée</p>
      {e.skipped ? <p className="mt-1 text-ink-2">Échéance sautée : le montant est parti en réserve.</p>
        : e.orders.length === 0 ? <p className="mt-1 text-ink-2">Aucun achat : le montant est parti en réserve.</p>
        : (
          <ul className="mt-2 space-y-1">
            {e.orders.map((o) => (
              <li key={o.coinId} className="flex items-center gap-2">
                <CoinIcon src={o.image} symbol={o.symbol} size={20} />
                <span className="min-w-0 flex-1 truncate text-ink">{o.name} <span className="text-muted">{o.symbol.toUpperCase()}</span></span>
                <span className="tnum text-ink">{n2(o.usd)} USDC</span>
                <span className="tnum text-xs text-muted">{fmtQty(o.quantity)}</span>
              </li>
            ))}
          </ul>
        )}
      <p className="mt-2 text-xs text-muted">Investi {n2(e.investedUsd)} USDC · réserve {e.reserveDeltaUsd > 0 ? '+' : ''}{n2(e.reserveDeltaUsd)} USDC. Rien d’autre à faire avant la prochaine échéance.</p>
    </div>
  );
}

/** Après validation, l'ordre recalculé n'est qu'un aperçu de la prochaine échéance : replié pour ne pas ressembler à un nouvel ordre. */
function PreviewWrap({ collapsed, next, children }: { collapsed: boolean; next: Date | null; children: ReactNode }) {
  if (!collapsed) return <>{children}</>;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs font-medium text-ink-2">Aperçu indicatif de la prochaine échéance{next ? ` (${fmtDate(next)})` : ''}</summary>
      <p className="mb-2 mt-1 text-xs text-muted">Calculé avec ton portefeuille d’après l’achat et les cours du moment, à titre d’information. Le vrai ordre sera fixé le jour de l’échéance.</p>
      {children}
    </details>
  );
}

// ------------------------------------------------------------------ DCA × IA

interface OptimizeResult { advice: DcaAiAdvice; applied: AppliedAdvice; text: string; cost: string; at: string }

const OPT_STORE = 'boussole-dca-ai';
function readOpt(key: string): OptimizeResult | null {
  try { return (JSON.parse(localStorage.getItem(OPT_STORE) ?? '{}') as Record<string, OptimizeResult>)[key] ?? null; } catch { return null; }
}
function writeOpt(key: string, r: OptimizeResult) {
  try {
    const all = JSON.parse(localStorage.getItem(OPT_STORE) ?? '{}') as Record<string, OptimizeResult>;
    all[key] = r;
    // On ne garde que les 12 dernières analyses : une par échéance suffit.
    const keep = Object.entries(all).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, 12);
    localStorage.setItem(OPT_STORE, JSON.stringify(Object.fromEntries(keep)));
  } catch { /* stockage indisponible : l'analyse reste affichée pour cette session */ }
}

/**
 * Couplage DCA × IA : l'ordre des règles + les candidates qui ont passé ces mêmes règles partent vers l'IA, qui garde
 * ou remplace chaque ligne. Une analyse par ordre (mise en cache) ; lancée seule à l'échéance si l'option est active.
 */
function useDcaOptimizer(b: ReturnType<typeof useBasket>, cfg: ReturnType<typeof useAiConfig>, fearGreed: number | null) {
  const plan = b.plan;
  const bk = b.basket;
  const pool = useMemo((): PoolCoin[] => (plan?.pool ?? []).map((p) => {
    const m = b.markets.find((x) => x.id === p.coin.coinId);
    return {
      ...p.coin, image: p.coin.image ?? m?.image, side: p.side, score: p.score, rank: p.rank, change7d: p.change7d,
      change30d: m?.price_change_percentage_30d_in_currency ?? null,
      heldPct: b.ctx && b.ctx.totalValueUsd > 0 ? (p.heldUsd / b.ctx.totalValueUsd) * 100 : 0,
    };
  }), [plan, b.markets, b.ctx]);
  // La clé change avec l'échéance ET avec l'ordre : un ordre recalculé (marché, réserve) mérite une nouvelle lecture.
  const key = bk && plan ? `${bk.id}:${b.periodKey ?? (b.next ? isoDay(b.next) : 'prochaine')}:${plan.orders.map((o) => `${o.coinId}=${o.usd}`).join(',')}` : '';
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tried = useRef('');
  useEffect(() => { setResult(key ? readOpt(key) : null); setError(null); }, [key]);

  async function run() {
    if (!cfg || !plan || !plan.orders.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload = dcaAiPayload({ orders: plan.orders, pool, temperature: b.temperature, fearGreed, notes: [...plan.notes, ...plan.warnings] });
      const r = await runBasketOptimize(cfg, payload, [...plan.orders, ...pool.slice(0, 6)].flatMap((o) => [o.name, o.symbol]));
      const advice = parseDcaAiReply(r.data);
      if (!advice) throw new Error('L’IA n’a pas rendu de décision lisible : l’ordre des règles reste valable tel quel.');
      const res: OptimizeResult = {
        advice,
        applied: applyDcaAiAdvice(plan.orders, advice, pool),
        text: r.text,
        cost: r.usage.costKnown !== false ? `≈ ${r.usage.costUsd.toFixed(4)} $` : `${r.usage.inputTokens + r.usage.outputTokens} jetons`,
        at: new Date().toISOString(),
      };
      writeOpt(key, res);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Optimisation impossible.');
    } finally {
      setBusy(false);
    }
  }

  // Échéance du jour + option active : l'analyse part seule, une fois par ordre.
  useEffect(() => {
    if (!bk?.aiOptimize || !b.fullAuto || !b.due || !cfg || !plan?.orders.length || result || busy || !key || tried.current === key) return;
    tried.current = key;
    void run();
  });

  return { result, busy, error, run, auto: !!bk?.aiOptimize };
}

function OptimizePanel({ opt }: { opt: ReturnType<typeof useDcaOptimizer> }) {
  const r = opt.result;
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-accent" />
        <span className="font-medium text-ink">Optimisation par l’IA</span>
        <span className="text-xs text-muted">les règles fixent les montants, l’IA peut changer une crypto parmi les candidates autorisées</span>
        <Button size="sm" className="ml-auto" loading={opt.busy} onClick={() => void opt.run()}>{r ? 'Relancer' : 'Optimiser avec l’IA'}</Button>
      </div>
      {opt.error && <p className="mt-2 text-xs text-warn">{opt.error}</p>}
      {!r && !opt.busy && !opt.error && <p className="mt-2 text-xs text-muted">{opt.auto ? 'Elle se lancera seule le jour de l’échéance.' : 'Active « Optimiser l’ordre avec l’IA à chaque échéance » dans le panier pour qu’elle se lance seule.'}</p>}
      {r && (
        <div className="mt-2 space-y-2">
          {r.applied.changes.length ? (
            <ul className="space-y-1">
              {r.applied.changes.map((c) => (
                <li key={c.from} className="text-ink-2"><b className="text-ink">{c.from} → {c.to}</b>{c.confidence != null ? ` (confiance ${c.confidence}/5)` : ''}{c.reason ? ` : ${c.reason}` : ''}</li>
              ))}
            </ul>
          ) : <p className="text-ink-2">L’IA garde l’ordre des règles tel quel.</p>}
          {r.advice.decisions.filter((d) => d.decision === 'garder' && d.reason).length > 0 && (
            <details className="text-xs text-muted"><summary className="cursor-pointer">Pourquoi garder les autres lignes</summary>
              <ul className="mt-1 list-disc pl-5">{r.advice.decisions.filter((d) => d.decision === 'garder' && d.reason).map((d) => <li key={d.symbol}>{d.symbol} : {d.reason}</li>)}</ul>
            </details>
          )}
          {r.advice.summary && <p className="text-ink-2">{r.advice.summary}</p>}
          {r.advice.mainRisk && <p className="text-xs text-warn">Risque principal : {r.advice.mainRisk}</p>}
          {r.applied.rejected.length > 0 && (
            <details className="text-xs text-muted"><summary className="cursor-pointer">Propositions écartées par tes règles ({r.applied.rejected.length})</summary>
              <ul className="mt-1 list-disc pl-5">{r.applied.rejected.map((x) => <li key={x}>{x}</li>)}</ul>
            </details>
          )}
          <p className="text-xs text-muted">Analyse du {fmtDate(r.at, true)} · {r.cost}</p>
        </div>
      )}
    </div>
  );
}

/** Corriger une échéance déjà enregistrée : ce que tu as vraiment dépensé et reçu, ligne par ligne. */
function EditExecutionModal({ exec, onClose }: { exec: BasketExecution | null; onClose: () => void }) {
  const update = useStore((s) => s.updateBasketExecution);
  const [rows, setRows] = useState<{ usd: number | ''; qty: number | '' }[]>([]);
  useEffect(() => {
    if (exec) setRows(exec.orders.map((o) => ({ usd: o.usd, qty: o.quantity })));
  }, [exec]);
  if (!exec) return null;
  const valid = rows.length === exec.orders.length && rows.every((r) => r.usd !== '' && r.usd > 0 && r.qty !== '' && r.qty > 0);
  const total = rows.reduce((s, r) => s + (r.usd === '' ? 0 : r.usd), 0);
  return (
    <Modal open onClose={onClose} title={`Corriger l’échéance du ${fmtDate(exec.periodKey)}`}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!valid} onClick={() => { update(exec.id, rows.map((r) => ({ usd: Number(r.usd), quantity: Number(r.qty) }))); onClose(); }}>Enregistrer</Button></>}>
      <div className="space-y-3">
        {exec.orders.map((o, i) => (
          <div key={o.coinId} className="rounded-lg border border-line p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"><CoinIcon src={o.image} symbol={o.symbol} size={20} />{o.name} <span className="text-muted">{o.symbol.toUpperCase()}</span></p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Montant dépensé (USDC)"><NumberInput value={rows[i]?.usd ?? ''} onChange={(v) => setRows(rows.map((r, j) => (j === i ? { ...r, usd: v } : r)))} /></Field>
              <Field label={`Quantité reçue (${o.symbol.toUpperCase()})`}><NumberInput value={rows[i]?.qty ?? ''} onChange={(v) => setRows(rows.map((r, j) => (j === i ? { ...r, qty: v } : r)))} /></Field>
            </div>
            {rows[i] && rows[i].usd !== '' && rows[i].qty !== '' && Number(rows[i].qty) > 0 && <p className="mt-1 text-xs text-muted">Prix payé : {fmtMoney(Number(rows[i].usd) / Number(rows[i].qty), 'USD', 4)}</p>}
          </div>
        ))}
        <p className="text-xs text-muted">Total : {n2(total)} USDC (avant : {n2(exec.investedUsd)}). L’écart est repris par ta réserve ; les achats et les sorties d’USDC du journal sont corrigés avec l’échéance.</p>
      </div>
    </Modal>
  );
}
