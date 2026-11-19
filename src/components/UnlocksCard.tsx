// Carte « Déblocages de tokens » : suivis manuellement (aucun agrégateur gratuit fiable en 2026),
// alertes visuelles J-1 / J-7 dans les 30 jours. Synchronisés entre appareils.

import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore, newId } from '../store/useStore';
import { upcomingUnlocks, unlockBadge } from '../lib/unlocks';
import { isoDay } from '../lib/format';
import { Badge, Button, Card, Field, Input } from './ui';

export function UnlocksCard() {
  const unlocks = useStore((s) => s.unlocks);
  const upsertUnlock = useStore((s) => s.upsertUnlock);
  const removeUnlock = useStore((s) => s.removeUnlock);
  const today = isoDay(new Date());
  const list = useMemo(() => upcomingUnlocks(unlocks, today, 30), [unlocks, today]);

  const [symbol, setSymbol] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const add = () => {
    if (!symbol.trim() || !date) return;
    upsertUnlock({
      id: newId(),
      symbol: symbol.trim().toUpperCase(),
      date,
      amount: amount.trim() ? Number(amount) : undefined,
      note: note.trim() || undefined,
    });
    setSymbol('');
    setDate('');
    setAmount('');
    setNote('');
  };

  return (
    <Card title={<span className="inline-flex items-center gap-2"><CalendarClock className="size-4 text-accent" />Déblocages de tokens</span>} subtitle="Saisis-les à la main (Tokenomist & co. ne donnent rien gratuitement) : alerte visuelle à J-7 et J-1">
      {!list.length && <p className="text-sm text-muted">Aucun déblocage dans les 30 prochains jours.</p>}
      <ul className="divide-y divide-line">
        {list.map((u) => {
          const badge = unlockBadge(u.daysUntil);
          return (
            <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-ink">{u.symbol}</span>
                <span className="ml-2 text-xs text-muted">{u.date} · dans {u.daysUntil} j</span>
                {u.amount != null && <span className="ml-2 text-xs text-muted">{u.amount.toLocaleString('fr-FR')} débloqués</span>}
                {u.note && <div className="truncate text-xs text-ink-2">{u.note}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {badge && <Badge tone={badge === 'J-1' ? 'down' : 'warn'}>{badge}</Badge>}
                <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} aria-label="Supprimer" onClick={() => removeUnlock(u.id)} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-4">
        <Field label="Token"><Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="SOL" /></Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Montant (opt.)"><Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1 000 000" inputMode="decimal" /></Field>
        <div className="flex items-end gap-2">
          <Field label="Note (opt.)" className="flex-1"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cliff équipe…" /></Field>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={add} disabled={!symbol.trim() || !date} aria-label="Ajouter" />
        </div>
      </div>
    </Card>
  );
}
