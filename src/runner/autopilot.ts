// Autopilotes et ordres papier sur le serveur veilleur : même tick que l'application (journaux identiques), règlement
// des ordres en attente des portefeuilles manuels (mêmes identifiants « fill:<ordre> »), messages Telegram et lignes du brief.
// Fonction pure à sources injectées : le réseau vit dans main.ts.

import type { SyncBundle } from '../lib/sync/merge';
import type { PaperDayLog, PaperFill, PaperOrder, PaperPortfolio, PaperTrade, TradeEntry } from '../types';
import { exchangeLinks } from '../lib/lab/copyTickets';
import { needsArchive, tickAutopilot, type AutopilotEvent, type AutopilotSources } from '../lib/lab/autopilot';
import { mergeDayLogs } from '../lib/lab/autoState';
import { compactPaperDays } from '../lib/lab/compact';
import { settleOrders } from '../lib/lab/settle';
import { autoEquitySeries, benchP10, dcaReferenceFromCloses, logsToFills } from '../lib/lab/autoView';
import { trustVerdict, type TrustVerdict } from '../lib/lab/trust';
import { twr } from '../lib/lab/metrics';
import { STRATEGIES } from '../lib/lab/strategies';
import { fmtPrice } from '../lib/format';

export interface AutopilotRun { bundle: SyncBundle; changed: number; events: { key: string; text: string }[]; briefLines: string[] }

