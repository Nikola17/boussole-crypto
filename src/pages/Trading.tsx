import { Bell, Bot, Calculator, CircleAlert, LineChart as LineIcon, NotebookPen, Pencil, Plus, Target, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useCoinCandles, useCycle, useFx, useMarkets, usePrices } from '../hooks/useMarket';
import { usePortfolio } from '../hooks/usePortfolio';
import { openTradeStatus, positionSize, tradePnl, tradeR, tradeStats } from '../lib/risk';
import { analyze } from '../lib/signals';
import { closedCandles } from '../lib/indicators';
import { CoinPicker } from '../components/CoinPicker';
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtPrice, isoDay, uid } from '../lib/format';
import { navigate, setQuery, useHashPath } from '../router';
import {
  Badge, Banner, Button, Card, Empty, Field, Modal, NumberInput, PageHeader, Segmented, Select, Stat, Table, Td, Textarea,
} from '../components/ui';
import { AlertModal, TradeModal } from '../components/forms';
import { LineChart } from '../components/LineChart';
import { AiProgress, NeedKey, ReportView, useAiConfig, useAiRunner } from '../components/AiBlocks';
import { useAiContext } from '../ai/context';
import { runJournalReview } from '../ai/tasks';
import type { CoinRef, TradeEntry } from '../types';

type Tab = 'calc' | 'journal' | 'alertes';

export default function Trading() {
  const { query } = useHashPath();
  const tab = (query.get('tab') as Tab) || 'calc';
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Trading"
        subtitle="Calcule la bonne taille de position à partir d’une crypto, suis tes positions ouvertes en direct, tiens ton journal et fais-toi coacher par l’IA. Règle n°1 : chaque trade a un stop."
        actions={<Button size="sm" variant="ghost" icon={<LineIcon className="size-3.5" />} onClick={() => navigate('/marche')}>Setups détectés</Button>}
      />
      <Segmented value={tab} onChange={(v) => setQuery({ tab: v })} options={[
        { value: 'calc', label: 'Calculateur' },
        { value: 'journal', label: 'Journal' },
        { value: 'alertes', label: 'Alertes de prix' },
      ]} />
      {tab === 'calc' && <SizeCalculator />}
      {tab === 'journal' && <Journal />}
      {tab === 'alertes' && <Alerts />}
    </div>
  );
}

