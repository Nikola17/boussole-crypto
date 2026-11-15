// Autopilotes : création, détail (courbe, ordres, verdict de confiance), classement, règles de confiance.

import { useMemo, useState } from 'react';
import { Bot, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { usePaperCloses, usePaperPrices } from '../../hooks/usePaperData';
import { useMarkets } from '../../hooks/useMarket';
import { useCryptoComListing } from '../../hooks/useCryptoCom';
import { appSources } from '../../hooks/useAutopilot';
import { STRATEGIES } from '../../lib/lab/strategies';
import { autoState } from '../../lib/lab/autoState';
import { autoEquitySeries, benchP10, dcaReferenceFromCloses, logsToFills } from '../../lib/lab/autoView';
import { DEFAULT_TRUST_RULES, trustVerdict, type TrustRules, type TrustVerdict } from '../../lib/lab/trust';
import { MAX_ACTIVE_AUTOPILOTS, newAutopilot } from '../../lib/lab/autopilotFactory';
import { COST_PRESETS, repriceWithCosts } from '../../lib/lab/paperBook';
import { maxDrawdownPct, twr, type DayPoint } from '../../lib/lab/metrics';
import { simulate } from '../../lib/lab/sim';
import { makeAsset, toSymbol } from '../../lib/lab/universe';
import { idbGet, idbPut } from '../../lib/idb';
import { rulesOf } from '../../lib/profile';
import { fmtDate, fmtNum, fmtPrice, isoDay } from '../../lib/format';
import { Badge, Banner, Button, Card, Empty, Field, Modal, NumberInput, Segmented, Stat } from '../../components/ui';
import { EquityChart } from './EquityChart';
import { btcReference } from './Portfolios';
import benchFile from '../../data/strategies-bench.json';
import type { PaperDayLog, PaperPortfolio } from '../../types';

const pct = (x: number | null | undefined) => (x != null && Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${fmtNum(x)} %` : '—');
const DAY_SHORT = ['', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const LEVEL_TONE: Record<TrustVerdict['level'], 'neutral' | 'down' | 'accent' | 'up' | 'warn'> = { observation: 'neutral', insuffisant: 'down', encourageant: 'accent', fiable: 'up', 'retirée': 'warn' };
const LEVEL_LABEL: Record<TrustVerdict['level'], string> = { observation: 'En observation', insuffisant: 'Insuffisant', encourageant: 'Encourageant', fiable: 'Fiable jusqu’ici', 'retirée': 'Confiance retirée' };

export function useTrustRules(): TrustRules {
  const custom = useStore((s) => s.profile.trustRules);
  return useMemo(() => ({ ...DEFAULT_TRUST_RULES, ...(custom ?? {}) }), [custom]);
}

/** Tout ce qu'affiche un autopilote, calculé depuis ses journaux et les clôtures. */
export function useAutopilotView(p: PaperPortfolio) {
  const allDays = useStore((s) => s.paperDays);
  const rules = useTrustRules();
  const logs = useMemo(() => allDays.filter((l) => l.portfolioId === p.id).sort((a, b) => a.day.localeCompare(b.day)), [allDays, p.id]);
  const coins = useMemo(() => [{ coinId: 'bitcoin', symbol: 'btc' }, ...[...new Map(logs.flatMap((l) => l.fills).map((f) => [f.coinId, { coinId: f.coinId, symbol: f.symbol }])).values()]], [logs]);
  const closes = usePaperCloses(coins);
  const strategy = p.strategyId ? STRATEGIES[p.strategyId] : undefined;
  const from = p.liveSince ?? p.createdAt.slice(0, 10);
  const today = isoDay();
  return useMemo(() => {
    const state = autoState(p, logs);
    if (!closes.data || !strategy) return { logs, state, series: [] as DayPoint[], reference: null as DayPoint[] | null, verdict: null as TrustVerdict | null, strategy, appPerf: null as number | null };
    const series = from <= today ? autoEquitySeries(p, logs, closes.data, from, today) : [];
    const btc = closes.data.get('bitcoin');
    const reference = strategy.kind === 'deposits'
      ? (btc ? dcaReferenceFromCloses(series.filter((x) => x.flowUsd > 0).map((x) => ({ day: x.day, usd: x.flowUsd })), btc, p.costs) : null)
      : btcReference(p.startingUsd, from, btc, p.costs);
    const fills = logsToFills(logs);
    const p10 = benchP10(strategy.id, series.length);
    const input = { kind: strategy.kind, seed: p.id, fills, reference, bench: p10 != null ? { p10 } : null, today };
    const previous = series.length > 1 ? trustVerdict({ ...input, live: series.slice(0, -1) }, rules) : null;
    const verdict = strategy.id === 'dca-btc' ? null : trustVerdict({ ...input, live: series, previous }, rules);
    const deposits = logs.reduce((s, l) => s + l.depositUsd, 0);
    const invested = p.startingUsd + deposits;
    const last = series[series.length - 1]?.valueUsd ?? null;
    const lastPrices = new Map([...closes.data.entries()].map(([id, m]) => [id, [...m.values()].pop() ?? 0]));
    const app = invested > 0 ? repriceWithCosts(fills.map((f) => ({ coinId: f.coinId, side: f.side, quantity: f.quantity, marketUsd: f.marketUsd })), invested, COST_PRESETS.app, lastPrices) : null;
    const appPerf = app != null && last != null && invested > 0 ? ((app / invested) - 1) * 100 : null;
    return { logs, state, series, reference, verdict, strategy, appPerf };
  }, [p, logs, closes.data, strategy, from, today, rules]);
}

function TrustPanel({ v, appPerf, perf }: { v: TrustVerdict | null; appPerf: number | null; perf: number | null }) {
  if (!v) return <Banner tone="info" title="Référence">Ce portefeuille sert de référence aux autres : il n’a pas de verdict.</Banner>;
  return (
    <Card title={<span className="inline-flex items-center gap-2">Confiance : <Badge tone={LEVEL_TONE[v.level]}>{LEVEL_LABEL[v.level]}</Badge></span>} subtitle={v.headline}>
      <ul className="space-y-1 text-sm">
        {v.criteria.map((c) => <li key={c.id} className="flex gap-2"><span className={c.ok ? 'text-good' : c.ok === false ? 'text-critical' : 'text-muted'}>{c.ok ? '✓' : c.ok === false ? '✗' : '…'}</span><span className="text-ink-2">{c.text}</span></li>)}
      </ul>
      {appPerf != null && perf != null && <p className="mt-2 text-xs text-muted">Avec les frais d’une application grand public : {pct(appPerf)} au lieu de {pct(perf)}.</p>}
      {v.copyPct != null && <p className="mt-2 text-sm text-ink-2">Si tu copies : au plus {v.copyPct} % de ton portefeuille réel, avec le risque par trade de ton profil.</p>}
    </Card>
  );
}

function orderLine(f: PaperDayLog['fills'][number]): string {
  return `${f.side === 'buy' ? 'ACHAT' : 'VENTE'} ${f.symbol.toUpperCase()} : ${fmtNum(f.quantity * f.priceUsd)} USDC à ≈ ${fmtPrice(f.marketUsd, 'USD')} — ${f.reason}${f.stop != null ? ` · stop ${fmtPrice(f.stop, 'USD')}` : ''}${f.target != null ? ` · objectif ${fmtPrice(f.target, 'USD')}` : ''}`;
}

export function AutopilotDetail({ p, onBack }: { p: PaperPortfolio; onBack: () => void }) {
  const v = useAutopilotView(p);
  const upsert = useStore((s) => s.upsertPaperPortfolio);
  const remove = useStore((s) => s.removePaperPortfolio);
  const markets = useMarkets();
  const cdc = useCryptoComListing();
  const profile = useStore((s) => s.profile);
  const prices = usePaperPrices(Object.keys(v.state.positions));
  const [ask, setAsk] = useState(false);
  const [sim, setSim] = useState<DayPoint[] | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const last = v.series[v.series.length - 1];
  const perf = v.series.length > 1 ? twr(v.series) * 100 : null;
  const refPerf = v.reference && v.reference.length > 1 ? twr(v.reference) * 100 : null;

  async function runSim() {
    if (!v.strategy?.replayable) return;
    setSimBusy(true);
    try {
      const cached = await idbGet<DayPoint[]>(`sim:${p.id}`);
      if (cached) { setSim(cached); return; }
      const src = await appSources(markets.data ?? [], cdc.data ?? null, rulesOf(profile));
      const uni = await src.universe();
      const assets = [];
      for (const u of [...uni, { coinId: 'bitcoin' }]) {
        const cs = await src.daily(u.coinId);
        if (cs.length) assets.push(makeAsset(toSymbol(u.coinId), cs));
      }
      const btc = assets.find((a) => a.id === 'BTC');
      if (!btc) return;
      const temperature = new Map([...btc.dayIndex.keys()].map((d) => [d, src.temperatureAt(d)] as const).filter((x): x is [string, number] => x[1] != null));
      const to = (p.liveSince ?? isoDay());
      const from = new Date(Date.parse(`${to}T00:00:00Z`) - 365 * 86400_000).toISOString().slice(0, 10);
      const r = simulate(v.strategy, { ...v.strategy.defaults, ...(p.params ?? {}) }, { assets: [...new Map(assets.map((a) => [a.id, a])).values()], temperature, btcId: 'BTC' }, { startCashUsd: p.startingUsd, costs: p.costs, fill: 'nextOpen', from, to, minOrderUsd: 5 });
      await idbPut(`sim:${p.id}`, r.series);
      setSim(r.series);
    } finally {
      setSimBusy(false);
    }
  }

  const merged = sim ? [...sim.filter((x) => x.day < (p.liveSince ?? '')), ...v.series] : v.series;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>← Portefeuilles</Button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">{p.name}</h2>
        <Badge tone="accent">Autopilote</Badge>
        <Button size="sm" variant="ghost" onClick={() => upsert({ ...p, paused: !p.paused })}>{p.paused ? 'Reprendre' : 'Mettre en pause'}</Button>
        <Button size="sm" variant="ghost" onClick={() => { upsert({ ...p, archived: true }); onBack(); }}>Archiver</Button>
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setAsk(true)}>Supprimer</Button>
      </div>
      <p className="text-sm text-ink-2">{v.strategy?.describe} Règles {p.rules} · exécution chaque jour à {p.executionHour ?? 8} h ({p.timeZone ?? 'Europe/Paris'}) · en direct depuis le {fmtDate(p.liveSince ?? p.createdAt)}.</p>
      {p.archived && <Banner tone="warn">Portefeuille archivé : il ne reçoit plus d’ordres.</Banner>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Valeur" value={last ? `${fmtNum(last.valueUsd)} USDC` : '—'} hint={`cash ${fmtNum(v.state.cashUsd)} USDC`} />
        <Stat label="Performance (en direct)" value={<span className={(perf ?? 0) >= 0 ? 'text-good' : 'text-critical'}>{pct(perf)}</span>} hint={refPerf != null ? `référence ${pct(refPerf)}` : undefined} />
        <Stat label="Baisse maximale" value={v.series.length > 1 ? `${fmtNum(maxDrawdownPct(v.series))} %` : '—'} />
        <Stat label="Positions" value={Object.keys(v.state.positions).length} hint={Object.values(v.state.positions).map((x) => x.symbol.toUpperCase()).join(', ') || 'aucune'} />
      </div>
      <TrustPanel v={v.verdict} appPerf={v.appPerf} perf={perf} />
      <Card title="Courbe" subtitle={sim ? 'Pointillé : ce qu’elle aurait fait sur l’année précédente (simulation) ; trait plein : en direct' : 'En direct, frais compris'}
        actions={v.strategy?.replayable && !sim ? <Button size="sm" loading={simBusy} onClick={() => void runSim()}>Montrer ce qu’elle aurait fait depuis un an</Button> : null}>
        {merged.length > 1 ? <EquityChart series={merged} reference={v.reference} liveSince={sim ? p.liveSince : undefined} /> : <p className="text-sm text-muted">Démarre {p.liveSince ? `le ${fmtDate(p.liveSince)}` : 'demain'} à {p.executionHour ?? 8} h : la courbe apparaîtra après deux jours.</p>}
        {sim && <p className="mt-1 text-xs text-muted">Une simulation flatte toujours un peu : seul le direct compte pour la confiance.</p>}
      </Card>
      <Card title="Ordres de l’autopilote" subtitle="Les plus récents d’abord">
        {v.logs.length === 0 ? <p className="text-sm text-muted">Aucun ordre pour l’instant.</p> : (
          <ul className="divide-y divide-line">
            {[...v.logs].reverse().slice(0, 30).map((l) => (
              <li key={l.id} className="py-2 text-sm">
                <div className="text-xs text-muted">{fmtDate(l.day)}{l.depositUsd ? ` · apport ${fmtNum(l.depositUsd)} USDC` : ''}{l.lateDays ? ` · exécuté avec ${l.lateDays} jour${l.lateDays > 1 ? 's' : ''} de retard` : ''}</div>
                {l.fills.map((f, k) => <div key={k} className="text-ink">{f.kind === 'stop' ? 'STOP TOUCHÉ · ' : f.kind === 'target' ? 'OBJECTIF ATTEINT · ' : ''}{orderLine(f)}</div>)}
                {l.skipped.map((x, k) => <div key={`s${k}`} className="text-xs text-muted">{x.symbol} : {x.why}</div>)}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {Object.keys(v.state.positions).length > 0 && (
        <Card title="Positions">
          <ul className="divide-y divide-line text-sm">
            {Object.values(v.state.positions).map((x) => {
              const px = prices.get(x.coinId);
              return <li key={x.coinId} className="flex justify-between py-1.5"><span className="text-ink">{x.symbol.toUpperCase()} · {fmtNum(x.quantity, 6)}{x.stop != null ? ` · stop ${fmtPrice(x.stop, 'USD')}` : ''}</span><span className="tnum text-ink-2">{px != null ? `${fmtPrice(x.quantity * px, 'USD')} (${pct(((x.quantity * px) / x.costUsd - 1) * 100)})` : 'prix inconnu'}</span></li>;
            })}
          </ul>
        </Card>
      )}
      <Modal open={ask} onClose={() => setAsk(false)} title="Supprimer cet autopilote ?" footer={<><Button variant="ghost" onClick={() => setAsk(false)}>Annuler</Button><Button variant="primary" onClick={() => { remove(p.id); onBack(); }}>Supprimer</Button></>}>
        <p className="text-sm text-ink-2">Ses journaux et son historique seront supprimés sur tous tes appareils. Ton vrai portefeuille n’est pas concerné.</p>
      </Modal>
    </div>
  );
}

function AutopilotTile({ p, onOpen }: { p: PaperPortfolio; onOpen: () => void }) {
  const v = useAutopilotView(p);
  const perf = v.series.length > 1 ? twr(v.series) * 100 : null;
  return (
    <button type="button" onClick={onOpen} className="rounded-xl border border-line bg-surface p-4 text-left hover:bg-surface-2">
      <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-medium text-ink">{p.name}</span>{v.verdict ? <Badge tone={LEVEL_TONE[v.verdict.level]}>{LEVEL_LABEL[v.verdict.level]}</Badge> : <Badge>Référence</Badge>}</div>
      <div className="tnum mt-1 text-lg font-semibold text-ink">{v.series.length ? `${fmtNum(v.series[v.series.length - 1].valueUsd)} USDC` : 'démarre bientôt'}</div>
      <div className="text-xs text-muted">{pct(perf)} en direct{p.paused ? ' · en pause' : ''}</div>
    </button>
  );
}

type BenchRun = { fill: string; costs: string; twrPerYearPct: number; maxDrawdownPct: number; referenceTwrPct: number; twrPct: number };
function benchLine(id: string): string | null {
  const e = (benchFile as { entries: Record<string, { runs: BenchRun[] }> }).entries[id];
  const r = e?.runs.find((x) => x.fill === 'nextOpen' && x.costs === 'exchange');
  if (!r) return null;
  const ref = (benchFile as { entries: Record<string, { runs: BenchRun[] }> }).entries['dca-btc']?.runs.find((x) => x.fill === 'nextOpen' && x.costs === 'exchange');
  return `De 2019 à ${(benchFile as { dataThrough: string }).dataThrough.slice(0, 4)} : ${pct(r.twrPerYearPct)} par an, pire baisse ${fmtNum(r.maxDrawdownPct)} %.${ref && id !== 'dca-btc' ? ` DCA Bitcoin simple : ${pct(ref.twrPerYearPct)} par an, pire baisse ${fmtNum(ref.maxDrawdownPct)} %.` : ''}`;
}

function AutopilotWizard({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const upsert = useStore((s) => s.upsertPaperPortfolio);
  const portfolios = useStore((s) => s.paperPortfolios);
  const basket = useStore((s) => s.basket);
  const active = portfolios.filter((p) => p.kind === 'auto' && !p.archived).length;
  const [sid, setSid] = useState('dca-boussole');
  const [capital, setCapital] = useState<number | ''>(1000);
  const [amount, setAmount] = useState<number | ''>(25);
  const [daysOfWeek, setDays] = useState<number[]>([2, 5]);
  const [preset, setPreset] = useState<'exchange' | 'app'>('exchange');
  const [hour, setHour] = useState<number | ''>(8);
  const s = STRATEGIES[sid];
  const deposits = s?.kind === 'deposits';
  const full = active >= MAX_ACTIVE_AUTOPILOTS;
  function create() {
    if (!s || full) return;
    const params = deposits ? { ...s.defaults, amountUsd: Number(amount) || 25, daysOfWeek } : { ...s.defaults };
    const p = newAutopilot({ strategyId: sid, name: s.label, startingUsd: deposits ? 0 : Number(capital) || 1000, params, costs: { preset, ...COST_PRESETS[preset] }, executionHour: Number(hour) || 8 }, Date.now());
    upsert(p);
    onCreated(p.id);
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title="Nouvel autopilote" wide footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" disabled={full} onClick={create}>Démarrer demain à {Number(hour) || 8} h</Button></>}>
      <div className="space-y-3">
        {full && <Banner tone="warn">{MAX_ACTIVE_AUTOPILOTS} autopilotes actifs au plus : archive-en un d’abord.</Banner>}
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.values(STRATEGIES).map((x) => (
            <button key={x.id} type="button" onClick={() => setSid(x.id)} className={`rounded-lg border p-3 text-left text-sm ${sid === x.id ? 'border-accent bg-accent/10' : 'border-line'}`}>
              <div className="font-medium text-ink">{x.label}</div>
              <div className="mt-1 text-xs text-ink-2">{x.describe}</div>
              <div className="mt-1 text-xs text-muted">{benchLine(x.id) ?? (x.replayable ? 'Pas encore mesurée sur l’historique.' : 'Non rejouable sur l’historique : sa sélection dépend de données du jour.')}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Une simulation flatte toujours un peu : seul le direct compte pour la confiance.</p>
        {deposits ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Montant par échéance (USDC)"><NumberInput value={amount} onChange={setAmount} /></Field>
              <Field label="Heure d’exécution (heure de Paris)"><NumberInput value={hour} onChange={setHour} /></Field>
            </div>
            <div className="flex flex-wrap gap-1">{[1, 2, 3, 4, 5, 6, 7].map((n) => <button key={n} type="button" onClick={() => setDays(daysOfWeek.includes(n) ? daysOfWeek.filter((x) => x !== n) : [...daysOfWeek, n].sort())} className={`rounded-md border px-2.5 py-1 text-sm ${daysOfWeek.includes(n) ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-2'}`}>{DAY_SHORT[n]}</button>)}</div>
            {basket && <Button size="sm" variant="ghost" onClick={() => { setAmount(basket.amountUsd); setDays([...basket.daysOfWeek]); }}>Reprendre les réglages de mon panier</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Capital de départ (USDC)"><NumberInput value={capital} onChange={setCapital} /></Field>
            <Field label="Heure d’exécution (heure de Paris)"><NumberInput value={hour} onChange={setHour} /></Field>
          </div>
        )}
        <Field label="Frais simulés"><Segmented value={preset} onChange={setPreset} options={[{ value: 'exchange', label: 'Plateforme d’échange' }, { value: 'app', label: 'Application' }]} /></Field>
      </div>
    </Modal>
  );
}

