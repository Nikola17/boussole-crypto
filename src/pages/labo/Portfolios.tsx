// Portefeuilles papier : la liste, la création, et le détail d'un portefeuille manuel (positions, ordres en
// attente, historique, statistiques, ticket d'ordre). Les autopilotes ont leur propre détail (AutopilotDetail).

import { useMemo, useState } from 'react';
import { FlaskConical, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { usePaperCloses, usePaperPrices } from '../../hooks/usePaperData';
import { bookOf, COST_PRESETS, repriceWithCosts, tradesOf } from '../../lib/lab/paperBook';
import { paperEquitySeries, tradesToFills } from '../../lib/lab/equity';
import { closedTrades, maxDrawdownPct, tradeStatsOf, type DayPoint } from '../../lib/lab/metrics';
import { fmtDate, fmtNum, fmtPrice, isoDay, uid } from '../../lib/format';
import { Badge, Banner, Button, Card, Empty, Field, Input, Modal, NumberInput, Segmented, Stat, Table, Td } from '../../components/ui';
import { EquityChart } from './EquityChart';
import { OrderTicket } from './OrderTicket';
import type { PaperPortfolio } from '../../types';

const pct = (x: number | null | undefined) => (x != null && Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${fmtNum(x)} %` : '—');

/** Valeur actuelle d'un portefeuille manuel ; null si une position n'a pas de prix. */
export function useManualValue(p: PaperPortfolio) {
  const allTrades = useStore((s) => s.paperTrades);
  const trades = useMemo(() => tradesOf(allTrades, p.id), [allTrades, p.id]);
  const book = useMemo(() => bookOf(p, trades), [p, trades]);
  const prices = usePaperPrices(Object.keys(book.positions));
  let value: number | null = book.cashUsd;
  for (const pos of Object.values(book.positions)) {
    const px = prices.get(pos.coinId);
    value = px != null && value != null ? value + pos.quantity * px : null;
  }
  return { trades, book, prices, value };
}

/** Référence : la mise de départ en Bitcoin le jour de la création, valorisée aux clôtures. */
export function btcReference(startingUsd: number, from: string, btc: Map<string, number> | undefined, costs: { feePct: number; spreadPct: number }): DayPoint[] | null {
  if (!btc) return null;
  const days = [...btc.keys()].filter((d) => d >= from).sort();
  const p0 = btc.get(days[0]);
  if (!p0) return null;
  const qty = (startingUsd * (1 - costs.feePct / 100)) / (p0 * (1 + costs.spreadPct / 100));
  return days.map((day) => ({ day, valueUsd: qty * (btc.get(day) ?? 0), cashUsd: 0, flowUsd: 0 }));
}

function ManualCard({ p, onOpen }: { p: PaperPortfolio; onOpen: () => void }) {
  const { value } = useManualValue(p);
  return (
    <button type="button" onClick={onOpen} className="rounded-xl border border-line bg-surface p-4 text-left hover:bg-surface-2">
      <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-medium text-ink">{p.name}</span><Badge>Manuel</Badge></div>
      <div className="tnum mt-1 text-lg font-semibold text-ink">{value != null ? `${fmtNum(value)} USDC` : 'prix inconnu'}</div>
      <div className="text-xs text-muted">{value != null ? pct(((value / p.startingUsd) - 1) * 100) : '—'} depuis le {fmtDate(p.createdAt)}</div>
    </button>
  );
}

function NewPortfolioModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const upsert = useStore((s) => s.upsertPaperPortfolio);
  const [name, setName] = useState('Mon test');
  const [capital, setCapital] = useState<number | ''>(1000);
  const [preset, setPreset] = useState<'exchange' | 'app' | 'custom'>('exchange');
  const [fee, setFee] = useState<number | ''>(0.1);
  const [spread, setSpread] = useState<number | ''>(0.05);
  const valid = name.trim() && Number(capital) > 0;
  function create() {
    const costs = preset === 'custom' ? { preset, feePct: Number(fee) || 0, spreadPct: Number(spread) || 0 } : { preset, ...COST_PRESETS[preset] };
    const id = uid();
    upsert({ id, name: name.trim(), kind: 'manual', startingUsd: Number(capital), createdAt: new Date().toISOString(), costs });
    onCreated(id);
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title="Nouveau portefeuille papier" footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!valid} onClick={create}>Créer</Button></>}>
      <div className="space-y-3">
        <Field label="Nom"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Capital de départ (USDC)"><NumberInput value={capital} onChange={setCapital} /></Field>
        <Field label="Frais simulés">
          <Segmented value={preset} onChange={setPreset} options={[{ value: 'exchange', label: 'Plateforme d’échange' }, { value: 'app', label: 'Application' }, { value: 'custom', label: 'Personnalisés' }]} />
        </Field>
        <p className="text-xs text-muted">{preset === 'exchange' ? 'Ordre au marché sur une plateforme d’échange : 0,10 % de frais + 0,05 % d’écart par côté.' : preset === 'app' ? 'Achat instantané dans une application grand public : environ 1,5 % d’écart de prix par côté.' : 'Tes propres frais et écart, par côté.'}</p>
        {preset === 'custom' && <div className="grid grid-cols-2 gap-3"><Field label="Frais (%)"><NumberInput value={fee} onChange={setFee} /></Field><Field label="Écart (%)"><NumberInput value={spread} onChange={setSpread} /></Field></div>}
      </div>
    </Modal>
  );
}

function ManualDetail({ p, onBack }: { p: PaperPortfolio; onBack: () => void }) {
  const { trades, book, prices, value } = useManualValue(p);
  const orders = useStore((s) => s.paperOrders);
  const upsertOrder = useStore((s) => s.upsertPaperOrder);
  const upsertPf = useStore((s) => s.upsertPaperPortfolio);
  const removePf = useStore((s) => s.removePaperPortfolio);
  const removeTrade = useStore((s) => s.removePaperTrade);
  const removeOrder = useStore((s) => s.removePaperOrder);
  const [tab, setTab] = useState<'positions' | 'orders' | 'history' | 'stats'>('positions');
  const [ask, setAsk] = useState<null | 'reset' | 'delete'>(null);
  const [rename, setRename] = useState<string | null>(null);
  const open = useMemo(() => orders.filter((o) => o.portfolioId === p.id && o.status === 'open'), [orders, p.id]);
  const coins = useMemo(() => [{ coinId: 'bitcoin', symbol: 'btc' }, ...[...new Map(trades.map((t) => [t.coinId, { coinId: t.coinId, symbol: t.symbol }])).values()]], [trades]);
  const closes = usePaperCloses(coins);
  const from = p.createdAt.slice(0, 10);
  const equity = useMemo(() => (closes.data ? paperEquitySeries(p.startingUsd, trades, closes.data, from, isoDay()) : null), [closes.data, p.startingUsd, trades, from]);
  const ref = useMemo(() => btcReference(p.startingUsd, from, closes.data?.get('bitcoin'), p.costs), [closes.data, p.startingUsd, from, p.costs]);
  const stats = useMemo(() => tradeStatsOf(closedTrades(tradesToFills(trades))), [trades]);
  const appValue = useMemo(() => repriceWithCosts(tradesToFills(trades).map((f) => ({ coinId: f.coinId, side: f.side, quantity: f.quantity, marketUsd: f.marketUsd })), p.startingUsd, COST_PRESETS.app, prices), [trades, p.startingUsd, prices]);
  const refNow = ref?.[ref.length - 1]?.valueUsd ?? null;
  const perf = value != null ? ((value / p.startingUsd) - 1) * 100 : null;

  function reset() {
    for (const t of trades) removeTrade(t.id);
    for (const o of orders.filter((x) => x.portfolioId === p.id)) removeOrder(o.id);
    upsertPf({ ...p, createdAt: new Date().toISOString() });
    setAsk(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>← Portefeuilles</Button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">{p.name}</h2>
        <Button size="sm" variant="ghost" onClick={() => setRename(p.name)}>Renommer</Button>
        <Button size="sm" variant="ghost" onClick={() => setAsk('reset')}>Remettre à zéro</Button>
        <Button size="sm" variant="ghost" onClick={() => { upsertPf({ ...p, archived: true }); onBack(); }}>Archiver</Button>
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setAsk('delete')}>Supprimer</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Valeur" value={value != null ? `${fmtNum(value)} USDC` : 'prix inconnu'} hint={`départ ${fmtNum(p.startingUsd)} USDC le ${fmtDate(p.createdAt)}`} />
        <Stat label="Performance" value={<span className={(perf ?? 0) >= 0 ? 'text-good' : 'text-critical'}>{pct(perf)}</span>} hint={refNow != null ? `même mise en Bitcoin : ${pct(((refNow / p.startingUsd) - 1) * 100)}` : undefined} />
        <Stat label="Cash" value={`${fmtNum(book.cashUsd)} USDC`} hint={`${Object.keys(book.positions).length} position${Object.keys(book.positions).length > 1 ? 's' : ''}`} />
        <Stat label="Baisse maximale" value={equity ? `${fmtNum(maxDrawdownPct(equity.series))} %` : '—'} hint={`avec les frais d’une application : ${pct(((appValue / p.startingUsd) - 1) * 100)}`} />
      </div>
      <Card title="Courbe de valeur" subtitle={equity?.partial ? 'Valorisation partielle : une crypto n’a pas d’historique de prix (dernier prix connu)' : 'Aux clôtures journalières'}>
        {equity ? <EquityChart series={equity.series} reference={ref} /> : <p className="text-sm text-muted">Chargement de l’historique des prix…</p>}
      </Card>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2"><OrderTicket portfolio={p} /></div>
        <Card className="lg:col-span-3" title={<Segmented value={tab} onChange={setTab} options={[{ value: 'positions', label: 'Positions' }, { value: 'orders', label: `En attente (${open.length})` }, { value: 'history', label: 'Historique' }, { value: 'stats', label: 'Statistiques' }]} />}>
          {tab === 'positions' && (Object.keys(book.positions).length === 0 ? <Empty icon={<FlaskConical className="size-8" />} title="Aucune position">Passe un premier ordre fictif.</Empty> : (
            <Table head={['Crypto', 'Quantité', 'Coût', 'Valeur', 'Résultat']}>
              {Object.values(book.positions).map((pos) => {
                const px = prices.get(pos.coinId);
                const v = px != null ? pos.quantity * px : null;
                return <tr key={pos.coinId}><Td left className="font-medium text-ink">{pos.symbol.toUpperCase()}</Td><Td>{fmtNum(pos.quantity, 6)}</Td><Td>{fmtPrice(pos.costUsd, 'USD')}</Td><Td>{v != null ? fmtPrice(v, 'USD') : 'prix inconnu'}</Td><Td>{v != null ? pct(((v / pos.costUsd) - 1) * 100) : '—'}</Td></tr>;
              })}
            </Table>
          ))}
          {tab === 'orders' && (open.length === 0 ? <p className="text-sm text-muted">Aucun ordre en attente.</p> : (
            <ul className="divide-y divide-line">
              {open.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2 text-sm">
                  <Badge tone={o.side === 'buy' ? 'up' : 'down'}>{o.type === 'limit' ? 'LIMITE' : o.type === 'stop' ? 'STOP' : 'OBJECTIF'}</Badge>
                  <span className="min-w-0 flex-1 text-ink">{o.symbol.toUpperCase()} à {fmtPrice(o.price, 'USD')}{o.usd ? ` · ${fmtNum(o.usd)} USDC` : o.quantity ? ` · ${fmtNum(o.quantity, 6)}` : ' · toute la position'}<span className="block text-xs text-muted">jusqu’au {fmtDate(o.expiresAt)}</span></span>
                  <Button size="sm" variant="ghost" onClick={() => upsertOrder({ ...o, status: 'cancelled' })}>Annuler</Button>
                </li>
              ))}
            </ul>
          ))}
          {tab === 'history' && (trades.length === 0 ? <p className="text-sm text-muted">Pas encore d’ordre.</p> : (
            <ul className="divide-y divide-line">
              {[...trades].sort((a, b) => (b.time ?? b.date).localeCompare(a.time ?? a.date)).map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                  <Badge tone={t.type === 'buy' ? 'up' : 'down'}>{t.type === 'buy' ? 'ACHAT' : 'VENTE'}</Badge>
                  <span className="min-w-0 flex-1 text-ink">{fmtNum(t.quantity, 6)} {t.symbol.toUpperCase()} à {fmtPrice(t.priceUsd, 'USD')}<span className="block text-xs text-muted">{fmtDate(t.time ?? t.date, true)}{t.orderType && t.orderType !== 'market' ? ` · ${t.orderType === 'limit' ? 'limite' : t.orderType === 'stop' ? 'stop' : 'objectif'}` : ''} · frais {fmtNum(t.feeUsd ?? 0)} USDC</span></span>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} aria-label="Supprimer cet ordre" onClick={() => removeTrade(t.id)} />
                </li>
              ))}
            </ul>
          ))}
          {tab === 'stats' && (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Trades clos" value={stats.n} hint={`${fmtNum(stats.winRatePct, 0)} % gagnants`} />
              <Stat label="Espérance" value={pct(stats.expectancyPct)} hint={stats.profitFactor != null ? `facteur de profit ${fmtNum(stats.profitFactor, 2)}` : undefined} />
              <Stat label="Gain moyen · perte moyenne" value={`${pct(stats.avgWinPct)} · ${pct(stats.avgLossPct)}`} />
              <Stat label="Pire série · frais payés" value={`${stats.maxLosingStreak} · ${fmtNum(stats.feesUsd)} USDC`} />
            </div>
          )}
        </Card>
      </div>
      <Modal open={ask != null} onClose={() => setAsk(null)} title={ask === 'reset' ? 'Remettre ce portefeuille à zéro ?' : 'Supprimer ce portefeuille ?'}
        footer={<><Button variant="ghost" onClick={() => setAsk(null)}>Annuler</Button><Button variant="primary" onClick={() => { if (ask === 'reset') reset(); else { removePf(p.id); onBack(); } }}>{ask === 'reset' ? 'Tout effacer' : 'Supprimer'}</Button></>}>
        <p className="text-sm text-ink-2">{ask === 'reset' ? `Ses ${trades.length} ordres et ses ordres en attente seront supprimés ; le cash repart à ${fmtNum(p.startingUsd)} USDC.` : 'Le portefeuille, ses ordres et son historique seront supprimés sur tous tes appareils.'} Ton vrai portefeuille n’est pas concerné.</p>
      </Modal>
      <Modal open={rename != null} onClose={() => setRename(null)} title="Renommer" footer={<><Button variant="ghost" onClick={() => setRename(null)}>Annuler</Button><Button variant="primary" disabled={!rename?.trim()} onClick={() => { upsertPf({ ...p, name: rename!.trim() }); setRename(null); }}>Enregistrer</Button></>}>
        <Field label="Nom"><Input value={rename ?? ''} onChange={(e) => setRename(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}

export function PortfoliosTab({ renderAuto, autoCards }: { renderAuto?: (p: PaperPortfolio, back: () => void) => React.ReactNode; autoCards?: (open: (id: string) => void) => React.ReactNode }) {
  const portfolios = useStore((s) => s.paperPortfolios);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const manual = useMemo(() => portfolios.filter((p) => p.kind === 'manual' && !p.archived), [portfolios]);
  const current = portfolios.find((p) => p.id === openId) ?? null;
  if (current) return current.kind === 'manual' ? <ManualDetail p={current} onBack={() => setOpenId(null)} /> : <>{renderAuto?.(current, () => setOpenId(null))}</>;
  return (
    <div className="space-y-4">
      <Banner tone="info" title="Argent fictif, marché réel">Ces portefeuilles sont indépendants de ton vrai portefeuille : ordres aux prix réels du moment, avec des frais et un écart de prix réalistes. Aucun total, aucune fiscalité, aucun conseil du Wallet n’en tient compte.</Banner>
      {autoCards?.(setOpenId)}
      <div className="flex items-center justify-between"><h2 className="text-sm font-medium text-ink-2">Portefeuilles manuels</h2><Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>Nouveau portefeuille</Button></div>
      {manual.length === 0 ? <Empty icon={<FlaskConical className="size-8" />} title="Aucun portefeuille manuel">Crée-en un pour tester une idée sans risquer un euro.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{manual.map((p) => <ManualCard key={p.id} p={p} onOpen={() => setOpenId(p.id)} />)}</div>
      )}
      <NewPortfolioModal open={creating} onClose={() => setCreating(false)} onCreated={setOpenId} />
    </div>
  );
}
