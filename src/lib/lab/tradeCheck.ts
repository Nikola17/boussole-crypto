// Trading vérifié par le banc d'essai : espérance mesurée d'un setup (frais du préréglage compris), journal
// face à l'historique, test sur papier en un clic, et stops ou objectifs des trades du journal surveillés.

import type { Candle } from '../indicators';
import type { CoinRef, PaperOrder, PaperPortfolio, PaperTrade, TradeEntry } from '../../types';
import { marketOrder } from './paperBook';
import { RELIABILITY, type ReliabilityEntry } from './reliability';
import { COSTS, type CostModel } from './types';

/** Distance du stop par défaut (en % du prix) quand le calculateur ne la connaît pas encore. */
export const TYPICAL_STOP_PCT = 8;

/** Plans de trade mesurés derrière chaque setup (la cassure avec volume est le signal trader « Achat » / « Achat fort »). */
const PLAN_KEYS: Record<string, string[]> = { 'setup:breakout': ['plan:Achat@3', 'plan:Achat fort@3'] };

const fr2 = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2).replace('.', ',')}`;
const roundTripPct = (c: CostModel) => 2 * (c.feePct + c.spreadPct);

function measured(key: string, table: Record<string, ReliabilityEntry>): { expectancyR: number; winPct: number } | null {
  const entries = (PLAN_KEYS[key] ?? []).map((k) => table[k]).filter((e): e is ReliabilityEntry => !!e && e.expectancyR != null);
  const n = entries.reduce((s, e) => s + e.episodes, 0);
  if (!n) return null;
  return {
    expectancyR: entries.reduce((s, e) => s + (e.expectancyR ?? 0) * e.episodes, 0) / n,
    winPct: entries.reduce((s, e) => s + e.hitPct * e.episodes, 0) / n,
  };
}

/** Espérance mesurée (frais d'une plateforme d'échange inclus) moins le surcoût aller-retour du préréglage, en R. */
export function setupExpectancy(key: string, costs: CostModel, stopDistancePct = TYPICAL_STOP_PCT, table: Record<string, ReliabilityEntry> = RELIABILITY.entries): { expectancyR: number | null; winPct: number | null; warning: string | null } {
  const m = measured(key, table);
  if (!m) return { expectancyR: null, winPct: null, warning: null };
  const extraR = stopDistancePct > 0 ? (roundTripPct(costs) - roundTripPct(COSTS.exchange)) / stopDistancePct : 0;
  const expectancyR = m.expectancyR - extraR;
  return { expectancyR, winPct: m.winPct, warning: expectancyR < 0 ? `Avec ces frais, ce setup perd en moyenne ${Math.abs(expectancyR).toFixed(2).replace('.', ',')} R par trade.` : null };
}

/** R d'un trade clos du journal (frais compris) ; null sans stop. */
export function tradeR(t: TradeEntry): number | null {
  if (t.status !== 'closed' || t.exitPrice == null || t.stopLoss == null) return null;
  const risk = (t.side === 'long' ? t.entryPrice - t.stopLoss : t.stopLoss - t.entryPrice) * t.quantity;
  if (!(risk > 0)) return null;
  const pnl = (t.side === 'long' ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice) * t.quantity - (t.fees || 0);
  return pnl / risk;
}

export function journalVsBench(trades: TradeEntry[], key: string, table: Record<string, ReliabilityEntry> = RELIABILITY.entries): { mine: { n: number; avgR: number | null }; bench: number | null; text: string } {
  const setup = key.replace(/^setup:/, '');
  const label = table[key]?.label.toLowerCase();
  const same = (s: string | undefined) => { const x = (s ?? '').trim().toLowerCase(); return x === setup || (!!label && x === label); };
  const rs = trades.filter((t) => same(t.setup)).map(tradeR).filter((r): r is number => r != null);
  const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  const bench = measured(key, table)?.expectancyR ?? null;
  const text = `toi : ${avgR == null ? 'aucun trade clos' : `${fr2(avgR)} R sur ${rs.length} trade${rs.length > 1 ? 's' : ''}`} ; historique : ${bench == null ? 'non mesuré' : `${fr2(bench)} R`}`;
  return { mine: { n: rs.length, avgR }, bench, text };
}

/** « Tester sur papier » : achat au marché dans le portefeuille manuel, stop et objectif (3 R) attachés. */
export function paperTestOrder(manuel: PaperPortfolio, trades: PaperTrade[], coin: CoinRef, plan: { entry: number; stop: number; tp2: number }, usd: number, marketUsd: number, nowIso: string): { trade: PaperTrade | null; orders: PaperOrder[]; error: string | null } {
  return marketOrder(manuel, trades, { coin, side: 'buy', usd, stop: plan.stop, target: plan.tp2 }, marketUsd, nowIso);
}

export interface TradeHit { trade: TradeEntry; kind: 'stop' | 'target'; level: number; key: string }

/** Premier niveau touché par un trade ouvert du journal sur ses bougies 1 heure (le stop l'emporte dans une même bougie). */
export function tradeHits(trades: TradeEntry[], barsOf: (t: TradeEntry) => Candle[]): TradeHit[] {
  const out: TradeHit[] = [];
  for (const t of trades) {
    if (t.status !== 'open' || (t.stopLoss == null && t.takeProfit == null)) continue;
    const long = t.side === 'long';
    for (const b of barsOf(t)) {
      const stop = t.stopLoss != null && (long ? b.low <= t.stopLoss : b.high >= t.stopLoss);
      const target = t.takeProfit != null && (long ? b.high >= t.takeProfit : b.low <= t.takeProfit);
      if (stop) { out.push({ trade: t, kind: 'stop', level: t.stopLoss!, key: `trade:${t.id}:stop` }); break; }
      if (target) { out.push({ trade: t, kind: 'target', level: t.takeProfit!, key: `trade:${t.id}:target` }); break; }
    }
  }
  return out;
}
