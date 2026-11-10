// Bilan de la semaine : DCA faits ou manqués, réserve, règles respectées, écart avec Bitcoin.

import { useToday } from '../hooks/useClock';
import { CalendarCheck, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useBenchmark } from '../hooks/useBenchmark';
import { useCycle } from '../hooks/useMarket';
import { usePortfolio } from '../hooks/usePortfolio';
import { useAiConfig } from './AiBlocks';
import { isBasketDay } from '../lib/basket';
import { isoDay } from '../lib/format';
import { rulesOf } from '../lib/profile';
import { scatterReport } from '../lib/scatter';
import { weeklyReview } from '../lib/weekly';
import { runWeeklySummary } from '../ai/tasks';
import { Button, Card } from './ui';
import { Markdown } from './Markdown';

const DOT = { ok: 'bg-up', warn: 'bg-warn', info: 'bg-muted' } as const;

export function WeeklyCard() {
  const basket = useStore((s) => s.basket);
  const execs = useStore((s) => s.basketExecutions);
  const profile = useStore((s) => s.profile);
  const pf = usePortfolio();
  const cycle = useCycle();
  const bench = useBenchmark();
  const cfg = useAiConfig();
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = useToday();
  const monday = useMemo(() => new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7)), [today]);

  const report = useMemo(() => {
    if (!basket) return null;
    const scheduled: string[] = [];
    const todayKey = isoDay(today);
    const doneToday = execs.some((e) => e.basketId === basket.id && e.periodKey === todayKey);
    for (let d = new Date(monday); d <= today; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      // L'échéance du jour n'est « manquée » que si elle est passée : tant que la journée n'est pas finie, elle est seulement à faire.
      if (isBasketDay(basket, d) && (isoDay(d) !== todayKey || doneToday)) scheduled.push(isoDay(d));
    }
    const rules = rulesOf(profile);
    const sc = scatterReport(pf.holdings, rules);
    return weeklyReview({
      scheduled,
      executions: execs.filter((e) => e.basketId === basket.id),
      budgetUsd: basket.amountUsd,
      reserveUsd: basket.reserveUsd,
      lines: sc.lines.length,
      maxLines: rules.maxLines,
      tinyLines: sc.tiny.length,
      discoveryLines: sc.discoveryLines,
      maxDiscoveryLines: rules.maxDiscoveryLines,
      vsBtcPct: bench.all ? bench.all.diffPct : null,
      temperature: cycle.data?.temperature ?? null,
    });
  }, [basket, execs, profile, pf.holdings, bench.all, cycle.data, monday, today]);

  if (!basket || !report) return null;

  async function ask() {
    if (!cfg || !report) return;
    setBusy(true);
    try {
      const r = await runWeeklySummary(cfg, report);
      setSummary(r.text);
    } catch (e) {
      setSummary(e instanceof Error ? e.message : 'Résumé impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={<span className="inline-flex items-center gap-2"><CalendarCheck className="size-4 text-accent" />Bilan de la semaine</span>}
      subtitle={`Depuis lundi ${monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}
      actions={cfg && <Button size="sm" loading={busy} icon={<Sparkles className="size-3.5" />} onClick={() => void ask()}>Résumé IA</Button>}
    >
      <ul className="space-y-1.5 text-sm">
        {report.items.map((it) => (
          <li key={it.text} className="flex items-start gap-2"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[it.tone]}`} /><span className="text-ink-2">{it.text}</span></li>
        ))}
      </ul>
      {summary && <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3 text-sm"><Markdown>{summary}</Markdown></div>}
    </Card>
  );
}
