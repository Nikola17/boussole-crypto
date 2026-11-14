import { CalendarCheck, Check, FlaskConical, Pause, Pencil, Play, Plus, SkipForward, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { useDcaStatus, type DcaStatus } from '../hooks/useGuidance';
import { useFx, useMarkets } from '../hooks/useMarket';
import { getDailyHistory } from '../api/binance';
import { getFearGreed } from '../api/feargreed';
import { backtestDca, dayKeyUTC, FREQUENCY_LABEL, STRATEGY_HELP, STRATEGY_LABEL, type DcaStrategy, type Frequency } from '../lib/dca';
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtPrice, isoDay, uid } from '../lib/format';
import {
  Badge, Banner, Button, Card, CoinIcon, ErrorNote, Field, Modal, NumberInput, PageHeader, Select, Spinner, Table, Td,
} from '../components/ui';
import { DcaPlanModal } from '../components/forms';
import { BasketSection } from '../components/Basket';
import { LineChart } from '../components/LineChart';
import type { DcaExecution, DcaPlan, Transaction } from '../types';

export default function Dca() {
  const plans = useStore((s) => s.dcaPlans);
  const executions = useStore((s) => s.dcaExecutions);
  const upsert = useStore((s) => s.upsertDcaPlan);
  const remove = useStore((s) => s.removeDcaPlan);
  const removeExec = useStore((s) => s.removeDcaExecution);
  const currency = useStore((s) => s.settings.currency);
  const status = useDcaStatus();
  const markets = useMarkets();
  const imageOf = (p: DcaPlan) => p.image ?? markets.data?.find((m) => m.id === p.coinId)?.image;
  const [edit, setEdit] = useState<DcaPlan | null>(null);
  const [create, setCreate] = useState(false);
  const [buy, setBuy] = useState<DcaStatus | null>(null);
  const [fixExec, setFixExec] = useState<DcaExecution | null>(null);

  const totals = useMemo(() => {
    const byPlan = new Map<string, { invested: number; qty: number; count: number }>();
    for (const e of executions) {
      if (e.skipped) continue;
      const t = byPlan.get(e.planId) ?? { invested: 0, qty: 0, count: 0 };
      t.invested += e.amount;
      t.qty += e.quantity;
      t.count++;
      byPlan.set(e.planId, t);
    }
    return byPlan;
  }, [executions]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="DCA — investissement programmé"
        subtitle="Le panier est ton parcours principal : en mode automatique, tu règles le montant, les jours et la part base / découverte, et Boussole te dit quoi acheter. Les plans à une seule crypto, pour les cas particuliers, restent en « avancé »."
      />

      <BasketSection />

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Avancé : plans sur une seule crypto</h2>
            <p className="text-xs text-muted">Si ton cœur est déjà couvert par le panier, ne crée pas un plan par crypto : tu achèterais Bitcoin et Ethereum deux fois. Ces plans servent aux stratégies propres à une ligne (multiple de Mayer, Fear & Greed, température).</p>
          </div>
          <Button icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>Nouveau plan avancé</Button>
        </div>
        {!plans.length ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Aucun plan avancé : parfait si le panier couvre déjà tes achats.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
          {status.map((s) => {
            const t = totals.get(s.plan.id);
            return (
              <Card key={s.plan.id}
                title={<span className="flex items-center gap-2"><CoinIcon src={imageOf(s.plan)} symbol={s.plan.symbol} size={22} />{s.plan.name}</span>}
                subtitle={`${fmtMoney(s.plan.amount, currency, 0)} · ${FREQUENCY_LABEL[s.plan.frequency].toLowerCase()} · ${STRATEGY_LABEL[s.plan.strategy]}`}
                actions={<>
                  <Button size="sm" variant="ghost" icon={s.plan.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} aria-label={s.plan.active ? 'Mettre en pause' : 'Reprendre'} onClick={() => upsert({ ...s.plan, active: !s.plan.active })} />
                  <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} aria-label="Modifier" onClick={() => setEdit(s.plan)} />
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} aria-label="Supprimer" onClick={() => remove(s.plan.id)} />
                </>}
              >
                <div className="rounded-lg bg-surface-2 p-3">
                  {!s.plan.active ? <p className="text-sm text-muted">Plan en pause.</p> : s.due ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-ink-2">À investir cette période</p>
                        <p className="text-2xl font-semibold text-ink">{fmtMoney(s.recommended, currency, 0)}</p>
                        <p className="text-xs text-muted">×{fmtNum(s.multiplier, 2)} — {s.reason}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="primary" icon={<Check className="size-4" />} onClick={() => setBuy(s)}>J’ai acheté</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-ink-2"><CalendarCheck className="size-4 text-good" />{s.done ? 'Achat de la période effectué.' : 'Le plan démarre bientôt.'} Prochaine échéance : {s.next ? fmtDate(s.next) : '—'}</p>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div><div className="text-xs text-muted">Investi</div><div className="tnum font-medium text-ink">{fmtMoney(t?.invested ?? 0, currency, 0)}</div></div>
                  <div><div className="text-xs text-muted">Achats</div><div className="tnum font-medium text-ink">{t?.count ?? 0}</div></div>
                  <div><div className="text-xs text-muted">Prix moyen</div><div className="tnum font-medium text-ink">{t && t.qty > 0 ? fmtPrice(t.invested / t.qty, currency) : '—'}</div></div>
                </div>
              </Card>
            );
          })}
          </div>
        )}
      </div>

      {executions.length > 0 && (
        <Card padded={false} title="Historique des achats DCA">
          <Table head={['Date', 'Crypto', 'Montant', 'Prix', 'Quantité', 'Multiplicateur', '']}>
            {executions.slice(0, 40).map((e) => {
              const plan = plans.find((p) => p.id === e.planId);
              return (
                <tr key={e.id}>
                  <Td left className="text-ink-2">{fmtDate(e.date)}</Td>
                  <Td>{plan?.symbol.toUpperCase() ?? '—'}</Td>
                  <Td className="font-medium text-ink">{e.skipped ? <Badge>Passé</Badge> : fmtMoney(e.amount, currency, 0)}</Td>
                  <Td>{e.skipped ? '—' : fmtPrice(e.price, currency)}</Td>
                  <Td>{e.skipped ? '—' : fmtNum(e.quantity, 8)}</Td>
                  <Td className="text-ink-2">×{fmtNum(e.multiplier, 2)}</Td>
                  <Td><span className="inline-flex">{!e.skipped && <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} aria-label="Corriger" onClick={() => setFixExec(e)} />}<Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} aria-label="Supprimer" onClick={() => removeExec(e.id)} /></span></Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}

      <Backtest />

      <DcaPlanModal open={create || !!edit} initial={edit} onClose={() => { setCreate(false); setEdit(null); }} />
      <BuyModal status={buy} onClose={() => setBuy(null)} />
      <FixExecutionModal exec={fixExec} onClose={() => setFixExec(null)} />
    </div>
  );
}

function BuyModal({ status, onClose }: { status: DcaStatus | null; onClose: () => void }) {
  const addExec = useStore((s) => s.addDcaExecution);
  const currency = useStore((s) => s.settings.currency);
  const fx = useFx();
  const markets = useMarkets();
  const [amount, setAmount] = useState<number | ''>('');
  const [price, setPrice] = useState<number | ''>('');
  const [fee, setFee] = useState<number | ''>(0);
  const live = status ? markets.data?.find((m) => m.id === status.plan.coinId)?.current_price : undefined;
  const open = !!status;

  const [lastId, setLastId] = useState<string | null>(null);
  if (status && lastId !== status.plan.id) {
    setLastId(status.plan.id);
    setAmount(status.recommended);
    setPrice(live ? Math.round((currency === 'EUR' ? live * fx : live) * 1e6) / 1e6 : '');
    setFee(0);
  }
  if (!status) {
    if (lastId) setLastId(null);
    return null;
  }

  const qty = amount !== '' && price !== '' && price > 0 ? (Number(amount) - Number(fee || 0)) / Number(price) : 0;

  function save(skip = false) {
    if (!status) return;
    const id = uid();
    const txs: Transaction[] = [];
    if (!skip && qty > 0) {
      txs.push({ id: uid(), coinId: status.plan.coinId, symbol: status.plan.symbol, name: status.plan.name, image: status.plan.image, date: isoDay(), type: 'buy', quantity: qty, price: Number(price), currency, fee: Number(fee || 0), fxEurPerUsd: fx, fromFiat: true, source: 'dca', time: new Date().toISOString(), note: `DCA ${STRATEGY_LABEL[status.plan.strategy]}` });
    }
    addExec({ id, planId: status.plan.id, periodKey: status.periodKey ?? isoDay(), date: isoDay(), amount: skip ? 0 : Number(amount), price: skip ? 0 : Number(price), quantity: skip ? 0 : qty, multiplier: status.multiplier, skipped: skip }, txs);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Achat DCA — ${status.plan.name}`} footer={<>
      <Button variant="ghost" icon={<SkipForward className="size-4" />} onClick={() => save(true)}>Passer cette période</Button>
      <Button variant="primary" disabled={amount === '' || price === '' || qty <= 0} onClick={() => save(false)}>Enregistrer l’achat</Button>
    </>}>
      <div className="space-y-3">
        <p className="text-sm text-ink-2">Montant recommandé : <span className="font-semibold text-ink">{fmtMoney(status.recommended, currency, 0)}</span> (×{fmtNum(status.multiplier, 2)} — {status.reason}).</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label={`Montant (${currency === 'EUR' ? '€' : '$'})`}><NumberInput value={amount} onChange={setAmount} /></Field>
          <Field label={`Prix payé (${currency === 'EUR' ? '€' : '$'})`}><NumberInput value={price} onChange={setPrice} /></Field>
          <Field label="Frais"><NumberInput value={fee} onChange={setFee} /></Field>
        </div>
        <p className="text-sm text-ink-2">Quantité obtenue : <span className="tnum font-medium text-ink">{qty > 0 ? fmtNum(qty, 8) : '—'}</span> {status.plan.symbol.toUpperCase()}</p>
        <p className="text-xs text-muted">L’achat est aussi ajouté à ton journal de transactions (portefeuille et fiscalité).</p>
      </div>
    </Modal>
  );
}

const BT_ASSETS = [
  { symbol: 'BTCUSDT', label: 'Bitcoin', start: Date.UTC(2017, 7, 17) },
  { symbol: 'ETHUSDT', label: 'Ethereum', start: Date.UTC(2017, 7, 17) },
  { symbol: 'SOLUSDT', label: 'Solana', start: Date.UTC(2020, 7, 11) },
  { symbol: 'BNBUSDT', label: 'BNB', start: Date.UTC(2017, 10, 6) },
  { symbol: 'XRPUSDT', label: 'XRP', start: Date.UTC(2018, 4, 4) },
  { symbol: 'ADAUSDT', label: 'Cardano', start: Date.UTC(2018, 3, 17) },
  { symbol: 'LINKUSDT', label: 'Chainlink', start: Date.UTC(2019, 0, 16) },
];

function Backtest() {
  const [run, setRun] = useState(false);
  const [asset, setAsset] = useState('BTCUSDT');
  const [years, setYears] = useState(4);
  const [amount, setAmount] = useState<number | ''>(50);
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const meta = BT_ASSETS.find((a) => a.symbol === asset)!;
  const hist = useQuery({ queryKey: ['bt-hist', asset], queryFn: () => getDailyHistory(asset, meta.start), enabled: run, staleTime: 60 * 60_000 });
  const fng = useQuery({ queryKey: ['fng-all'], queryFn: () => getFearGreed(0), enabled: run, staleTime: 6 * 60 * 60_000 });

  const results = useMemo(() => {
    if (!hist.data || amount === '' || amount <= 0) return null;
    const prices = hist.data.map((c) => ({ time: c.time, close: c.close }));
    const startTime = Math.max(prices[0].time + 200 * 86400, Date.now() / 1000 - years * 365.25 * 86400);
    const fngMap = new Map((fng.data ?? []).map((f) => [dayKeyUTC(f.time), f.value]));
    const strategies: DcaStrategy[] = fng.data?.length ? ['classic', 'fear_greed', 'mayer'] : ['classic', 'mayer'];
    return strategies.map((s) => backtestDca({ prices, amount: Number(amount), frequency, strategy: s, startTime, fngByDay: fngMap }));
  }, [hist.data, fng.data, amount, frequency, years]);

  const colors: Record<string, string> = { classic: 'var(--series-1)', fear_greed: 'var(--series-2)', mayer: 'var(--series-3)' };
  const sample = (pts: { time: number; value: number }[]) => pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1).map((p) => ({ t: p.time, v: p.value }));

  return (
    <Card title={<span className="inline-flex items-center gap-2"><FlaskConical className="size-4 text-accent" />Simulateur : et si j’avais fait du DCA ?</span>} subtitle="Backtest sur l’historique réel Binance (en dollars), frais de 0,1 % inclus. Les performances passées ne préjugent pas des performances futures.">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Field label="Crypto"><Select value={asset} onChange={(e) => setAsset(e.target.value)}>{BT_ASSETS.map((a) => <option key={a.symbol} value={a.symbol}>{a.label}</option>)}</Select></Field>
        <Field label="Montant ($)"><NumberInput value={amount} onChange={setAmount} /></Field>
        <Field label="Fréquence"><Select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>{Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Durée"><Select value={years} onChange={(e) => setYears(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 8].map((y) => <option key={y} value={y}>{y} an{y > 1 ? 's' : ''}</option>)}</Select></Field>
        <div className="flex items-end"><Button variant="primary" className="w-full" onClick={() => setRun(true)}>{run ? 'Recalculer' : 'Lancer la simulation'}</Button></div>
      </div>
      {run && hist.isLoading && <div className="mt-4"><Spinner label="Téléchargement de l’historique…" /></div>}
      {hist.error && <div className="mt-4"><ErrorNote error={hist.error} /></div>}
      {results && (
        <div className="mt-5 space-y-4">
          <LineChart
            height={260}
            yFormat={(v) => (Math.abs(v) >= 1000 ? `${fmtNum(v / 1000, 0)} k$` : `${fmtNum(v, 0)} $`)}
            series={[
              ...results.map((r) => ({ key: r.summary.strategy, label: STRATEGY_LABEL[r.summary.strategy], color: colors[r.summary.strategy], points: sample(r.points.map((p) => ({ time: p.time, value: p.value }))) })),
              { key: 'invested', label: 'Investi (classique)', color: 'var(--text-muted)', dashed: true, points: sample(results[0].points.map((p) => ({ time: p.time, value: p.invested }))) },
            ]}
          />
          <div className="overflow-x-auto">
            <table className="tnum w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-2 font-medium">Stratégie</th><th className="py-2 text-right font-medium">Investi</th><th className="py-2 text-right font-medium">Valeur finale</th><th className="py-2 text-right font-medium">Performance</th><th className="py-2 text-right font-medium">Prix moyen</th><th className="py-2 text-right font-medium">Pire moment</th></tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.summary.strategy} className="border-b border-line">
                    <td className="py-2"><span className="inline-flex items-center gap-2"><span className="h-0.5 w-4 rounded" style={{ background: colors[r.summary.strategy] }} />{STRATEGY_LABEL[r.summary.strategy]}</span></td>
                    <td className="py-2 text-right">{fmtMoney(r.summary.invested, 'USD', 0)}</td>
                    <td className="py-2 text-right font-medium text-ink">{fmtMoney(r.summary.value, 'USD', 0)}</td>
                    <td className={`py-2 text-right ${r.summary.roiPct >= 0 ? 'text-up' : 'text-down'}`}>{fmtPct(r.summary.roiPct, 0)}</td>
                    <td className="py-2 text-right">{fmtPrice(r.summary.avgCost, 'USD')}</td>
                    <td className="py-2 text-right text-down">{fmtPct(r.summary.worstPct, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Banner tone="info" title="Comment lire ce résultat">
            Le DCA intelligent investit des montants variables : compare surtout la <strong>performance</strong> et le <strong>prix moyen</strong> (plus il est bas, mieux c’est). « Pire moment » = la plus forte perte latente traversée par rapport au capital investi : c’est ce que tu dois être capable de supporter psychologiquement.
          </Banner>
          <div className="grid gap-2 text-xs text-muted md:grid-cols-3">
            {(['classic', 'fear_greed', 'mayer'] as DcaStrategy[]).map((s) => <p key={s}><span className="font-medium text-ink-2">{STRATEGY_LABEL[s]} :</span> {STRATEGY_HELP[s]}</p>)}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Corriger un achat DCA déjà enregistré : montant, prix payé, quantité reçue — sa transaction du journal suit. */
function FixExecutionModal({ exec, onClose }: { exec: DcaExecution | null; onClose: () => void }) {
  const update = useStore((s) => s.updateDcaExecution);
  const currency = useStore((s) => s.settings.currency);
  const [amount, setAmount] = useState<number | ''>('');
  const [price, setPrice] = useState<number | ''>('');
  const [qty, setQty] = useState<number | ''>('');
  const [lastId, setLastId] = useState<string | null>(null);
  if (exec && lastId !== exec.id) {
    setLastId(exec.id);
    setAmount(exec.amount);
    setPrice(exec.price);
    setQty(exec.quantity);
  }
  if (!exec) {
    if (lastId) setLastId(null);
    return null;
  }
  const valid = amount !== '' && amount > 0 && price !== '' && price > 0 && qty !== '' && qty > 0;
  return (
    <Modal open onClose={onClose} title={`Corriger l’achat du ${fmtDate(exec.date)}`}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!valid} onClick={() => { update(exec.id, { amount: Number(amount), price: Number(price), quantity: Number(qty) }); onClose(); }}>Enregistrer</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label={`Montant (${currency === 'EUR' ? '€' : '$'})`}><NumberInput value={amount} onChange={setAmount} /></Field>
          <Field label="Prix payé"><NumberInput value={price} onChange={setPrice} /></Field>
          <Field label="Quantité reçue"><NumberInput value={qty} onChange={setQty} /></Field>
        </div>
        <p className="text-xs text-muted">La transaction correspondante du journal (portefeuille, prix de revient, fiscalité) est corrigée avec l’achat.</p>
      </div>
    </Modal>
  );
}
