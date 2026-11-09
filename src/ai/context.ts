// Construit le « dossier » JSON transmis à l'IA : marché, cycle, portefeuille, DCA, profil.

import { useCallback } from 'react';
import { useStore } from '../store/useStore';
import { useAltSeason, useCategories, useCycle, useFearGreed, useGlobal, useMarkets, useTrending } from '../hooks/useMarket';
import { usePortfolio } from '../hooks/usePortfolio';
import { BUCKET_LABEL, BUCKET_ORDER } from '../lib/portfolio';
import { lastOccurrence, multiplierFor, nextOccurrences, periodKey, temperatureMultiplier } from '../lib/dca';
import { basketPeriodKey, lastBasketOccurrence, nextBasketOccurrences } from '../lib/basket';
import { isoDay } from '../lib/format';
import type { Analysis } from '../lib/signals';

const r2 = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

export function summarizeAnalysis(a: Analysis | null | undefined) {
  if (!a) return null;
  return {
    prix: r2(a.price, 6),
    signalInvestisseur: `${a.investor.label} (${a.investor.score})`,
    signalTrader: `${a.trader.label} (${a.trader.score})`,
    rsi14: r2(a.rsi14, 0),
    rsiHebdo: r2(a.rsiWeekly, 0),
    multipleMayer: r2(a.mayer),
    mm50: r2(a.sma50, 6),
    mm200: r2(a.sma200, 6),
    variation7j: r2(a.change7d, 1),
    variation30j: r2(a.change30d, 1),
    support: r2(a.plan?.support ?? null, 6),
    resistance: r2(a.plan?.resistance ?? null, 6),
    stopSuggere: r2(a.plan?.stop ?? null, 6),
    zoneAccumulation: a.accumulation ? [r2(a.accumulation.low, 6), r2(a.accumulation.high, 6)] : null,
    setups: a.setups.map((s) => s.label),
  };
}

