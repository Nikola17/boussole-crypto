// Panier DCA : plan (jours, budget en USDC, cœur et liste « découverte »), ordre du jour, validation et historique.

import { Check, ClipboardPaste, Pencil, Plus, Shield, SkipForward, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { newId, useStore } from '../store/useStore';
import { useBasket } from '../hooks/useBasket';
import { usePortfolio } from '../hooks/usePortfolio';
import { useFx } from '../hooks/useMarket';
import { DAY_LABEL, MAX_DISCOVERY, type PlannedOrder } from '../lib/basket';
import { fmtDate, fmtMoney, fmtNum, fmtQty, isoDay } from '../lib/format';
import type { BasketCoin, BasketExecution, BasketOrderLog, BasketPlan, CoinRef, Transaction } from '../types';
import { CoinPicker } from './CoinPicker';
import { CdcBadge } from './CdcBadge';
import { useCryptoCom } from '../hooks/useCryptoCom';
import { GrokBridge } from './GrokBridge';
import { Markdown } from './Markdown';
import { useAiConfig } from './AiBlocks';
import { runBasketReview } from '../ai/tasks';
import { Badge, Banner, Button, Card, CoinIcon, Empty, ErrorNote, Field, Input, Modal, NumberInput, Select, Spinner, Toggle } from './ui';

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
    core: [{ ...BTC, weight: 70 }, { ...ETH, weight: 30 }], discovery, reserveUsd: 0, minOrderUsd: 5, reminder: true, createdAt: new Date().toISOString(),
  };
}

