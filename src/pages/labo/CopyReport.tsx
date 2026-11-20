// Copie en réel d'un autopilote : bouton « J'ai copié en réel » sur chaque ordre, formulaire réel prérempli,
// rapport de l'écart entre le réel et le papier, et montant conseillé (« Combien mettre ? »).
// Les journaux du papier arrivent en propriété : ce fichier ne lit pas le papier dans le magasin.

import { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useFx } from '../../hooks/useMarket';
import { usePaperPrices } from '../../hooks/usePaperData';
import { copyReport, copySize, copyText } from '../../lib/lab/copy';
import type { TrustVerdict } from '../../lib/lab/trust';
import { fmtNum } from '../../lib/format';
import { TransactionModal, TradeModal } from '../../components/forms';
import { Banner, Button, Card, Field, Modal, NumberInput } from '../../components/ui';
import type { PaperDayLog, PaperFill, PaperPortfolio, TradeEntry, Transaction } from '../../types';

type Target = { day: string; fill: PaperFill };
const COPYABLE = (v: TrustVerdict | null) => v?.level === 'encourageant' || v?.level === 'fiable';

export function useCopySize(verdict: TrustVerdict | null, riskPct: number | null) {
  const pf = usePortfolio();
  const fx = useFx();
  const currency = useStore((s) => s.settings.currency);
  const rate = currency === 'EUR' ? fx : 1;
  const realUsd = pf.totals ? pf.totals.value / (rate || 1) : 0;
  return (f: PaperFill): number | null => {
    if (!verdict) return null;
    const stopPct = f.stop != null && f.priceUsd > 0 ? ((f.priceUsd - f.stop) / f.priceUsd) * 100 : null;
    return copySize(verdict, realUsd, stopPct, riskPct ?? 1);
  };
}

/** Bouton « J'ai copié en réel » d'un ordre (y compris clôture 1-clic pour une vente d'autopilote trader). */
export function CopyButton({ p, day, fill, verdict, trader, onCopy }: { p: PaperPortfolio; day: string; fill: PaperFill; verdict: TrustVerdict | null; trader: boolean; onCopy: (t: Target) => void }) {
  const [ask, setAsk] = useState(false);
  const trades = useStore((s) => s.trades);
  if (fill.kind === 'delist') return null;
  const isTraderSell = trader && fill.side === 'sell';
  const openLinked = isTraderSell
    ? trades.find((t) => t.status === 'open' && t.copyOf?.portfolioId === p.id && t.coinId === fill.coinId)
    : undefined;
  if (isTraderSell && !openLinked) return null;
  const go = () => (isTraderSell || COPYABLE(verdict) ? onCopy({ day, fill }) : setAsk(true));
  return (
    <>
      <button type="button" onClick={go} className="ml-2 inline-flex items-center gap-1 text-xs text-accent hover:underline" title={isTraderSell ? 'Clôturer le trade réel copié' : `Saisir l’ordre réellement passé pour ${p.name}`}>
        <Copy className="size-3" />{isTraderSell ? 'Clôturer mon trade réel' : 'J’ai copié en réel'}
      </button>
      <Modal open={ask} onClose={() => setAsk(false)} title="Copier un autopilote pas encore validé ?"
        footer={<><Button variant="ghost" onClick={() => setAsk(false)}>Annuler</Button><Button variant="primary" onClick={() => { setAsk(false); onCopy({ day, fill }); }}>Je copie quand même</Button></>}>
        <p className="text-sm text-ink-2">{verdict?.headline ?? 'Pas de verdict de confiance pour ce portefeuille.'}</p>
        <p className="mt-2 text-sm text-ink-2">Le verdict n’a pas encore atteint « encourageant » : rien ne montre pour l’instant que cette stratégie fait mieux que la référence. Si tu copies, garde un petit montant.</p>
      </Modal>
    </>
  );
}