export function useAiContext() {
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const dcaPlans = useStore((s) => s.dcaPlans);
  const dcaExecutions = useStore((s) => s.dcaExecutions);
  const basket = useStore((s) => s.basket);
  const basketExecutions = useStore((s) => s.basketExecutions);
  const theses = useStore((s) => s.theses);
  const markets = useMarkets();
  const global = useGlobal();
  const fng = useFearGreed(60);
  const cycle = useCycle();
  const alt = useAltSeason();
  const cats = useCategories();
  const trending = useTrending();
  const pf = usePortfolio();

  const market = useCallback(() => {
    const m = markets.data ?? [];
    const pick = (id: string) => {
      const c = m.find((x) => x.id === id);
      return c ? { prix: c.current_price, var24h: r2(c.price_change_percentage_24h, 1), var7j: r2(c.price_change_percentage_7d_in_currency ?? null, 1), var30j: r2(c.price_change_percentage_30d_in_currency ?? null, 1) } : null;
    };
    const top100 = m.slice(0, 100).filter((c) => c.price_change_percentage_24h != null);
    const sorted = [...top100].sort((a, b) => (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0));
    const f = fng.data ?? [];
    const g = global.data?.data;
    return {
      date: isoDay(),
      bitcoin: pick('bitcoin'),
      ethereum: pick('ethereum'),
      solana: pick('solana'),
      capitalisationTotaleUsd: g ? Math.round(g.total_market_cap.usd) : null,
      variationCapi24h: r2(g?.market_cap_change_percentage_24h_usd ?? null, 1),
      dominanceBtc: r2(g?.market_cap_percentage.btc ?? null, 1),
      dominanceEth: r2(g?.market_cap_percentage.eth ?? null, 1),
      fearGreed: f.length ? { aujourdhui: f[f.length - 1].value, ilYa7j: f[f.length - 8]?.value ?? null, ilYa30j: f[f.length - 31]?.value ?? null } : null,
      cycle: cycle.data ? {
        temperature: Math.round(cycle.data.temperature),
        zone: cycle.data.zone.label,
        consigne: cycle.data.zone.action,
        indicateurs: cycle.data.components.map((c) => `${c.label} : ${c.value}`),
      } : null,
      indiceSaisonAltcoins: alt,
      plusFortesHausses24h: sorted.slice(0, 5).map((c) => `${c.symbol.toUpperCase()} ${r2(c.price_change_percentage_24h, 1)} %`),
      plusFortesBaisses24h: sorted.slice(-5).reverse().map((c) => `${c.symbol.toUpperCase()} ${r2(c.price_change_percentage_24h, 1)} %`),
      narrativesChaudes: (cats.data ?? [])
        .filter((c) => c.market_cap && c.market_cap > 1e8 && c.market_cap_change_24h != null)
        .sort((a, b) => (b.market_cap_change_24h ?? 0) - (a.market_cap_change_24h ?? 0))
        .slice(0, 6)
        .map((c) => `${c.name} ${r2(c.market_cap_change_24h, 1)} %`),
      tendancesRecherche: (trending.data?.coins ?? []).slice(0, 7).map((c) => c.item.symbol),
    };
  }, [markets.data, global.data, fng.data, cycle.data, alt, cats.data, trending.data]);

  const portfolio = useCallback(() => {
    const total = pf.totals.value;
    const allocPct = Object.fromEntries(BUCKET_ORDER.map((b) => [BUCKET_LABEL[b], total > 0 ? r2((pf.alloc[b] / total) * 100, 1) : 0]));
    const targetPct = Object.fromEntries(BUCKET_ORDER.map((b) => [BUCKET_LABEL[b], profile.target[b]]));
    return {
      devise: settings.currency,
      valeurTotale: r2(total, 0),
      investi: r2(pf.totals.cost, 0),
      plusValueLatente: r2(pf.totals.unrealized, 0),
      plusValueLatentePct: r2(pf.totals.unrealizedPct, 1),
      plusValueRealisee: r2(pf.totals.realized, 0),
      repartitionActuellePct: allocPct,
      repartitionCiblePct: targetPct,
      positions: pf.holdings.slice(0, 25).map((h) => ({
        actif: h.symbol,
        valeur: r2(h.value, 0),
        poidsPct: total > 0 ? r2((h.value / total) * 100, 1) : 0,
        plusValuePct: r2(h.pnlPct ?? null, 1),
        poche: BUCKET_LABEL[h.bucket],
        source: h.source === 'wallet' ? `wallet ${h.walletLabel ?? ''}`.trim() : 'journal',
      })),
      theses: theses.map((t) => ({ actif: t.symbol.toUpperCase(), these: t.sentences.filter(Boolean).join(' '), lignesRouges: t.redLines })),
    };
  }, [pf, profile.target, settings.currency, theses]);

  const dca = useCallback((temperature?: number, mayerBySymbol?: Record<string, number>) => {
    const today = new Date();
    const f = fng.data ?? [];
    const out: Record<string, unknown>[] = dcaPlans.filter((p) => p.active).map((p) => {
      const m = multiplierFor(p.strategy, { fng: f[f.length - 1]?.value, temperature, mayer: mayerBySymbol?.[p.coinId] });
      const lastOcc = lastOccurrence(p, today);
      const key = lastOcc ? periodKey(p, lastOcc) : null;
      const done = key ? dcaExecutions.some((e) => e.planId === p.id && e.periodKey === key) : false;
      return {
        actif: p.symbol.toUpperCase(),
        montantBase: p.amount,
        frequence: p.frequency,
        strategie: p.strategy,
        multiplicateurDuMoment: m.mult,
        raison: m.reason,
        montantRecommande: Math.round(p.amount * m.mult),
        prochaineEcheance: nextOccurrences(p, today, 1)[0] ? isoDay(nextOccurrences(p, today, 1)[0]) : null,
        achatDeLaPeriodeFait: done,
      };
    });
    if (basket?.active) {
      const last = lastBasketOccurrence(basket, today);
      const key = last ? basketPeriodKey(last) : null;
      const next = nextBasketOccurrences(basket, new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1), 1)[0];
      out.push({
        actif: 'PANIER DCA (USDC)',
        montantBase: basket.amountUsd,
        frequence: `jours d'achat ${basket.daysOfWeek.join(', ')} (1 = lundi)`,
        strategie: 'cœur + une ligne découverte, cœur modulé par la température, réserve d’USDC',
        coeur: basket.core.map((c) => `${c.symbol.toUpperCase()} ${c.weight} %`),
        listeDecouverte: basket.discovery.map((c) => c.symbol.toUpperCase()),
        reserveUsdc: basket.reserveUsd,
        multiplicateurDuMoment: temperature != null ? temperatureMultiplier(temperature) : 1,
        prochaineEcheance: next ? isoDay(next) : null,
        achatDeLaPeriodeFait: !!key && basketExecutions.some((e) => e.basketId === basket.id && e.periodKey === key),
      });
    }
    return out;
  }, [dcaPlans, dcaExecutions, fng.data, basket, basketExecutions]);

  const profileCtx = useCallback(() => ({
    prenom: profile.name || null,
    archetype: profile.archetype,
    horizon: ['court terme (< 1 an)', 'moyen terme (1-4 ans)', 'long terme (4 ans et +)'][profile.horizon - 1],
    toleranceRisque: `${profile.riskTolerance}/5`,
    experience: ['débutant', 'intermédiaire', 'avancé'][profile.experience - 1],
    budgetMensuel: profile.monthlyBudget,
    capitalPrevu: profile.capital,
    regles: {
      maxParPepitePct: profile.rules.maxPerGemPct,
      maxParAltcoinPct: profile.rules.maxPerAltPct,
      reserveStablecoinsPct: profile.rules.cashReservePct,
      risqueParTradePct: profile.rules.riskPerTradePct,
    },
    centresInteret: Object.entries(profile.interests).filter(([, v]) => v).map(([k]) => k),
  }), [profile]);

  return { market, portfolio, dca, profile: profileCtx, cycle: cycle.data, ready: !!markets.data };
}

export function toJsonBlock(label: string, data: unknown): string {
  return `<${label}>\n${JSON.stringify(data, null, 1)}\n</${label}>`;
}