export function BasketEditor({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: BasketPlan | null }) {
  const setBasket = useStore((s) => s.setBasket);
  const accounts = useStore((s) => s.accounts);
  const pf = usePortfolio();
  const [d, setD] = useState<BasketPlan>(() => initial ?? defaultBasket([]));
  useEffect(() => {
    // Pré-remplissage une seule fois, à l'ouverture : la liste « découverte » reprend tes lignes actuelles hors cœur.
    if (open) setD(initial ?? defaultBasket(pf.holdings));
  }, [open, initial]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<BasketPlan>) => setD((cur) => ({ ...cur, ...p }));
  const valid = d.name.trim() && d.amountUsd > 0 && d.daysOfWeek.length > 0 && d.core.some((c) => c.weight > 0);
  const addCore = (c: CoinRef) => { if (!d.core.some((x) => x.coinId === c.coinId)) set({ core: [...d.core, { ...c, weight: 10 }] }); };
  const addDisc = (c: CoinRef) => { if (d.discovery.length < MAX_DISCOVERY && !d.discovery.some((x) => x.coinId === c.coinId)) set({ discovery: [...d.discovery, c] }); };

  return (
    <Modal open={open} onClose={onClose} wide title={initial ? 'Modifier mon panier' : 'Créer mon panier DCA'}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!valid} onClick={() => { setBasket({ ...d, name: d.name.trim() }); onClose(); }}>Enregistrer</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Nom" className="col-span-2"><Input value={d.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Budget par échéance (USDC)"><NumberInput value={d.amountUsd} onChange={(v) => set({ amountUsd: v === '' ? 0 : v })} /></Field>
          <Field label="Minimum par ordre (USDC)"><NumberInput value={d.minOrderUsd} onChange={(v) => set({ minOrderUsd: v === '' ? 0 : v })} /></Field>
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
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const cdc = useCryptoCom(b.markets);
  const [editor, setEditor] = useState(false);
  const [exec, setExec] = useState(false);
  const [grok, setGrok] = useState(false);
  const [custom, setCustom] = useState<PlannedOrder[] | null>(null);
  const cfg = useAiConfig();
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
          Un budget en USDC réparti à chaque échéance sur au plus deux lignes : un cœur (Bitcoin, Ethereum…) et une « découverte », modulés par la température du marché, avec une réserve et des règles contre l’éparpillement.
        </Empty>
        <BasketEditor open={editor} onClose={() => setEditor(false)} initial={null} />
      </>
    );
  }

  const mine = history.filter((e) => e.basketId === bk.id).slice(0, 6);
  const plan = b.plan;
  const skip = () => {
    if (!b.periodKey) return;
    addExec({ id: newId(), basketId: bk.id, periodKey: b.periodKey, date: isoDay(), orders: [], investedUsd: 0, reserveDeltaUsd: bk.amountUsd, skipped: true });
  };

  return (
    <>
      <Card
        title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-accent" />{bk.name}</span>}
        subtitle={`${dayList(bk)} · ${n2(bk.amountUsd)} USDC par échéance · cœur ${bk.core.map((c) => `${c.symbol.toUpperCase()} ${Math.round(c.weight)} %`).join(' / ')} · découverte ≤ ${Math.round(bk.discoveryMaxPct)} %`}
        actions={<><Button size="sm" icon={<ClipboardPaste className="size-3.5" />} onClick={() => setGrok(true)}>Grok</Button><Button size="sm" variant="ghost" aria-label="Modifier le panier" icon={<Pencil className="size-3.5" />} onClick={() => setEditor(true)} /></>}
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
        {plan && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-ink-2">{b.due ? 'Ordre du jour' : 'Aperçu pour la prochaine échéance'}</p>
            {plan.orders.length === 0 && <Banner tone="info" title="Aucun ordre aujourd’hui">Le montant de l’échéance ({n2(plan.baseUsd)} USDC) part en réserve.</Banner>}
            <ul className="space-y-2">
              {plan.orders.map((o) => (
                <li key={o.coinId} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <CoinIcon src={o.image ?? b.markets.find((m) => m.id === o.coinId)?.image} symbol={o.symbol} size={26} />
                    <span className="min-w-0 flex-1 text-sm font-medium text-ink">{o.name} <span className="text-muted">{o.symbol.toUpperCase()}</span></span>
                    <Badge tone={o.kind === 'core' ? 'accent' : 'neutral'}>{o.kind === 'core' ? 'Cœur' : 'Découverte'}</Badge>
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
            {cfg && plan.orders.length > 0 && (
              <div>
                <Button size="sm" loading={reviewBusy} icon={<Sparkles className="size-3.5" />} onClick={() => void askReview()}>Avis de l’IA sur cet ordre</Button>
                {review && <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3 text-sm"><Markdown>{review.text}</Markdown>{review.cost && <p className="mt-1 text-xs text-muted">Coût de cette relecture {review.cost}</p>}</div>}
              </div>
            )}
            {b.due && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="primary" icon={<Check className="size-4" />} onClick={() => { setCustom(null); setExec(true); }}>{plan.orders.length ? 'J’ai passé ces ordres' : 'Mettre en réserve'}</Button>
                <Button icon={<SkipForward className="size-4" />} onClick={skip}>Sauter cette échéance</Button>
              </div>
            )}
          </div>
        )}

        {mine.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-1 text-xs font-medium text-ink-2">Dernières échéances</p>
            <ul className="divide-y divide-line text-sm">
              {mine.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate text-ink-2">{fmtDate(e.periodKey)} · {e.skipped ? 'sautée' : e.orders.length ? e.orders.map((o) => `${o.symbol.toUpperCase()} ${n2(o.usd)} (${fmtQty(o.quantity)})`).join(' + ') : 'mise en réserve'}</span>
                  <span className="flex shrink-0 items-center gap-2"><span className="tnum text-xs text-muted">réserve {e.reserveDeltaUsd > 0 ? '+' : ''}{n2(e.reserveDeltaUsd)}</span><Button size="sm" variant="ghost" aria-label="Annuler cette échéance" icon={<Trash2 className="size-3.5" />} onClick={() => removeExec(e.id)} /></span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted">Annuler une échéance remet la réserve comme avant ; les transactions du journal sont à supprimer à part.</p>
          </div>
        )}
      </Card>
      <BasketEditor open={editor} onClose={() => setEditor(false)} initial={bk} />
      <ExecuteModal open={exec} onClose={() => setExec(false)} b={b} custom={custom} />
      <GrokBridge open={grok} onClose={() => setGrok(false)} b={b} onUseOrders={(o) => { setCustom(o); setExec(true); }} />
    </>
  );
}
