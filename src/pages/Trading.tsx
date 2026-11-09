import { Bell, Bot, Calculator, Pencil, Plus, Radar, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useCycle, useFx, useMarkets, useScan } from '../hooks/useMarket';
import { usePortfolio } from '../hooks/usePortfolio';
import { positionSize, tradePnl, tradeR, tradeStats } from '../lib/risk';
import { isStable, isWrappedOrStaked } from '../lib/portfolio';
import { SETUP_KEYS } from '../lib/signals';
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtPrice } from '../lib/format';
import { Link, setQuery, useHashPath } from '../router';
import {
  Badge, Banner, Button, Card, CoinIcon, Empty, Field, NumberInput, PageHeader, Segmented, Select, Spinner, Stat, Table, Td,
} from '../components/ui';
import { AlertModal, TradeModal } from '../components/forms';
import { LineChart } from '../components/LineChart';
import { AiProgress, NeedKey, ReportView, useAiConfig, useAiRunner } from '../components/AiBlocks';
import { useAiContext } from '../ai/context';
import { runJournalReview } from '../ai/tasks';
import type { TradeEntry } from '../types';

type Tab = 'calc' | 'scanner' | 'journal' | 'alertes';

export default function Trading() {
  const { query } = useHashPath();
  const tab = (query.get('tab') as Tab) || 'calc';
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Trading" subtitle="Calcule la bonne taille de position, repère les setups techniques, tiens ton journal et fais-toi coacher par l’IA. Règle n°1 : chaque trade a un stop." />
      <Segmented value={tab} onChange={(v) => setQuery({ tab: v })} options={[
        { value: 'calc', label: 'Calculateur' },
        { value: 'scanner', label: 'Scanner de setups' },
        { value: 'journal', label: 'Journal' },
        { value: 'alertes', label: 'Alertes de prix' },
      ]} />
      {tab === 'calc' && <SizeCalculator />}
      {tab === 'scanner' && <Scanner />}
      {tab === 'journal' && <Journal />}
      {tab === 'alertes' && <Alerts />}
    </div>
  );
}

