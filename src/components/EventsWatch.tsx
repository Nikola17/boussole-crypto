// « Plus » : calendrier des lancements (Launchpool/Launchpad, alertes J-7/J-1/J-0 via le VPS)
// et watchlist copy trading (stats publiques, jamais de copie automatique).

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Trash2, UserStar, Users } from 'lucide-react';
import { useStore } from '../store/useStore';
import { upcomingDated } from '../lib/unlocks';
import { isoDay, fmtDate } from '../lib/format';
import { uid } from '../lib/format';
import { getLeaderboard, getTraderStats } from '../api/copyTrading';
import { COPY_RISK_LABEL, copyRiskFlag, type TraderStats } from '../lib/copyWatch';
import { Badge, Button, Card, Field, Input, Spinner } from './ui';
import { useT } from '../hooks/useT';

const BADGE_TONE = { 0: 'down', 1: 'warn', 7: 'neutral' } as const;

function LaunchCalendarCard() {
  const t = useT();
  const events = useStore((s) => s.launchEvents);
  const upsert = useStore((s) => s.upsertLaunchEvent);
  const remove = useStore((s) => s.removeLaunchEvent);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const today = isoDay(new Date());
  const next = useMemo(() => upcomingDated(events, today, 30), [events, today]);

  return (
    <Card title={<span className="inline-flex items-center gap-2"><CalendarDays className="size-4 text-accent" />{t('Calendrier Launchpool / Launchpad')}</span>}
      subtitle={t('Ajoute les lancements Binance : le serveur t’alerte à J-7, J-1 et J-0 sur Telegram (app fermée comprise).')}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('Nom (ex : Launchpool — TIA)')}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Launchpool — TOKEN" /></Field>
        <Field label={t('Début (AAAA-MM-JJ)')}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t('Fin (optionnel)')}><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
      </div>
      <div className="mt-3">
        <Button size="sm" variant="primary" disabled={!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
          onClick={() => { upsert({ id: uid(), name: name.trim(), date, endDate: endDate || undefined }); setName(''); setDate(''); setEndDate(''); }}>
          {t('Ajouter')}
        </Button>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {next.length === 0 && <li className="py-2 text-sm text-muted">{t('Aucun événement à venir. Les alertes J-7/J-1/J-0 partent du serveur (VPS).')}</li>}
        {next.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium text-ink">{e.name}</span>
              <span className="ml-2 text-xs text-muted">{fmtDate(new Date(e.date))}{e.endDate ? ` → ${fmtDate(new Date(e.endDate))}` : ''}</span>
            </span>
            <span className="flex items-center gap-2">
              <Badge tone={BADGE_TONE[e.daysUntil === 0 ? 0 : e.daysUntil === 1 ? 1 : 7]}>{e.daysUntil === 0 ? 'J-0' : e.daysUntil === 1 ? 'J-1' : `J-${e.daysUntil}`}</Badge>
              <button type="button" aria-label={t('Supprimer')} onClick={() => remove(e.id)} className="text-muted hover:text-down"><Trash2 className="size-4" /></button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CopyWatchCard() {
  const t = useT();
  const traders = useStore((s) => s.copyTraders);
  const upsert = useStore((s) => s.upsertCopyTrader);
  const remove = useStore((s) => s.removeCopyTrader);
  const [name, setName] = useState('');
  const [portfolioId, setPortfolioId] = useState('');
  const board = useQuery({ queryKey: ['copyLeaderboard'], queryFn: () => getLeaderboard('30d', 10), staleTime: 30 * 60_000, retry: 0 });
  const stats = useQuery({
    queryKey: ['copyStats', traders.map((x) => x.portfolioId ?? x.id).join(',')],
    queryFn: async () => {
      const out: Record<string, (TraderStats & { name: string }) | null> = {};
      for (const tr of traders) {
        if (!tr.portfolioId) { out[tr.id] = null; continue; }
        out[tr.id] = await getTraderStats(tr.portfolioId);
      }
      return out;
    },
    enabled: traders.some((x) => x.portfolioId),
    staleTime: 30 * 60_000,
    retry: 0,
  });

  return (
    <Card title={<span className="inline-flex items-center gap-2"><UserStar className="size-4 text-accent" />{t('Copy trading — watchlist')}</span>}
      subtitle={t('Stats publiques uniquement : Boussole ne copie jamais automatiquement. Le serveur alerte si un suivi dévisse (drawdown/ROI 30 j).')}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('Nom du trader')}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Surnom" /></Field>
        <Field label={t('Portfolio ID public (optionnel)')}><Input value={portfolioId} onChange={(e) => setPortfolioId(e.target.value.trim())} placeholder="…" autoComplete="off" /></Field>
        <div className="flex items-end">
          <Button size="sm" variant="primary" disabled={!name.trim()} onClick={() => { upsert({ id: uid(), name: name.trim(), portfolioId: portfolioId || undefined }); setName(''); setPortfolioId(''); }}>{t('Ajouter')}</Button>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {traders.length === 0 && <li className="py-2 text-sm text-muted">{t('Aucun trader suivi. Le leaderboard public ci-dessous aide à en choisir (vérifie toujours toi-même).')}</li>}
        {traders.map((tr) => {
          const st = stats.data?.[tr.id];
          const risk = st ? copyRiskFlag(st) : null;
          return (
            <li key={tr.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-ink">{tr.name}</span>
                {st && (
                  <span className="ml-2 text-xs text-muted">
                    ROI 30 j {st.roi30dPct != null ? `${st.roi30dPct >= 0 ? '+' : ''}${st.roi30dPct.toFixed(1)} %` : '—'} · DD max {st.maxDrawdown30dPct != null ? `${st.maxDrawdown30dPct.toFixed(1)} %` : '—'}
                  </span>
                )}
                {!tr.portfolioId && <span className="ml-2 text-xs text-muted">({t('sans portfolio ID : pas de stats auto')})</span>}
              </span>
              <span className="flex items-center gap-2">
                {risk && <Badge tone={risk === 'danger' ? 'down' : risk === 'warn' ? 'warn' : 'up'}>{COPY_RISK_LABEL[risk]}</Badge>}
                <button type="button" aria-label={t('Supprimer')} onClick={() => remove(tr.id)} className="text-muted hover:text-down"><Trash2 className="size-4" /></button>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 border-t border-line pt-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><Users className="size-3.5" /> {t('Leaderboard public Binance (30 j) — pour repérer, pas pour copier')}</div>
        {board.isLoading && <Spinner label="Lecture du leaderboard…" />}
        {board.data != null && board.data.length === 0 && <p className="text-xs text-muted">{t('Leaderboard indisponible depuis ce réseau (Binance bloque certaines IP/régions).')}</p>}
        {board.data && board.data.length > 0 && (
          <ul className="space-y-1">
            {board.data.slice(0, 6).map((b) => (
              <li key={b.portfolioId} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-ink-2">{b.name}</span>
                <span className="tnum text-muted">
                  {b.roi30dPct != null ? `${b.roi30dPct >= 0 ? '+' : ''}${b.roi30dPct.toFixed(1)} %` : '—'}
                  {b.maxDrawdown30dPct != null ? ` · DD ${b.maxDrawdown30dPct.toFixed(1)} %` : ''}
                  <Badge tone={copyRiskFlag(b) === 'danger' ? 'down' : copyRiskFlag(b) === 'warn' ? 'warn' : 'up'} className="ml-2">{COPY_RISK_LABEL[copyRiskFlag(b)]}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function EventsWatch() {
  return (
    <div className="space-y-4">
      <LaunchCalendarCard />
      <CopyWatchCard />
    </div>
  );
}