const LEVEL: Record<TrustVerdict['level'], string> = { observation: 'en observation', insuffisant: 'insuffisant', encourageant: 'encourageant', fiable: 'fiable jusqu’ici', 'retirée': 'confiance retirée' };
const fr = (x: number, d = 2) => x.toFixed(d).replace('.', ',').replace(/,00$/, '');
const pct = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1).replace('.', ',')} %`;
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const list = <T>(b: SyncBundle, k: string): T[] => (Array.isArray(b.data[k as keyof SyncBundle['data']]) ? (b.data[k as keyof SyncBundle['data']] as T[]) : []);

function fillLine(f: PaperFill, urgentRealClose = false): string {
  const verb = f.side === 'buy' ? (f.kind === 'limit' ? 'ACHAT LIMITE' : 'ACHAT') : 'VENTE';
  const prefix = urgentRealClose ? '🚨 CLÔTURE POSITION COPIÉE · ' : '';
  const head = `${prefix}${verb} ${f.symbol.toUpperCase()} : ${f.side === 'buy' ? `${fr(f.quantity * f.priceUsd + f.feeUsd)} USDC` : `${fr(f.quantity * f.priceUsd)} USDC`} à ≈ ${fmtPrice(f.marketUsd, 'USD')} — ${f.reason}`;
  const legs = [
    f.side === 'buy' ? `max chase ${fmtPrice(f.marketUsd * 1.025, 'USD')}` : '',
    f.stop != null ? `stop ${fmtPrice(f.stop, 'USD')} (${pct((f.stop / f.marketUsd - 1) * 100)})` : '',
    f.target != null ? `objectif ${fmtPrice(f.target, 'USD')} (${pct((f.target / f.marketUsd - 1) * 100)})` : '',
    f.tpLegs?.length ? `TP partiels ${f.tpLegs.map((l) => `${l.rMultiple}R`).join(' / ')}` : '',
    f.trailing ? `trailing ${f.trailing.value}${f.trailing.mode === 'pct' ? ' %' : '× ATR'}` : '',
  ].filter(Boolean);
  const link = f.kind !== 'delist' ? exchangeLinks(f.symbol).binanceUrl : '';
  return [head, legs.length ? `  ${legs.join(', ')}` : '', link ? `  ${link}` : ''].filter(Boolean).join('\n');
}

/** Verdict et performance d'un autopilote, à partir des clôtures journalières des sources. */
async function summary(p: PaperPortfolio, logs: PaperDayLog[], src: AutopilotSources, today: string): Promise<{ value: number | null; perf: number | null; verdict: TrustVerdict | null }> {
  const s = p.strategyId ? STRATEGIES[p.strategyId] : undefined;
  if (!s) return { value: null, perf: null, verdict: null };
  const coins = [...new Set(['bitcoin', ...logs.flatMap((l) => l.fills.map((f) => f.coinId))])];
  const closes = new Map<string, Map<string, number>>();
  for (const c of coins) closes.set(c, new Map((await src.daily(c)).map((k) => [new Date(k.time * 1000).toISOString().slice(0, 10), k.close])));
  const from = p.liveSince ?? p.createdAt.slice(0, 10);
  if (from > today) return { value: null, perf: null, verdict: null };
  const series = autoEquitySeries(p, logs, closes, from, today);
  const btc = closes.get('bitcoin');
  const reference = btc && s.kind === 'deposits' ? dcaReferenceFromCloses(series.filter((x) => x.flowUsd > 0).map((x) => ({ day: x.day, usd: x.flowUsd })), btc, p.costs) : null;
  const p10 = benchP10(s.id, series.length);
  const verdict = s.id === 'dca-btc' ? null : trustVerdict({ kind: s.kind, seed: p.id, live: series, fills: logsToFills(logs), reference, bench: p10 != null ? { p10 } : null, today });
  return { value: series[series.length - 1]?.valueUsd ?? null, perf: series.length > 1 ? twr(series) * 100 : null, verdict };
}

export async function runAutopilots(bundle: SyncBundle, src: AutopilotSources, nowMs: number, device: string): Promise<AutopilotRun> {
  const now = new Date(nowMs).toISOString();
  const today = now.slice(0, 10);
  let portfolios = list<PaperPortfolio>(bundle, 'paperPortfolios');
  let days = list<PaperDayLog>(bundle, 'paperDays');
  let trades = list<PaperTrade>(bundle, 'paperTrades');
  let orders = list<PaperOrder>(bundle, 'paperOrders');
  const openRealCopied = new Set(
    list<TradeEntry>(bundle, 'trades')
      .filter((t) => t.status === 'open' && t.copyOf)
      .map((t) => `${t.copyOf!.portfolioId}|${t.coinId}`),
  );
  let changed = 0;
  const events: AutopilotRun['events'] = [];
  const briefLines: string[] = [];

  for (const p of portfolios.filter((x) => x.kind === 'auto' && !x.archived && !x.paused)) {
    if (needsArchive(p)) continue; // l'application archive et recrée : le serveur ne décide pas à sa place
    const mine = days.filter((l) => l.portfolioId === p.id);
    const r = await tickAutopilot(p, mine, nowMs, src, device);
    const merged = mergeDayLogs(days, r.changed.map((l) => ({ ...l, updatedAt: now })));
    if (merged.changed.length) { days = merged.days; changed += merged.changed.length; }
    if (r.portfolio.cursorDay !== p.cursorDay || r.portfolio.cursorSlot !== p.cursorSlot || r.portfolio.settledTo !== p.settledTo || r.portfolio.universeWeek !== p.universeWeek) {
      portfolios = portfolios.map((x) => (x.id === p.id ? { ...r.portfolio, updatedAt: now } : x));
      changed++;
    }
    const sum = await summary(r.portfolio, days.filter((l) => l.portfolioId === p.id), src, today);
    const confidence = sum.verdict ? `Confiance : ${sum.verdict.headline}` : 'Portefeuille de référence.';
    for (const e of r.events as AutopilotEvent[]) {
      if (e.kind === 'orders') {
        const lines = [
          `Autopilote « ${p.name} » — ordres du ${dm(e.day)} (papier)${e.lateDays ? `, exécutés avec ${e.lateDays} jour${e.lateDays > 1 ? 's' : ''} de retard` : ''}`,
          ...e.fills.map((f) => fillLine(f, f.side === 'sell' && openRealCopied.has(`${p.id}|${f.coinId}`))),
          ...e.skipped.filter((x) => x.symbol !== '—').map((x) => `${x.symbol} écartée : ${x.why}`),
          confidence,
        ];
        if (e.fills.length) events.push({ key: `auto:${p.id}:${e.day}`, text: lines.join('\n') });
      } else {
        const urgent = openRealCopied.has(`${p.id}|${e.fill.coinId}`);
        events.push({
          key: `auto:${p.id}:${e.fill.at}`,
          text: `${urgent ? '🚨 POSITION COPIÉE · ' : ''}Autopilote « ${p.name} » : ${e.kind === 'stop' ? 'stop touché' : 'objectif atteint'} sur ${e.fill.symbol.toUpperCase()} à ${fmtPrice(e.fill.marketUsd, 'USD')} (papier).${urgent ? '\nOuvre Boussole (Labo → À copier) pour clôturer ton trade réel.' : ''}`,
        });
      }
    }
    briefLines.push(`${p.name} : ${sum.value != null ? `${fr(sum.value)} USDC` : 'démarre bientôt'}${sum.perf != null ? ` (${pct(sum.perf)})` : ''} — ${sum.verdict ? LEVEL[sum.verdict.level] : 'référence'}`);
  }

  // Ordres en attente des portefeuilles manuels.
  const open = orders.filter((o) => o.status === 'open');
  if (open.length) {
    const hourly = new Map<string, Awaited<ReturnType<AutopilotSources['hourly']>>>();
    for (const coinId of [...new Set(open.map((o) => o.coinId))]) {
      const from = Math.min(...open.filter((o) => o.coinId === coinId).map((o) => Date.parse(o.createdAt)));
      hourly.set(coinId, await src.hourly(coinId, from, nowMs));
    }
    for (const p of portfolios.filter((x) => x.kind === 'manual' && !x.archived)) {
      const r = settleOrders({ portfolio: p, orders, trades: trades.filter((t) => t.portfolioId === p.id), hourly, nowMs });
      if (!r.trades.length && !r.orders.length) continue;
      const known = new Set(trades.map((t) => t.id));
      const fresh = r.trades.filter((t) => !known.has(t.id)).map((t) => ({ ...t, updatedAt: now }));
      trades = [...fresh, ...trades];
      const upd = new Map(r.orders.map((o) => [o.id, { ...o, updatedAt: now }]));
      orders = [...orders.filter((o) => !upd.has(o.id)), ...upd.values()];
      changed += fresh.length + upd.size;
      for (const t of fresh) events.push({ key: `paper:${t.id}`, text: `Papier « ${p.name} » : ordre ${t.orderType === 'stop' ? 'stop' : t.orderType === 'target' ? 'objectif' : 'limite'} exécuté — ${t.type === 'buy' ? 'achat' : 'vente'} de ${t.symbol.toUpperCase()} à ${fmtPrice(t.marketUsd ?? t.priceUsd, 'USD')}.` });
    }
  }
  if (changed) {
    const compacted = compactPaperDays(days, today, 90);
    days = compacted.days;
  }
  return { bundle: changed ? { ...bundle, data: { ...bundle.data, paperPortfolios: portfolios, paperDays: days, paperTrades: trades, paperOrders: orders } } : bundle, changed, events, briefLines };
}