function SizeCalculator() {
  const pf = usePortfolio();
  const rules = useStore((s) => s.profile.rules);
  const currency = useStore((s) => s.settings.currency);
  const [capital, setCapital] = useState<number | ''>(Math.round(pf.totals.value) || 1000);
  const [risk, setRisk] = useState<number | ''>(rules.riskPerTradePct);
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [entry, setEntry] = useState<number | ''>('');
  const [stop, setStop] = useState<number | ''>('');
  const [tp, setTp] = useState<number | ''>('');
  const [lev, setLev] = useState<number | ''>(1);
  const r = positionSize({ capital: Number(capital), riskPct: Number(risk), entry: Number(entry), stop: Number(stop), takeProfit: tp === '' ? undefined : Number(tp), leverage: Number(lev || 1), side });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={<span className="inline-flex items-center gap-2"><Calculator className="size-4 text-accent" />Taille de position</span>} subtitle="Combien acheter pour ne risquer qu’un petit pourcentage de ton capital si le stop est touché">
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Capital (${currency === 'EUR' ? '€' : '$'})`}><NumberInput value={capital} onChange={setCapital} /></Field>
          <Field label="Risque par trade (%)" hint={`Ton profil : ${rules.riskPerTradePct} %`}><NumberInput value={risk} onChange={setRisk} /></Field>
          <Field label="Sens"><Select value={side} onChange={(e) => setSide(e.target.value as 'long' | 'short')}><option value="long">Long (achat)</option><option value="short">Short</option></Select></Field>
          <Field label="Levier"><NumberInput value={lev} onChange={setLev} /></Field>
          <Field label="Prix d’entrée"><NumberInput value={entry} onChange={setEntry} /></Field>
          <Field label="Stop loss"><NumberInput value={stop} onChange={setStop} /></Field>
          <Field label="Objectif (facultatif)" className="col-span-2"><NumberInput value={tp} onChange={setTp} /></Field>
        </div>
      </Card>
      <Card title="Résultat">
        {!r ? <p className="text-sm text-muted">Renseigne un prix d’entrée et un stop cohérents (sous l’entrée pour un long, au-dessus pour un short).</p> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Quantité à acheter" value={fmtNum(r.quantity, 6)} />
              <Stat label="Taille de la position" value={fmtMoney(r.notional, currency, 0)} hint={Number(lev) > 1 ? `marge ${fmtMoney(r.margin, currency, 0)}` : undefined} />
              <Stat label="Perte si stop touché" value={<span className="text-down">{fmtMoney(r.riskAmount, currency, 0)}</span>} hint={`distance ${fmtNum(r.stopDistancePct, 2)} %`} />
              <Stat label="Ratio gain / risque" value={r.rr != null ? `${fmtNum(r.rr, 2)} R` : '—'} hint={r.potentialGain != null ? `gain ${fmtMoney(r.potentialGain, currency, 0)}` : undefined} />
            </div>
            {r.liquidationPrice != null && <p className="text-sm text-ink-2">Prix de liquidation estimé : <span className="tnum font-medium text-ink">{fmtNum(r.liquidationPrice, 6)}</span></p>}
            <p className="text-xs text-muted">Frais estimés (0,1 % par côté) : {fmtMoney(r.fees, currency, 2)}</p>
            {r.warnings.map((w, i) => <Banner key={i} tone="warn">{w}</Banner>)}
            <Banner tone="info">Avec 1 % de risque par trade, il faut 10 pertes d’affilée pour perdre ~10 % du capital. C’est ce qui permet de durer.</Banner>
          </div>
        )}
      </Card>
    </div>
  );
}

function Scanner() {
  const markets = useMarkets();
  const cycle = useCycle();
  const currency = useStore((s) => s.settings.currency);
  const fx = useFx();
  const rate = currency === 'EUR' ? fx : 1;
  const [size, setSize] = useState(100);
  const [filter, setFilter] = useState<string>('bull');
  const [preset, setPreset] = useState<Partial<TradeEntry> | null>(null);
  const coins = useMemo(() => (markets.data ?? []).filter((m) => !isStable(m.symbol, m.id) && !isWrappedOrStaked(m.symbol, m.name, m.id)).slice(0, size), [markets.data, size]);
  const scan = useScan(coins, cycle.data?.temperature);

  const rows = useMemo(() => coins.flatMap((m) => {
    const a = scan.data?.get(m.id);
    if (!a) return [];
    return a.setups
      .filter((s) => filter === 'all' || (filter === 'bull' ? s.bias === 'bull' : filter === 'bear' ? s.bias === 'bear' : s.key === filter))
      .map((s) => ({ m, a, s }));
  }), [coins, scan.data, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Univers"><Select value={size} onChange={(e) => setSize(Number(e.target.value))}><option value={50}>Top 50</option><option value={100}>Top 100</option><option value={150}>Top 150</option></Select></Field>
        <Field label="Setup"><Select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="bull">Tous les setups haussiers</option>
          <option value="bear">Tous les signaux baissiers</option>
          <option value="all">Tout</option>
          {Object.entries(SETUP_KEYS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select></Field>
      </div>
      {scan.isLoading && <Spinner label={`Analyse de ${coins.length} cryptos sur données journalières…`} />}
      {!scan.isLoading && !rows.length && <Empty icon={<Radar className="size-8" />} title="Aucun setup pour ce filtre">Les setups apparaissent et disparaissent avec le marché : reviens plus tard ou élargis le filtre.</Empty>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ m, a, s }) => (
          <div key={`${m.id}-${s.key}`} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              <CoinIcon src={m.image} symbol={m.symbol} size={28} />
              <Link to={`/coin/${m.id}`} className="min-w-0 flex-1 truncate font-medium text-ink hover:underline">{m.name} <span className="text-muted">{m.symbol.toUpperCase()}</span></Link>
              <Badge tone={s.bias === 'bull' ? 'up' : 'down'}>{s.label}</Badge>
            </div>
            <p className="mt-2 text-sm text-ink-2">{s.detail}</p>
            {a.plan && s.bias === 'bull' && (
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-2.5 text-xs">
                <div><div className="text-muted">Entrée</div><div className="tnum text-ink">{fmtPrice(a.plan.entry * rate, currency)}</div></div>
                <div><div className="text-muted">Stop</div><div className="tnum text-down">{fmtPrice(a.plan.stop * rate, currency)}</div></div>
                <div><div className="text-muted">Objectif 1</div><div className="tnum text-up">{fmtPrice(a.plan.tp1 * rate, currency)}</div></div>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>Trader : {a.trader.label} ({a.trader.score > 0 ? '+' : ''}{a.trader.score}) · RSI {Math.round(a.rsi14)}</span>
              {a.plan && s.bias === 'bull' && <Button size="sm" variant="ghost" onClick={() => setPreset({ coinId: m.id, symbol: m.symbol, entryPrice: Math.round(a.plan!.entry * 1e6) / 1e6, stopLoss: Math.round(a.plan!.stop * 1e6) / 1e6, takeProfit: Math.round(a.plan!.tp1 * 1e6) / 1e6, setup: s.label })}>Journaliser</Button>}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">Niveaux en {currency === 'EUR' ? 'euros (convertis)' : 'dollars'} calculés avec l’ATR 14 jours et les supports récents. Un setup n’est pas une garantie : c’est une situation où la probabilité est légèrement en ta faveur.</p>
      <TradeModal open={!!preset} preset={preset} onClose={() => setPreset(null)} />
    </div>
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Trades clôturés" value={stats.closed} hint={`${stats.open} ouvert(s)`} />
        <Stat label="Taux de réussite" value={`${fmtNum(stats.winRate, 0)} %`} hint={`${stats.wins} gagnants / ${stats.losses} perdants`} />
        <Stat label="P&L total ($)" value={<span className={stats.totalPnl >= 0 ? 'text-up' : 'text-down'}>{fmtMoney(stats.totalPnl, 'USD', 0)}</span>} hint={`espérance ${fmtMoney(stats.expectancy, 'USD', 0)}/trade`} />
        <Stat label="R moyen · profit factor" value={`${stats.avgR != null ? fmtNum(stats.avgR, 2) : '—'} · ${stats.profitFactor != null ? fmtNum(stats.profitFactor, 2) : '—'}`} />
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
  const currency = useStore((s) => s.settings.currency);
  const fx = useFx();
  const rate = currency === 'EUR' ? fx : 1;
  const markets = useMarkets();
  const [open, setOpen] = useState(false);
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
                      {a.triggeredAt && <Button size="sm" variant="ghost" onClick={() => upsert({ ...a, triggeredAt: undefined, active: true })}>Réarmer</Button>}
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
      <AlertModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
