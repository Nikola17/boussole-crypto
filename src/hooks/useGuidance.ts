// « Que faire aujourd'hui ? » : recommandations déterministes (sans IA) à partir du cycle, du DCA et du portefeuille.

import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useCycle, useFearGreed, useMarkets, useScan } from './useMarket';
import { useBasketDue } from './useBasket';
import { useExitPlan } from './useExitPlan';
import { usePortfolio } from './usePortfolio';
import { lastOccurrence, multiplierFor, nextOccurrences, periodKey } from '../lib/dca';
import { BUCKET_LABEL, rebalance } from '../lib/portfolio';
import { fmtMoney } from '../lib/format';
import { rulesOf } from '../lib/profile';
import { scatterReport } from '../lib/scatter';
import type { DcaPlan } from '../types';

export interface Guidance {
  key: string;
  tone: 'up' | 'down' | 'neutral' | 'warn';
  title: string;
  detail: string;
  to?: string;
}

export interface DcaStatus {
  plan: DcaPlan;
  due: boolean;
  done: boolean;
  periodKey: string | null;
  multiplier: number;
  reason: string;
  recommended: number;
  next: Date | null;
}

/** Liste des cryptos à analyser en priorité : watchlist + positions + plans DCA. */
export function useFocusCoins() {
  const watchlist = useStore((s) => s.watchlist);
  const plans = useStore((s) => s.dcaPlans);
  const transactions = useStore((s) => s.transactions);
  const markets = useMarkets();
  return useMemo(() => {
    const ids = new Set<string>([...watchlist, ...plans.map((p) => p.coinId), ...transactions.map((t) => t.coinId)]);
    return (markets.data ?? []).filter((m) => ids.has(m.id)).slice(0, 40);
  }, [watchlist, plans, transactions, markets.data]);
}

export function useDcaStatus(): DcaStatus[] {
  const plans = useStore((s) => s.dcaPlans);
  const executions = useStore((s) => s.dcaExecutions);
  const fng = useFearGreed(60);
  const cycle = useCycle();
  const focus = useFocusCoins();
  const scan = useScan(focus, cycle.data?.temperature);
  return useMemo(() => {
    const today = new Date();
    const f = fng.data ?? [];
    return plans.map((p) => {
      const last = lastOccurrence(p, today);
      const key = last ? periodKey(p, last) : null;
      const done = key ? executions.some((e) => e.planId === p.id && e.periodKey === key) : false;
      const mayer = scan.data?.get(p.coinId)?.mayer;
      const m = multiplierFor(p.strategy, { fng: f[f.length - 1]?.value, temperature: cycle.data?.temperature, mayer });
      return {
        plan: p,
        due: p.active && !!last && !done,
        done,
        periodKey: key,
        multiplier: m.mult,
        reason: m.reason,
        recommended: Math.round(p.amount * m.mult * 100) / 100,
        next: nextOccurrences(p, new Date(today.getTime() + 86400000), 1)[0] ?? null,
      };
    });
  }, [plans, executions, fng.data, cycle.data, scan.data]);
}

