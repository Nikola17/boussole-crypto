// Discipline du mois : régularité des échéances, achats d'impulsion nommés, journal à chaud tenu.
// Un score honnête et des faits — pas de jugement, pas de flatterie. Les données viennent du store, la note d'ailleurs.

import { Award } from 'lucide-react';
import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useToday } from '../hooks/useClock';
import { isBasketDay } from '../lib/basket';
import { isScheduledDay } from '../lib/dca';
import { disciplineMonth, monthKeyOf } from '../lib/discipline';
import { isoDay } from '../lib/format';
import { Card } from './ui';

const DOT = { ok: 'bg-up', warn: 'bg-warn', info: 'bg-muted' } as const;

export function DisciplineCard() {
  const basket = useStore((s) => s.basket);
  const plans = useStore((s) => s.dcaPlans);
  const basketExecs = useStore((s) => s.basketExecutions);
  const dcaExecs = useStore((s) => s.dcaExecutions);
  const transactions = useStore((s) => s.transactions);
  const notes = useStore((s) => s.hotNotes);
  const today = useToday();

  const report = useMemo(() => {
    const month = monthKeyOf(isoDay(today));
    // L'échéance du jour n'est manquée que si la journée est finie et rien n'est enregistré.
    const handled = new Set<string>();
    for (const e of basketExecs) handled.add(e.periodKey);
    for (const e of dcaExecs) handled.add(e.periodKey);
    const scheduledDays: string[] = [];
    // Seuls les jours écoulés du mois comptent : le 30 n'est pas raté le 12.
    for (let d = new Date(today.getFullYear(), today.getMonth(), 1); d <= today; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const key = isoDay(d);
      if (basket && basket.active && isBasketDay(basket, d)) scheduledDays.push(key);
      for (const p of plans) if (isScheduledDay(p, d)) scheduledDays.push(key);
    }
    const moved = transactions
      .filter((t) => t.date.slice(0, 7) === month)
      .map((t) => ({ date: t.date, symbol: t.symbol, type: t.type }));
    return disciplineMonth(
      {
        scheduledDays,
        handledDays: [...handled],
        buys: moved.filter((t) => t.type === 'buy').map((t) => ({ date: t.date, symbol: t.symbol })),
        sells: moved.filter((t) => t.type === 'sell').map((t) => ({ date: t.date, symbol: t.symbol })),
        notes,
      },
      month,
    );
  }, [basket, plans, basketExecs, dcaExecs, transactions, notes, today]);

  const tone = report.score >= 75 ? 'text-good' : report.score >= 50 ? 'text-warn' : 'text-critical';
  const label = today.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <Card
      title={<span className="inline-flex items-center gap-2"><Award className="size-4 text-accent" />Discipline du mois</span>}
      subtitle={label}
      actions={<span className={`text-lg font-semibold ${tone}`}>{report.score}/100</span>}
    >
      <ul className="space-y-1.5 text-sm">
        {report.items.map((it) => (
          <li key={it.text} className="flex items-start gap-2"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[it.tone]}`} /><span className="text-ink-2">{it.text}</span></li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Régularité des échéances (50 pts), achats maîtrisés — hors impulsions (30 pts), journal à chaud tenu (20 pts). Le score regarde ce que tu as fait, jamais ce que tu aurais pu faire.</p>
    </Card>
  );
}
