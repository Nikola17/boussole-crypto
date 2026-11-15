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
import { Banner, Button, Card, Modal } from '../../components/ui';
import type { PaperDayLog, PaperFill, PaperPortfolio, Transaction } from '../../types';

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

/** Bouton « J'ai copié en réel » d'un ordre : confirmation sous « encourageant », puis formulaire réel prérempli. */
export function CopyButton({ p, day, fill, verdict, trader, onCopy }: { p: PaperPortfolio; day: string; fill: PaperFill; verdict: TrustVerdict | null; trader: boolean; onCopy: (t: Target) => void }) {
  const [ask, setAsk] = useState(false);
  // Une vente du trader se copie en clôturant son trade réel, pas par un nouveau trade.
  if (fill.kind === 'delist' || (trader && fill.side === 'sell')) return null;
  const go = () => (COPYABLE(verdict) ? onCopy({ day, fill }) : setAsk(true));
  return (
    <>
      <button type="button" onClick={go} className="ml-2 inline-flex items-center gap-1 text-xs text-accent hover:underline" title={`Saisir l’ordre réellement passé pour ${p.name}`}>
        <Copy className="size-3" />J’ai copié en réel
      </button>
      <Modal open={ask} onClose={() => setAsk(false)} title="Copier un autopilote pas encore validé ?"
        footer={<><Button variant="ghost" onClick={() => setAsk(false)}>Annuler</Button><Button variant="primary" onClick={() => { setAsk(false); onCopy({ day, fill }); }}>Je copie quand même</Button></>}>
        <p className="text-sm text-ink-2">{verdict?.headline ?? 'Pas de verdict de confiance pour ce portefeuille.'}</p>
        <p className="mt-2 text-sm text-ink-2">Le verdict n’a pas encore atteint « encourageant » : rien ne montre pour l’instant que cette stratégie fait mieux que la référence. Si tu copies, garde un petit montant.</p>
      </Modal>
    </>
  );
}

/** Formulaires réels préremplis pour l'ordre choisi. */
export function CopyForms({ p, target, trader, onClose }: { p: PaperPortfolio; target: Target | null; trader: boolean; onClose: () => void }) {
  const f = target?.fill;
  const copyOf = target && f ? { portfolioId: p.id, day: target.day, coinId: f.coinId } : undefined;
  const coin = f ? { coinId: f.coinId, symbol: f.symbol, name: f.name } : null;
  return (
    <>
      <TransactionModal open={!!target && !trader} onClose={onClose} presetCoin={coin} presetType={f?.side === 'sell' ? 'sell' : 'buy'} copyOf={copyOf} />
      <TradeModal open={!!target && trader} onClose={onClose}
        preset={f ? { coinId: f.coinId, symbol: f.symbol, side: 'long', entryPrice: f.marketUsd, stopLoss: f.stop, takeProfit: f.target, setup: 'autopilote', copyOf } : null} />
    </>
  );
}

/** Rapport de copie : part des ordres copiés, écart d'exécution, résultat réel contre papier. */
export function CopyReportCard({ logs, coinIds }: { logs: PaperDayLog[]; coinIds: string[] }) {
  const txs = useStore((s) => s.transactions);
  const trades = useStore((s) => s.trades);
  const prices = usePaperPrices(coinIds);
  const r = useMemo(() => copyReport(logs, txs.filter((t: Transaction) => !!t.copyOf), trades.filter((t) => !!t.copyOf), (id) => prices.get(id) ?? null), [logs, txs, trades, prices]);
  if (r.copied === 0) return null;
  const [l1, l2] = copyText(r).split('\n');
  return (
    <Card title="Copie en réel" subtitle="Tes ordres réels rapprochés des ordres papier du même jour">
      <p className="text-sm text-ink">{l1}</p>
      {l2 && <p className="text-sm text-ink">{l2}</p>}
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
