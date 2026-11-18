// Carte « Écarts à ta cible » : dérive du portefeuille vs le profil, calculée par tes règles uniquement.

import { Scale } from 'lucide-react';
import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useCycle } from '../hooks/useMarket';
import { usePortfolio } from '../hooks/usePortfolio';
import { aggregateByCoin } from '../lib/holdings';
import { driftNotices } from '../lib/drift';
import { Link } from '../router';
import { Card } from './ui';

const TONE_DOT = { up: 'bg-good', down: 'bg-critical', warn: 'bg-warn', neutral: 'bg-axis' } as const;

export function DriftCard() {
  const target = useStore((s) => s.profile.target);
  const rules = useStore((s) => s.profile.rules);
  const archetype = useStore((s) => s.profile.archetype);
  const currency = useStore((s) => s.settings.currency);
  const pf = usePortfolio();
  const cycle = useCycle();

  const notices = useMemo(() => {
    const lines = aggregateByCoin(pf.holdings).map((l) => ({ symbol: l.symbol, bucket: l.bucket, value: l.value }));
    return driftNotices({
      alloc: pf.alloc,
      target,
      lines,
      rules,
      euphoria: (cycle.data?.temperature ?? 0) >= 80,
    });
  }, [pf.alloc, pf.holdings, target, rules, cycle.data?.temperature]);

  if (!pf.totals.value) return null;

  return (
    <Card title={<span className="inline-flex items-center gap-2"><Scale className="size-4 text-accent" />Écarts à ta cible</span>} subtitle={`Profil ${archetype} · calculé par tes règles, en ${currency}`}>
      {notices.length === 0 && <p className="text-sm text-muted">Tout est aligné sur ta cible. Rien à corriger aujourd’hui.</p>}
      <ul className="space-y-2">
        {notices.slice(0, 6).map((n) => (
          <li key={n.key}>
            <Link to={n.to ?? '/portefeuille'} className="block rounded-lg bg-surface-2 p-3 hover:bg-surface-3">
              <div className="flex items-start gap-2">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE_DOT[n.tone]}`} aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{n.title}</div>
                  <div className="mt-0.5 text-xs text-ink-2">{n.detail}</div>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