function SizeCalculator() {
  const pf = usePortfolio();
  const rules = useStore((s) => s.profile.rules);
  const currency = useStore((s) => s.settings.currency);
  const markets = useMarkets();
  const cycle = useCycle();
  const [capital, setCapital] = useState<number | ''>(Math.round(pf.totals.value) || 1000);
  const [risk, setRisk] = useState<number | ''>(rules.riskPerTradePct);
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [entry, setEntry] = useState<number | ''>('');
  const [stop, setStop] = useState<number | ''>('');
  const [tp, setTp] = useState<number | ''>('');
  const [lev, setLev] = useState<number | ''>(1);
  const [coin, setCoin] = useState<CoinRef | null>(null);
  const [journal, setJournal] = useState(false);

  // Une crypto choisie : son cours du moment et son analyse technique (ATR, support) remplissent le calcul.
  const extra = usePrices(coin && !(markets.data ?? []).some((m) => m.id === coin.coinId) ? [coin.coinId] : []);
  const livePrice = coin ? (markets.data ?? []).find((m) => m.id === coin.coinId)?.current_price ?? extra.data?.[coin.coinId]?.usd ?? null : null;
  const candles = useCoinCandles(coin && livePrice ? { id: coin.coinId, symbol: coin.symbol.toLowerCase(), priceUsd: livePrice } : null, '1d');
  const analysis = useMemo(() => (candles.data?.candles.length ? analyze(closedCandles(candles.data.candles, Date.now()), { temperature: cycle.data?.temperature }, { closedOnly: true }) : null), [candles.data, cycle.data]);
  const round = (x: number) => Math.round(x * 1e6) / 1e6;

  function fillFromPlan() {
    if (!livePrice) return;
    const atr = analysis?.plan?.atr ?? null;
    setEntry(round(livePrice));
    if (side === 'long') {
      const st = analysis?.plan?.stop ?? (atr ? livePrice - 2 * atr : null);
      if (st != null) { setStop(round(st)); setTp(round(livePrice + 2 * (livePrice - st))); }
    } else if (atr) {
      const st = livePrice + 2 * atr;
      setStop(round(st));
      setTp(round(livePrice - 2 * (st - livePrice)));
    }
  }

  const r = positionSize({ capital: Number(capital), riskPct: Number(risk), entry: Number(entry), stop: Number(stop), takeProfit: tp === '' ? undefined : Number(tp), leverage: Number(lev || 1), side });
  const qty = r ? round(r.quantity) : null;
  // Mémorisé : un objet recréé à chaque rendu réinitialiserait le formulaire du journal pendant que tu le remplis.
  const preset = useMemo((): Partial<TradeEntry> | null => (qty && coin ? { coinId: coin.coinId, symbol: coin.symbol, side, entryPrice: Number(entry), stopLoss: Number(stop), takeProfit: tp === '' ? undefined : Number(tp), quantity: qty, leverage: Number(lev || 1) } : null), [qty, coin, side, entry, stop, tp, lev]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={<span className="inline-flex items-center gap-2"><Calculator className="size-4 text-accent" />Taille de position</span>} subtitle="Combien acheter pour ne risquer qu’un petit pourcentage de ton capital si le stop est touché">
        <div className="mb-3 space-y-2 rounded-lg bg-surface-2 p-3">
          <Field label="Crypto (facultatif)"><CoinPicker value={coin} onChange={setCoin} /></Field>
          {coin && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
              <span>Cours : <b className="text-ink">{livePrice ? fmtPrice(livePrice, 'USD') : '…'}</b></span>
              {analysis && <span>· trader : <b className="text-ink">{analysis.trader.label}</b> · volatilité {fmtNum(analysis.atrPct, 1)} %/jour</span>}
              <Button size="sm" icon={<Wand2 className="size-3.5" />} disabled={!livePrice} onClick={fillFromPlan}>Remplir entrée, stop et objectif</Button>
            </div>
          )}
          {coin && analysis && side === 'long' && analysis.trader.tone !== 'up' && <p className="text-xs text-warn">Le signal trader n’est pas haussier : le stop proposé vient de la volatilité, pas d’un setup. Attends peut-être un meilleur moment.</p>}
          {coin && <p className="text-xs text-muted">Stop sous le dernier support (ou à 2 × la volatilité moyenne), objectif à 2 R. Ajuste-les à ta lecture du graphique.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Capital (${currency === 'EUR' ? '€' : '$'})`}><NumberInput value={capital} onChange={setCapital} /></Field>
          <Field label="Risque par trade (%)" hint={`Ton profil : ${rules.riskPerTradePct} %`}><NumberInput value={risk} onChange={setRisk} /></Field>
          <Field label="Sens"><Select value={side} onChange={(e) => setSide(e.target.value as 'long' | 'short')}><option value="long">Long (achat)</option><option value="short">Short</option></Select></Field>
          <Field label="Levier"><NumberInput value={lev} onChange={setLev} /></Field>
          <Field label="Prix d’entrée ($)"><NumberInput value={entry} onChange={setEntry} /></Field>
          <Field label="Stop loss ($)"><NumberInput value={stop} onChange={setStop} /></Field>
          <Field label="Objectif ($, facultatif)" className="col-span-2"><NumberInput value={tp} onChange={setTp} /></Field>
        </div>
      </Card>
      <Card title="Résultat">
        {!r ? <p className="text-sm text-muted">Renseigne un prix d’entrée et un stop cohérents (sous l’entrée pour un long, au-dessus pour un short), ou choisis une crypto et clique sur « Remplir ».</p> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Quantité à acheter" value={fmtNum(r.quantity, 6)} />
              <Stat label="Taille de la position" value={fmtMoney(r.notional, currency, 0)} hint={Number(lev) > 1 ? `marge ${fmtMoney(r.margin, currency, 0)}` : undefined} />
              <Stat label="Perte si stop touché" value={<span className="text-down">{fmtMoney(r.riskAmount, currency, 0)}</span>} hint={`distance ${fmtNum(r.stopDistancePct, 2)} %`} />
              <Stat label="Ratio gain / risque" value={r.rr != null ? `${fmtNum(r.rr, 2)} R` : '—'} hint={r.potentialGain != null ? `gain ${fmtMoney(r.potentialGain, currency, 0)}` : undefined} />
            </div>
            {r.liquidationPrice != null && <p className="text-sm text-ink-2">Prix de liquidation estimé : <span className="tnum font-medium text-ink">{fmtNum(r.liquidationPrice, 6)}</span></p>}
            <p className="text-xs text-muted">Frais estimés (0,1 % par côté) : {fmtMoney(r.fees, currency, 2)}</p>
            {r.rr != null && r.rr < 1.5 && <Banner tone="warn">Moins de 1,5 R de gain potentiel pour 1 R de risque : avec un taux de réussite ordinaire, ce trade ne paie pas sur la durée.</Banner>}
            {r.warnings.map((w, i) => <Banner key={i} tone="warn">{w}</Banner>)}
            {preset
              ? <Button variant="primary" icon={<NotebookPen className="size-4" />} onClick={() => setJournal(true)}>Ouvrir ce trade dans le journal</Button>
              : <p className="text-xs text-muted">Choisis une crypto pour pouvoir enregistrer ce trade dans ton journal en un clic.</p>}
            <Banner tone="info">Avec 1 % de risque par trade, il faut 10 pertes d’affilée pour perdre ~10 % du capital. C’est ce qui permet de durer.</Banner>
          </div>
        )}
      </Card>
      <TradeModal open={journal} preset={preset} onClose={() => setJournal(false)} />
    </div>
  );
}

/** Positions ouvertes du journal, valorisées au cours du moment : où en est chacune par rapport à son stop et à son objectif. */
function OpenPositions({ trades }: { trades: TradeEntry[] }) {
  const upsert = useStore((s) => s.upsertTrade);
  const markets = useMarkets();
  const open = trades.filter((t) => t.status === 'open');
  const outside = open.map((t) => t.coinId).filter((id) => id && !(markets.data ?? []).some((m) => m.id === id));
  const extra = usePrices(outside);
  const priceOf = (id: string): number | null => (markets.data ?? []).find((m) => m.id === id)?.current_price ?? extra.data?.[id]?.usd ?? null;
  if (!open.length) return null;
  const closeAt = (t: TradeEntry, price: number) => upsert({ ...t, status: 'closed', exitPrice: Math.round(price * 1e6) / 1e6, exitDate: isoDay() });
  return (
    <Card title={<span className="inline-flex items-center gap-2"><Target className="size-4 text-accent" />Positions ouvertes</span>} subtitle="Au cours du moment : résultat latent, distance au stop et à l’objectif">
      <ul className="divide-y divide-line">
        {open.map((t) => {
          const price = priceOf(t.coinId);
          const st = price != null ? openTradeStatus(t, price) : null;
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {t.symbol.toUpperCase()}
                  <Badge tone={t.side === 'long' ? 'up' : 'down'}>{t.side === 'long' ? 'Long' : 'Short'}{t.leverage > 1 ? ` ×${t.leverage}` : ''}</Badge>
                  {st?.stopHit && <Badge tone="down" icon={<CircleAlert className="size-3" />}>Stop franchi</Badge>}
                  {st?.targetHit && <Badge tone="up" icon={<Target className="size-3" />}>Objectif atteint</Badge>}
                  {t.stopLoss == null && <Badge tone="warn">Sans stop</Badge>}
                </div>
                <div className="text-xs text-muted">
                  Entrée {fmtNum(t.entryPrice, 6)} · cours {price != null ? fmtNum(price, 6) : '—'}
                  {st?.toStopPct != null && ` · stop à ${fmtNum(st.toStopPct, 1)} %`}
                  {st?.toTargetPct != null && ` · objectif à ${fmtNum(st.toTargetPct, 1)} %`}
                </div>
              </div>
              <div className="text-right">
                <div className={`tnum text-sm font-semibold ${st == null ? 'text-muted' : st.pnl >= 0 ? 'text-up' : 'text-down'}`}>{st ? fmtMoney(st.pnl, 'USD', 0) : '—'}</div>
                <div className="tnum text-xs text-muted">{st?.r != null ? `${st.r >= 0 ? '+' : ''}${fmtNum(st.r, 2)} R` : ''}</div>
              </div>
              {price != null && <Button size="sm" variant="ghost" onClick={() => closeAt(t, price)}>Clôturer au cours</Button>}
            </li>
          );
        })}
      </ul>
      {open.some((t) => { const p = priceOf(t.coinId); return p != null && openTradeStatus(t, p)?.stopHit; }) && (
        <Banner tone="warn" title="Un stop est franchi">Respecte ton plan : coupe la position sur ta plateforme, puis clôture-la ici. Déplacer un stop après coup est l’erreur qui coûte le plus cher.</Banner>
      )}
    </Card>
  );
}

function Journal() {
  const trades = useStore((s) => s.trades);
  const remove = useStore((s) => s.removeTrade);
  const reports = useStore((s) => s.reports);
  const removeReport = useStore((s) => s.removeReport);
  const cfg = useAiConfig();
  const ctx = useAiContext();
  const runner = useAiRunner();
  const [edit, setEdit] = useState<TradeEntry | null>(null);
  const [create, setCreate] = useState(false);
  const stats = useMemo(() => tradeStats(trades), [trades]);
  const lastReview = reports.find((r) => r.kind === 'journal');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>Nouveau trade</Button>
        {cfg && trades.length > 0 && <Button icon={<Bot className="size-4" />} disabled={runner.running} onClick={() => void runner.run((onP, signal) => runJournalReview(cfg, {
          stats: { ...stats, equity: undefined },
          trades: trades.slice(0, 40).map((t) => ({ ...t, pnl: tradePnl(t), r: tradeR(t) })),
          profile: ctx.profile(),
        }, onP, signal))}>Coaching IA du journal</Button>}
      </div>
      {!cfg && trades.length > 0 && <NeedKey compact />}
      {runner.running && <AiProgress progress={runner.progress} onCancel={runner.cancel} />}
      {runner.error && <Banner tone="warn">{runner.error}</Banner>}

      <OpenPositions trades={trades} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Trades clôturés" value={stats.closed} hint={`${stats.open} ouvert(s)`} />
        <Stat label="Taux de réussite" value={`${fmtNum(stats.winRate, 0)} %`} hint={`${stats.wins} gagnants / ${stats.losses} perdants`} />
        <Stat label="P&L total ($)" value={<span className={stats.totalPnl >= 0 ? 'text-up' : 'text-down'}>{fmtMoney(stats.totalPnl, 'USD', 0)}</span>} hint={`espérance ${fmtMoney(stats.expectancy, 'USD', 0)}/trade`} />
        <Stat label="R moyen · profit factor" value={`${stats.avgR != null ? fmtNum(stats.avgR, 2) : '—'} · ${stats.profitFactor != null ? fmtNum(stats.profitFactor, 2) : '—'}`} />
        <Stat label="Pire série · baisse max" value={`${stats.maxLosingStreak} · ${fmtMoney(-stats.maxDrawdown, 'USD', 0)}`} hint="pertes d’affilée · depuis un sommet" />
      </div>
      {stats.equity.length > 1 && (
        <Card title="Courbe de résultats cumulés ($)">
          <LineChart height={200} yFormat={(v) => `${fmtNum(v, 0)} $`} series={[{ key: 'eq', label: 'P&L cumulé', color: 'var(--series-1)', area: true, points: stats.equity.map((e) => ({ t: e.time, v: e.value })) }]} />
        </Card>
      )}
      {stats.bySetup.length > 0 && (
        <Card title="Performance par setup">
          <ul className="divide-y divide-line text-sm">
            {stats.bySetup.map((s) => <li key={s.setup} className="flex justify-between py-2"><span className="text-ink">{s.setup} <span className="text-xs text-muted">({s.count})</span></span><span className="tnum"><span className={s.pnl >= 0 ? 'text-up' : 'text-down'}>{fmtMoney(s.pnl, 'USD', 0)}</span> <span className="text-xs text-muted">· {fmtNum(s.winRate, 0)} %</span></span></li>)}
          </ul>
        </Card>
      )}
      {!trades.length ? <Empty title="Journal vide">Note chaque trade (entrée, stop, objectif, raison, émotion). Le journal est l’outil n°1 pour progresser : l’IA y repère tes erreurs récurrentes.</Empty> : (
        <Card padded={false} title="Trades">
          <Table head={['Date', 'Crypto', 'Sens', 'Entrée', 'Stop', 'Sortie', 'P&L ($)', 'R', 'Setup', '']}>
            {trades.map((t) => {
              const pnl = tradePnl(t);
              const r = tradeR(t);
              return (
                <tr key={t.id} className="hover:bg-surface-2">
                  <Td left className="text-ink-2">{fmtDate(t.entryDate)}</Td>
                  <Td className="font-medium text-ink">{t.symbol.toUpperCase()}</Td>
                  <Td><Badge tone={t.side === 'long' ? 'up' : 'down'}>{t.side === 'long' ? 'Long' : 'Short'}{t.leverage > 1 ? ` ×${t.leverage}` : ''}</Badge></Td>
                  <Td>{fmtNum(t.entryPrice, 6)}</Td>
                  <Td className="text-ink-2">{t.stopLoss != null ? fmtNum(t.stopLoss, 6) : <span className="text-down">aucun</span>}</Td>
                  <Td>{t.status === 'open' ? <Badge>Ouvert</Badge> : fmtNum(t.exitPrice ?? 0, 6)}</Td>
                  <Td className={pnl == null ? 'text-muted' : pnl >= 0 ? 'text-up' : 'text-down'}>{pnl == null ? '—' : fmtMoney(pnl, 'USD', 0)}</Td>
                  <Td>{r != null ? fmtNum(r, 2) : '—'}</Td>
                  <Td className="max-w-[140px] truncate text-ink-2">{t.setup || '—'}</Td>
                  <Td><span className="inline-flex"><Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} aria-label="Modifier" onClick={() => setEdit(t)} /><Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} aria-label="Supprimer" onClick={() => remove(t.id)} /></span></Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}
      {lastReview && <ReportView report={lastReview} onDelete={() => removeReport(lastReview.id)} />}
      <TradeModal open={create || !!edit} initial={edit} onClose={() => { setCreate(false); setEdit(null); }} />
    </div>
  );
}

function Alerts() {
  const alerts = useStore((s) => s.alerts);
  const remove = useStore((s) => s.removeAlert);
  const upsert = useStore((s) => s.upsertAlert);
  const notes = useStore((s) => s.hotNotes);
  const currency = useStore((s) => s.settings.currency);
  const fx = useFx();
  const rate = currency === 'EUR' ? fx : 1;
  const markets = useMarkets();
  const [open, setOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<null | { alertId?: string; coinId?: string; symbol: string }>(null);
  return (
    <div className="space-y-4">
      <Button variant="primary" icon={<Bell className="size-4" />} onClick={() => setOpen(true)}>Nouvelle alerte</Button>
      {!alerts.length ? <Empty title="Aucune alerte">Crée une alerte pour être prévenu quand un prix franchit un niveau clé (support, objectif, zone d’accumulation).</Empty> : (
        <Card padded={false}>
          <Table head={['Crypto', 'Condition', 'Niveau', 'Cours actuel', 'Écart', 'Statut', '']}>
            {alerts.map((a) => {
              const p = markets.data?.find((m) => m.id === a.coinId)?.current_price;
              const gap = p ? (a.priceUsd / p - 1) * 100 : null;
              return (
                <tr key={a.id}>
                  <Td left className="font-medium text-ink">{a.symbol.toUpperCase()}</Td>
                  <Td className="text-ink-2">{a.condition === 'above' ? 'Au-dessus de' : 'En dessous de'}</Td>
                  <Td>{fmtPrice(a.priceUsd * rate, currency)}</Td>
                  <Td>{p ? fmtPrice(p * rate, currency) : '—'}</Td>
                  <Td className="text-ink-2">{gap != null ? fmtPct(gap, 1) : '—'}</Td>
                  <Td>{a.triggeredAt ? <Badge tone="up">Déclenchée {fmtDate(a.triggeredAt)}</Badge> : a.active ? <Badge tone="accent">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                  <Td>
                    <span className="inline-flex">
                      {a.triggeredAt && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setNoteFor({ alertId: a.id, coinId: a.coinId, symbol: a.symbol })}>Noter</Button>
                          <Button size="sm" variant="ghost" onClick={() => upsert({ ...a, triggeredAt: undefined, active: true })}>Réarmer</Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} aria-label="Supprimer" onClick={() => remove(a.id)} />
                    </span>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}
      <p className="text-xs text-muted">Les alertes sont vérifiées toutes les 4 minutes tant que l’application est ouverte (notification système). Pour une surveillance 24 h/24, garde aussi des alertes sur ta plateforme d’échange.</p>
      {notes.length > 0 && (
        <Card title="Journal à chaud — ce que tu as fait, et pourquoi" subtitle={`${notes.length} note${notes.length > 1 ? 's' : ''} · la discipline se juge au moment de l'alerte, pas après coup`}>
          <ul className="divide-y divide-line">
            {notes.slice(0, 8).map((n) => (
              <li key={n.id} className="py-2">
                <div className="text-sm text-ink">
                  <Badge tone={n.action === 'buy' ? 'up' : n.action === 'sell' ? 'down' : n.action === 'wait' ? 'accent' : 'neutral'}>{ACTION_LABEL[n.action]}</Badge>
                  {n.symbol ? <span className="ml-2 font-medium">{n.symbol.toUpperCase()}</span> : null}
                  <span className="ml-2 text-xs text-muted">{fmtDate(n.date)}</span>
                </div>
                {n.note && <p className="mt-1 text-sm text-ink-2">{n.note}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <AlertModal open={open} onClose={() => setOpen(false)} />
      <HotNoteModal for={noteFor} onClose={() => setNoteFor(null)} />
    </div>
  );
}

const ACTION_LABEL: Record<'nothing' | 'buy' | 'sell' | 'partial' | 'wait', string> = {
  nothing: 'Rien fait', buy: 'Acheté', sell: 'Vendu', partial: 'Partiel', wait: 'Attendu',
};

/** Le journal à chaud : une alerte vient de se déclencher — note tout de suite ce que tu as fait et pourquoi. */
function HotNoteModal({ for: target, onClose }: { for: { alertId?: string; coinId?: string; symbol: string } | null; onClose: () => void }) {
  const upsertNote = useStore((s) => s.upsertHotNote);
  const [action, setAction] = useState<'nothing' | 'buy' | 'sell' | 'partial' | 'wait'>('wait');
  const [note, setNote] = useState('');
  useEffect(() => { setAction('wait'); setNote(''); }, [target]);
  if (!target) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Journal à chaud — ${target.symbol.toUpperCase()}`}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" onClick={() => {
        upsertNote({ id: uid(), alertId: target.alertId, coinId: target.coinId, symbol: target.symbol, date: isoDay(), action, note: note.trim(), createdAt: new Date().toISOString() });
        onClose();
      }}>Noter</Button></>}
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-2">L'alerte vient de sonner : note maintenant ce que tu en as fait. C'est cette note-là, pas ta mémoire de demain, qui dira si tu suis ton plan.</p>
        <Field label="Ce que j'ai fait">
          <Segmented value={action} onChange={setAction} options={[
            { value: 'wait', label: 'Attendu' },
            { value: 'buy', label: 'Acheté' },
            { value: 'sell', label: 'Vendu' },
            { value: 'partial', label: 'Partiel' },
            { value: 'nothing', label: 'Rien' },
          ]} />
        </Field>
        <Field label="Pourquoi" hint="Libre — ce que tu ressens compte aussi : c'est le journal, pas un examen.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="J'ai attendu parce que…" />
        </Field>
      </div>
    </Modal>
  );
}