export function AutopilotCards({ open }: { open: (id: string) => void }) {
  const portfolios = useStore((s) => s.paperPortfolios);
  const autos = useMemo(() => portfolios.filter((p) => p.kind === 'auto' && !p.archived), [portfolios]);
  const archived = useMemo(() => portfolios.filter((p) => p.kind === 'auto' && p.archived), [portfolios]);
  const [wizard, setWizard] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-sm font-medium text-ink-2">Autopilotes</h2><Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setWizard(true)}>Nouvel autopilote</Button></div>
      {autos.length === 0 ? <Empty icon={<Bot className="size-8" />} title="Aucun autopilote">Un autopilote suit seul une stratégie de Boussole sur un portefeuille papier : tu sauras si elle mérite ta confiance avant d’y mettre un euro.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{autos.map((p) => <AutopilotTile key={p.id} p={p} onOpen={() => open(p.id)} />)}</div>
      )}
      {archived.length > 0 && <details className="text-xs text-muted"><summary className="cursor-pointer">Archivés ({archived.length})</summary><ul className="mt-1 space-y-1">{archived.map((p) => <li key={p.id}><button type="button" className="text-accent hover:underline" onClick={() => open(p.id)}>{p.name}</button></li>)}</ul></details>}
      <AutopilotWizard open={wizard} onClose={() => setWizard(false)} onCreated={open} />
    </div>
  );
}