export function useGuidance(): Guidance[] {
  const cycle = useCycle();
  const dca = useDcaStatus();
  const pf = usePortfolio();
  const bd = useBasketDue();
  const exit = useExitPlan();
  const profile = useStore((s) => s.profile);
  const currency = useStore((s) => s.settings.currency);

  return useMemo(() => {
    const out: Guidance[] = [];
    if (bd.due && bd.basket && bd.last) {
      out.push({
        key: 'basket',
        tone: 'up',
        title: `Panier DCA : échéance du ${bd.last.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`,
        detail: `${String(bd.basket.amountUsd).replace('.', ',')} USDC à répartir entre ton cœur et ta ligne découverte. L’ordre du jour tient compte du marché, de ta réserve et de tes règles.`,
        to: '/dca',
      });
    }
    for (const { coin, rung } of exit.pending.slice(0, 2)) {
      out.push({
        key: `exit-${coin.coinId}-${rung.multiple}`,
        tone: 'down',
        title: `Palier ×${rung.multiple} atteint sur ${coin.symbol}`,
        detail: `Vends ${rung.pct} % de ta position de départ (≈ ${fmtMoney(rung.valueUsd * exit.rate, currency, 0)}) : ce palier a été fixé à froid, ne le renégocie pas à chaud.`,
        to: '/portefeuille',
      });
    }
    if (exit.euphoria.active && exit.coins.some((c) => c.core)) {
      out.push({ key: 'euphoria', tone: 'down', title: 'Marché en euphorie : allège Bitcoin et Ethereum', detail: exit.euphoria.label, to: '/portefeuille' });
    }
    for (const d of dca.filter((x) => x.due)) {
      out.push({
        key: `dca-${d.plan.id}`,
        tone: 'up',
        title: `DCA ${d.plan.symbol.toUpperCase()} : ${fmtMoney(d.recommended, currency, 0)} cette période`,
        detail: d.multiplier === 1 ? 'Montant habituel, le marché est dans une zone neutre.' : `Multiplicateur ×${String(d.multiplier).replace('.', ',')} (${d.reason}).`,
        to: '/dca',
      });
    }
    if (cycle.data) {
      out.push({
        key: 'cycle',
        tone: cycle.data.zone.tone === 'up' ? 'up' : cycle.data.zone.tone === 'down' ? 'down' : 'neutral',
        title: `Marché : ${cycle.data.zone.label.toLowerCase()} (${Math.round(cycle.data.temperature)}/100)`,
        detail: cycle.data.zone.action,
      });
    }
    const total = pf.totals.value;
    if (total > 0) {
      // Éparpillement : trop de lignes, ou beaucoup de lignes minuscules.
      const rules = rulesOf(profile);
      const sc = scatterReport(pf.holdings, rules);
      if (sc.tooMany || (sc.tiny.length >= 3 && sc.tinyPct < 10)) {
        out.push({
          key: 'scatter',
          tone: 'warn',
          title: sc.tooMany ? `${sc.lines.length} lignes dans ton portefeuille (maximum conseillé : ${rules.maxLines})` : `${sc.tiny.length} lignes pèsent moins de ${String(rules.minLinePct).replace('.', ',')} % chacune`,
          detail: `Elles ne représentent que ${Math.round(sc.tinyPct * 10) / 10} % de ta valeur (${fmtMoney(sc.tinyValue, currency, 0)}) : même un ×10 ne change presque rien. Regroupe-les vers Bitcoin, ou renforce celles auxquelles tu crois vraiment.`,
          to: '/portefeuille',
        });
      } else if (sc.tooManyDiscovery) {
        out.push({ key: 'discovery-lines', tone: 'warn', title: `${sc.discoveryLines} lignes « découverte » ouvertes (maximum : ${rules.maxDiscoveryLines})`, detail: 'Finis une ligne avant d’en ouvrir une autre : renforce celles qui existent déjà.', to: '/portefeuille' });
      }
      const lines = rebalance(pf.alloc, profile.target);
      const worst = [...lines].sort((a, b) => Math.abs(b.currentPct - b.targetPct) - Math.abs(a.currentPct - a.targetPct))[0];
      if (worst && Math.abs(worst.currentPct - worst.targetPct) >= 10) {
        out.push({
          key: 'rebalance',
          tone: 'warn',
          title: `Rééquilibrage conseillé : ${BUCKET_LABEL[worst.bucket]}`,
          detail: `${Math.round(worst.currentPct)} % de ton portefeuille contre ${Math.round(worst.targetPct)} % visé. ${worst.diffValue > 0 ? 'Renforce' : 'Allège'} d’environ ${fmtMoney(Math.abs(worst.diffValue), currency, 0)}.`,
          to: '/portefeuille',
        });
      }
      const hot = cycle.data && cycle.data.temperature >= 60;
      for (const h of pf.holdings) {
        const weight = (h.value / total) * 100;
        if ((h.bucket === 'small') && weight > profile.rules.maxPerGemPct * 1.5) {
          out.push({ key: `gem-${h.key}`, tone: 'warn', title: `${h.symbol} pèse ${Math.round(weight)} % de ton portefeuille`, detail: `Ta règle pour une petite capi est de ${profile.rules.maxPerGemPct} % maximum. Envisage d’alléger.`, to: '/portefeuille' });
        } else if ((h.bucket === 'mid' || h.bucket === 'large') && weight > profile.rules.maxPerAltPct * 1.5) {
          out.push({ key: `alt-${h.key}`, tone: 'warn', title: `${h.symbol} pèse ${Math.round(weight)} % de ton portefeuille`, detail: `Ta limite par altcoin est de ${profile.rules.maxPerAltPct} %.`, to: '/portefeuille' });
        }
        if (hot && h.pnlPct != null && h.pnlPct >= 100 && h.bucket !== 'stable') {
          out.push({ key: `tp-${h.key}`, tone: 'down', title: `Sécurise une partie de tes gains sur ${h.symbol} (+${Math.round(h.pnlPct)} %)`, detail: 'Marché chaud : vendre 20 à 30 % pour récupérer ta mise réduit le risque sans quitter la tendance.', to: '/portefeuille' });
        }
      }
    } else {
      out.push({ key: 'start', tone: 'neutral', title: 'Ajoute tes avoirs', detail: 'Saisis tes achats ou une adresse de wallet publique pour des conseils personnalisés.', to: '/portefeuille' });
    }
    if (!profile.completed) out.unshift({ key: 'profile', tone: 'neutral', title: 'Définis ton profil investisseur (2 min)', detail: 'Boussole adaptera l’allocation, les tailles de position et les conseils à ton profil.', to: '/guide' });
    return out.slice(0, 7);
  }, [cycle.data, dca, pf, profile, currency, bd, exit]);
}
