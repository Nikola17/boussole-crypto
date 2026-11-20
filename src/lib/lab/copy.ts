// Copie en réel d'un autopilote : chaque transaction ou trade marqué `copyOf` est rapproché de l'ordre papier
// du même jour. On mesure l'écart d'exécution (négatif = moins bien que le papier), le délai, et le résultat
// réel contre le résultat papier des mêmes ordres d'achat (au dernier prix connu, ou au prix de sortie d'un trade clos).

import type { PaperDayLog, TradeEntry, Transaction } from '../../types';
import { priceUsdOf } from '../fees';
import type { TrustVerdict } from './trust';

export interface CopyLine { day: string; symbol: string; paperUsd: number; realUsd: number | null; slipPct: number | null; delayH: number | null }
export interface CopyAttribution {
  /** Part des ordres papier effectivement copiés (%). */
  copiedPct: number;
  missedOrders: number;
  /** Écart moyen lié au prix d'exécution (slippage + retard), en %. */
  slippageDragPct: number | null;
  /** Délai moyen entre l'exécution papier et ton ordre réel, en heures. */
  avgDelayH: number | null;
  /** Surcoût moyen de frais (réel − papier) en % du montant copié. */
  feeDragPct: number | null;
}
export interface CopyReport { orders: number; copied: number; avgSlipPct: number | null; realPct: number | null; paperPct: number | null; lines: CopyLine[]; attribution: CopyAttribution }

interface RealExec { priceUsd: number; quantity: number; feeUsd: number; atMs: number | null; exitUsd: number | null }

const keyOf = (portfolioId: string, day: string, coinId: string) => `${portfolioId}|${day}|${coinId}`;

function realOf(txs: Transaction[], trades: TradeEntry[]): Map<string, RealExec> {
  const out = new Map<string, RealExec>();
  for (const t of txs) {
    if (!t.copyOf) continue;
    const px = priceUsdOf(t);
    out.set(keyOf(t.copyOf.portfolioId, t.copyOf.day, t.copyOf.coinId), {
      priceUsd: px, quantity: t.quantity, feeUsd: t.price > 0 ? (t.fee * px) / t.price : 0, atMs: t.time ? Date.parse(t.time) : null, exitUsd: null,
    });
  }
  for (const t of trades) {
    if (!t.copyOf) continue;
    out.set(keyOf(t.copyOf.portfolioId, t.copyOf.day, t.copyOf.coinId), {
      priceUsd: t.entryPrice, quantity: t.quantity, feeUsd: t.fees, atMs: t.entryDate.includes('T') ? Date.parse(t.entryDate) : null,
      exitUsd: t.status === 'closed' && t.exitPrice != null ? t.exitPrice : null,
    });
  }
  return out;
}

export function copyReport(logs: PaperDayLog[], txs: Transaction[], trades: TradeEntry[], lastPrice: (coinId: string) => number | null = () => null): CopyReport {
  const real = realOf(txs, trades);
  const used = new Set<string>();
  const lines: CopyLine[] = [];
  let orders = 0;
  let paperCost = 0, paperValue = 0, realCost = 0, realValue = 0;
  let paperFees = 0, realFees = 0, copiedNotional = 0;
  for (const log of [...logs].sort((a, b) => a.day.localeCompare(b.day))) {
    for (const f of log.fills) {
      orders++;
      const k = keyOf(log.portfolioId, log.day, f.coinId);
      const r = used.has(k) ? undefined : real.get(k);
      const paperUsd = f.quantity * f.priceUsd;
      if (!r) {
        lines.push({ day: log.day, symbol: f.symbol, paperUsd, realUsd: null, slipPct: null, delayH: null });
        continue;
      }
      used.add(k);
      const slip = f.side === 'buy' ? (f.priceUsd / r.priceUsd - 1) * 100 : (r.priceUsd / f.priceUsd - 1) * 100;
      const delay = r.atMs != null && Number.isFinite(r.atMs) ? Math.round(((r.atMs - Date.parse(f.at)) / 3600_000) * 10) / 10 : null;
      const realNotional = r.quantity * r.priceUsd;
      lines.push({ day: log.day, symbol: f.symbol, paperUsd, realUsd: realNotional, slipPct: slip, delayH: delay });
      paperFees += paperUsd > 0 ? (f.feeUsd / paperUsd) * realNotional : 0;
      realFees += r.feeUsd;
      copiedNotional += realNotional;
      if (f.side === 'buy') {
        const last = lastPrice(f.coinId);
        paperCost += paperUsd + f.feeUsd;
        paperValue += f.quantity * (last ?? f.priceUsd);
        realCost += realNotional + r.feeUsd;
        realValue += r.quantity * (r.exitUsd ?? last ?? r.priceUsd);
      }
    }
  }
  const copiedLines = lines.filter((l) => l.slipPct != null);
  const delays = copiedLines.map((l) => l.delayH).filter((d): d is number => d != null);
  const avgSlipPct = copiedLines.length ? copiedLines.reduce((s, l) => s + (l.slipPct ?? 0), 0) / copiedLines.length : null;
  const attribution: CopyAttribution = {
    copiedPct: orders > 0 ? (copiedLines.length / orders) * 100 : 0,
    missedOrders: Math.max(0, orders - copiedLines.length),
    slippageDragPct: avgSlipPct,
    avgDelayH: delays.length ? delays.reduce((s, d) => s + d, 0) / delays.length : null,
    feeDragPct: copiedNotional > 0 ? ((paperFees - realFees) / copiedNotional) * 100 : null,
  };
  return {
    orders,
    copied: copiedLines.length,
    avgSlipPct,
    realPct: realCost > 0 ? (realValue / realCost - 1) * 100 : null,
    paperPct: paperCost > 0 ? (paperValue / paperCost - 1) * 100 : null,
    lines,
    attribution,
  };
}

const pct1 = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1).replace('.', ',')} %`;

/** Texte du rapport (fiche 11.3). */
export function copyText(r: Pick<CopyReport, 'orders' | 'copied' | 'avgSlipPct' | 'realPct' | 'paperPct'> & { lines?: CopyLine[] }): string {
  const head = `Copie en réel : ${r.copied} ordre${r.copied > 1 ? 's' : ''} sur ${r.orders}.${r.avgSlipPct != null ? ` Écart moyen à l’exécution : ${pct1(r.avgSlipPct)}.` : ''}`;
  if (r.realPct == null || r.paperPct == null) return head;
  return `${head}\nRésultat réel ${pct1(r.realPct)} ; papier, sur les mêmes ordres, ${pct1(r.paperPct)}.`;
}

/** « Combien mettre ? » : part conseillée du portefeuille réel, plafonnée par le risque au stop. Rien sous « encourageant ». */
export function copySize(verdict: TrustVerdict, realPortfolioUsd: number, stopDistancePct: number | null, riskPerTradePct: number): number | null {
  if ((verdict.level !== 'encourageant' && verdict.level !== 'fiable') || verdict.copyPct == null || !(realPortfolioUsd > 0)) return null;
  let size = (verdict.copyPct / 100) * realPortfolioUsd;
  if (stopDistancePct != null && stopDistancePct > 0) size = Math.min(size, (realPortfolioUsd * riskPerTradePct) / stopDistancePct);
  return Math.round(size * 100) / 100;
}