function windowPerf(series: DayPoint[], days: number): number | null {
  if (series.length <= days) return null;
  return twr(series.slice(-days - 1)) * 100;
}

function LeaderRow({ p }: { p: PaperPortfolio }) {
  const v = useAutopilotView(p);
  const all = v.series.length > 1 ? twr(v.series) * 100 : null;
  const ref = v.reference && v.reference.length > 1 ? twr(v.reference) * 100 : null;
  return (
    <li className="grid grid-cols-2 gap-x-3 gap-y-1 py-2.5 text-sm md:grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))_auto] md:items-center">
      <span className="col-span-2 font-medium text-ink md:col-span-1">{p.name}</span>
      <span className="text-ink-2"><span className="text-xs text-muted md:hidden">30 j </span>{pct(windowPerf(v.series, 30))}</span>
      <span className="text-ink-2"><span className="text-xs text-muted md:hidden">90 j </span>{pct(windowPerf(v.series, 90))}</span>
      <span className="text-ink-2"><span className="text-xs text-muted md:hidden">180 j </span>{pct(windowPerf(v.series, 180))}</span>
      <span className="text-ink"><span className="text-xs text-muted md:hidden">Direct </span>{pct(all)}</span>
      <span className="text-ink-2"><span className="text-xs text-muted md:hidden">Pire baisse </span>{v.series.length > 1 ? `${fmtNum(maxDrawdownPct(v.series))} %` : '—'}</span>
      <span className="text-ink-2"><span className="text-xs text-muted md:hidden">vs Bitcoin </span>{all != null && ref != null ? `${all - ref >= 0 ? '+' : ''}${fmtNum(all - ref)} pts` : '—'}</span>
      <span>{v.verdict ? <Badge tone={LEVEL_TONE[v.verdict.level]}>{LEVEL_LABEL[v.verdict.level]}</Badge> : <Badge>Référence</Badge>}</span>
    </li>
  );
}

function TrustRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setProfile = useStore((s) => s.setProfile);
  const rules = useTrustRules();
  const [draft, setDraft] = useState<TrustRules>(rules);
  const fields: [keyof TrustRules, string][] = [['minDays', 'Jours en direct'], ['minTrades', 'Trades clos'], ['minDeposits', 'Échéances'], ['maxDrawdownPct', 'Baisse maximale (%)'], ['maxExtraDrawdownPts', 'Baisse de plus que la référence (points)'], ['minWindowWinPct', 'Périodes de 30 j gagnées (%)'], ['withdrawGapPts', 'Retard sur 60 j qui retire la confiance (points)'], ['copyPct', 'Taille conseillée, encourageant (%)'], ['copyPctTrusted', 'Taille conseillée, fiable (%)']];
  return (
    <Modal open={open} onClose={onClose} title="Règles de confiance" footer={<><Button variant="ghost" onClick={() => { setProfile({ trustRules: undefined }); onClose(); }}>Valeurs par défaut</Button><Button variant="primary" onClick={() => { setProfile({ trustRules: draft }); onClose(); }}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-3">{fields.map(([k, label]) => <Field key={k} label={label}><NumberInput value={draft[k]} onChange={(x) => setDraft({ ...draft, [k]: x === '' ? DEFAULT_TRUST_RULES[k] : x })} /></Field>)}</div>
      <p className="mt-2 text-xs text-muted">Ces seuils décident quand un autopilote passe « encourageant » puis « fiable ». Les baisser rend la confiance plus facile à obtenir, pas plus méritée.</p>
    </Modal>
  );
}