/** Modale de clôture rapide d'un trade réel lié à une vente d'autopilote trader. */
function CloseCopiedTradeModal({ trade, fill, day, onClose }: { trade: TradeEntry | null; fill: PaperFill | null; day: string; onClose: () => void }) {
  const upsertTrade = useStore((s) => s.upsertTrade);
  const [exitPrice, setExitPrice] = useState<number | ''>(fill?.marketUsd ?? '');
  const [fees, setFees] = useState<number | ''>(trade?.fees ?? 0);
  if (!trade || !fill) return null;
  const px = Number(exitPrice) || fill.marketUsd;
  const closeNow = () => {
    upsertTrade({
      ...trade,
      status: 'closed',
      exitDate: `${day}T${new Date().toISOString().slice(11)}`,
      exitPrice: px,
      fees: Number(fees) || trade.fees,
      notes: `${trade.notes ? `${trade.notes} · ` : ''}Clôturé d’après autopilote (${fill.reason})`,
    });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Clôturer ${trade.symbol.toUpperCase()} (copie réelle)`}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" onClick={closeNow}>Enregistrer la clôture</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-ink-2">L’autopilote est sorti à {fmtNum(fill.marketUsd, 4)} $ ({fill.reason}). Indique ton prix de sortie réel :</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix de sortie réel ($)"><NumberInput value={exitPrice} onChange={setExitPrice} /></Field>
          <Field label="Frais totaux ($)"><NumberInput value={fees} onChange={setFees} /></Field>
        </div>
      </div>
    </Modal>
  );
}

/** Formulaires réels préremplis pour l'ordre choisi (achat, vente DCA ou clôture de trade). */
export function CopyForms({ p, target, trader, onClose }: { p: PaperPortfolio; target: Target | null; trader: boolean; onClose: () => void }) {
  const trades = useStore((s) => s.trades);
  const f = target?.fill;
  const copyOf = target && f ? { portfolioId: p.id, day: target.day, coinId: f.coinId } : undefined;
  const coin = f ? { coinId: f.coinId, symbol: f.symbol, name: f.name } : null;
  const isTraderSell = !!(target && f && trader && f.side === 'sell');
  const openLinked = isTraderSell
    ? trades.find((t) => t.status === 'open' && t.copyOf?.portfolioId === p.id && t.coinId === f.coinId) ?? null
    : null;
  return (
    <>
      <TransactionModal open={!!target && !trader} onClose={onClose} presetCoin={coin} presetType={f?.side === 'sell' ? 'sell' : 'buy'} copyOf={copyOf} />
      <TradeModal open={!!target && trader && !isTraderSell} onClose={onClose}
        preset={f ? { coinId: f.coinId, symbol: f.symbol, side: 'long', entryPrice: f.marketUsd, stopLoss: f.stop, takeProfit: f.target, setup: 'autopilote', copyOf } : null} />
      {isTraderSell && <CloseCopiedTradeModal trade={openLinked} fill={f ?? null} day={target.day} onClose={onClose} />}
    </>
  );
}

/** Rapport de copie : part des ordres copiés, décomposition de l'écart (frais, slippage, délai, manqués). */
export function CopyReportCard({ logs, coinIds }: { logs: PaperDayLog[]; coinIds: string[] }) {
  const txs = useStore((s) => s.transactions);
  const trades = useStore((s) => s.trades);
  const prices = usePaperPrices(coinIds);
  const r = useMemo(() => copyReport(logs, txs.filter((t: Transaction) => !!t.copyOf), trades.filter((t) => !!t.copyOf), (id) => prices.get(id) ?? null), [logs, txs, trades, prices]);
  if (r.copied === 0) return null;
  const [l1, l2] = copyText(r).split('\n');
  const a = r.attribution;
  return (
    <Card title="Copie en réel" subtitle="Tes ordres réels rapprochés des ordres papier du même jour">
      <p className="text-sm text-ink">{l1}</p>
      {l2 && <p className="text-sm text-ink">{l2}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-surface-2 p-2"><div className="text-muted">Taux de copie</div><div className="tnum font-semibold text-ink">{fmtNum(a.copiedPct, 0)} % ({a.missedOrders} manqué{a.missedOrders > 1 ? 's' : ''})</div></div>
        <div className="rounded-lg bg-surface-2 p-2"><div className="text-muted">Slippage moyen</div><div className="tnum font-semibold text-ink">{a.slippageDragPct != null ? `${fmtNum(a.slippageDragPct, 2)} %` : '—'}</div></div>
        <div className="rounded-lg bg-surface-2 p-2"><div className="text-muted">Délai moyen</div><div className="tnum font-semibold text-ink">{a.avgDelayH != null ? `${fmtNum(a.avgDelayH, 1)} h` : '—'}</div></div>
        <div className="rounded-lg bg-surface-2 p-2"><div className="text-muted">Écart frais</div><div className="tnum font-semibold text-ink">{a.feeDragPct != null ? `${fmtNum(a.feeDragPct, 2)} %` : '—'}</div></div>
      </div>
      <ul className="mt-2 divide-y divide-line text-xs">
        {r.lines.filter((l) => l.realUsd != null).slice(-10).reverse().map((l, i) => (
          <li key={i} className="flex justify-between py-1"><span className="text-ink-2">{l.day.slice(8, 10)}/{l.day.slice(5, 7)} · {l.symbol.toUpperCase()}</span>
            <span className="tnum text-ink-2">papier {fmtNum(l.paperUsd)} $ · réel {fmtNum(l.realUsd ?? 0)} $ · écart {l.slipPct != null ? `${fmtNum(l.slipPct, 2)} %` : '—'}{l.delayH != null ? ` · ${fmtNum(l.delayH, 1)} h après` : ''}</span></li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Écart négatif : exécuté moins bien que le papier (prix d’achat plus haut, prix de vente plus bas). Résultat sur les ordres d’achat copiés, au dernier prix connu.</p>
    </Card>
  );
}

export function CopySizeBanner({ size, verdict }: { size: number | null; verdict: TrustVerdict | null }) {
  if (!verdict || size == null) return null;
  return <Banner tone="info" title="Combien mettre ?">Environ {fmtNum(size, 0)} $ par ordre : {verdict.copyPct} % de ton portefeuille réel, plafonné pour ne pas risquer plus que la règle de risque si le stop est touché.</Banner>;
}
