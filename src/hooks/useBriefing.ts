// Brief quotidien IA : génération manuelle ou automatique (une fois par jour).

import { useStore } from '../store/useStore';
import { useBriefingRun } from '../store/runStore';
import { useAiConfig } from '../components/AiBlocks';
import { summarizeAnalysis, useAiContext } from '../ai/context';
import { runBriefing } from '../ai/tasks';
import { useScan } from './useMarket';
import { useFocusCoins, useGuidance } from './useGuidance';
import { useBasket } from './useBasket';
import { todayContext } from '../ai/today';
import { rulesOf } from '../lib/profile';
import { isoDay } from '../lib/format';

export function useBriefing() {
  const cfg = useAiConfig();
  const ctx = useAiContext();
  const run = useBriefingRun();
  const addReport = useStore((s) => s.addReport);
  const reports = useStore((s) => s.reports);
  const focus = useFocusCoins();
  const guidance = useGuidance();
  const basket = useBasket();
  const profile = useStore((s) => s.profile);
  const scan = useScan(focus, ctx.cycle?.temperature);
  const latest = reports.find((r) => r.kind === 'briefing') ?? null;
  const todays = latest && latest.day === isoDay() ? latest : null;

  async function generate() {
    if (!cfg || useBriefingRun.getState().running) return null;
    const mayerBy: Record<string, number> = {};
    for (const [id, a] of scan.data?.entries() ?? []) if (a) mayerBy[id] = a.mayer;
    const watch = focus.map((c) => ({ actif: c.symbol.toUpperCase(), nom: c.name, ...summarizeAnalysis(scan.data?.get(c.id)) }));
    const controller = new AbortController();
    run.set({ running: true, error: null, progress: { step: 'Préparation du brief…' }, controller });
    try {
      const report = await runBriefing(cfg, {
        market: ctx.market(),
        portfolio: ctx.portfolio(),
        dca: ctx.dca(ctx.cycle?.temperature, mayerBy),
        profile: ctx.profile(),
        watchlist: watch,
        today: todayContext({ guidance, basketDue: basket.due, plan: basket.plan, rules: rulesOf(profile), portfolioComplete: ctx.portfolioComplete, temperature: ctx.cycle?.temperature ?? null }),
      }, (p) => useBriefingRun.getState().set({ progress: p }), controller.signal);
      addReport(report);
      return report;
    } catch (e) {
      run.set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      useBriefingRun.getState().set({ running: false, progress: null, controller: null });
    }
  }

  return {
    cfg,
    latest,
    todays,
    generate,
    running: run.running,
    progress: run.progress,
    error: run.error,
    cancel: () => run.controller?.abort(),
    ready: ctx.ready && !!ctx.cycle && !scan.isLoading,
  };
}