export function LeaderboardTab() {
  const portfolios = useStore((s) => s.paperPortfolios);
  const autos = useMemo(() => portfolios.filter((p) => p.kind === 'auto' && !p.archived), [portfolios]);
  const [rulesOpen, setRulesOpen] = useState(false);
  return (
    <Card title="Classement des autopilotes" subtitle="Résultats en direct, frais compris ; « vs Bitcoin » : écart avec la même mise ou les mêmes apports en Bitcoin" actions={<Button size="sm" variant="ghost" onClick={() => setRulesOpen(true)}>Règles de confiance</Button>}>
      {autos.length === 0 ? <p className="text-sm text-muted">Aucun autopilote actif. Crée-en un dans l’onglet Portefeuilles papier.</p> : (
        <>
          <div className="hidden border-b border-line pb-1 text-xs text-muted md:grid md:grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))_auto] md:gap-x-3"><span>Autopilote</span><span>30 j</span><span>90 j</span><span>180 j</span><span>En direct</span><span>Pire baisse</span><span>vs Bitcoin</span><span>Verdict</span></div>
          <ul className="divide-y divide-line">{autos.map((p) => <LeaderRow key={p.id} p={p} />)}</ul>
        </>
      )}
      <TrustRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </Card>
  );
}

/** Carte du Cockpit : les ordres du jour de chaque autopilote et son verdict. */
export function AutopilotSummary({ p }: { p: PaperPortfolio }) {
  const v = useAutopilotView(p);
  const lastLog = v.logs.filter((l) => l.fills.length).pop();
  return (
    <li className="py-2 text-sm">
      <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-medium text-ink">{p.name}</span>{v.verdict ? <Badge tone={LEVEL_TONE[v.verdict.level]}>{LEVEL_LABEL[v.verdict.level]}</Badge> : <Badge>Référence</Badge>}</div>
      {lastLog ? <div className="text-xs text-ink-2">{fmtDate(lastLog.day)} : {lastLog.fills.slice(0, 2).map((f) => `${f.side === 'buy' ? 'achat' : 'vente'} ${f.symbol.toUpperCase()}`).join(', ')}{lastLog.fills.length > 2 ? '…' : ''}</div> : <div className="text-xs text-muted">Pas encore d’ordre.</div>}
      {v.verdict && <div className="text-xs text-muted">{v.verdict.headline}</div>}
    </li>
  );
}

export function useActiveAutopilots(): PaperPortfolio[] {
  const portfolios = useStore((s) => s.paperPortfolios);
  return useMemo(() => portfolios.filter((p) => p.kind === 'auto' && !p.archived), [portfolios]);
}

