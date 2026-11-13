// « À l'horizon » : les événements macro/crypto qui peuvent bouger le marché, avec la conduite à tenir.
// Rien à configurer : le calendrier (Fed, CPI, échéances de dérivés, halving) vit dans lib/macro.ts.

import { CalendarClock } from 'lucide-react';
import { useMemo } from 'react';
import { Card, InfoTip } from './ui';
import { macroWhen, nextMacroEvents, type MacroEvent } from '../lib/macro';
import { fmtDate } from '../lib/format';

const TONE: Record<MacroEvent['kind'], string> = {
  fomc: 'text-warn',
  cpi: 'text-warn',
  expiry: 'text-muted',
  halving: 'text-accent',
};

export function MacroCard({ now = new Date(), max = 4, className }: { now?: Date; max?: number; className?: string }) {
  const events = useMemo(() => nextMacroEvents(now, max, 45), [now, max]);
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <CalendarClock className="size-4 text-accent" />
          À l’horizon du marché
          <InfoTip>
            Les événements qui font bouger le bitcoin que ton portefeuille le veuille ou non : décisions de la Fed (FOMC),
            publication de l’inflation américaine (CPI), échéances trimestrielles des futures et options. Dates tenues
            à jour dans l’application ; le jour J, la conduite à tenir est rappelée sur Telegram par le serveur.
          </InfoTip>
        </span>
      }
      subtitle="Ce qui peut bouger les cours, et quoi faire à ce moment-là"
      className={className}
    >
      {events.length === 0 ? (
        <p className="text-sm text-muted">Aucun événement macro connu dans les 45 prochains jours.</p>
      ) : (
        <ul className="divide-y divide-line">
          {events.map((e) => (
            <li key={e.id} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <span className={`text-sm font-medium ${TONE[e.kind]}`}>{e.label}</span>
                  <span className="ml-2 text-xs text-muted">{fmtDate(e.date)}</span>
                </div>
                <span className={`shrink-0 text-xs font-medium ${e.daysTo <= 1 ? 'text-warn' : 'text-muted'}`}>{macroWhen(e)}</span>
              </div>
              {e.daysTo <= 7 && <p className="mt-1 text-xs leading-relaxed text-ink-2">{e.advice}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
