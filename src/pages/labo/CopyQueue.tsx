// Centre « À copier aujourd'hui » : file unifiée des ordres récents des autopilotes avec tickets prêts à exécuter,
// montant calculé sur le vrai portefeuille, lien direct Binance / Crypto.com, copie presse-papiers et saisie 1-clic.

import { Check, ClipboardCopy, ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useFx } from '../../hooks/useMarket';
import { buildCopyTickets, formatCopyTicketText, tradeLinksForAccounts, type CopyTicket } from '../../lib/lab/copyTickets';
import { CEX_PLATFORMS, DEX_PLATFORMS, tradeLinkFor } from '../../lib/platforms';
import { fmtDate, fmtNum, fmtPrice, isoDay } from '../../lib/format';
import { openExternal } from '../../lib/platform';
import { navigate } from '../../router';
import { Badge, Banner, Button, Card, Empty, Segmented, Select } from '../../components/ui';
import { CopyForms } from './CopyReport';

function TicketRow({
  t, onCopy, links, extraPlatformId,
}: {
  t: CopyTicket;
  onCopy: (t: CopyTicket) => void;
  links: { id: string; label: string; url: string }[];
  extraPlatformId: string;
}) {
  const [copiedTxt, setCopiedTxt] = useState(false);
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(formatCopyTicketText(t));
      setCopiedTxt(true);
      setTimeout(() => setCopiedTxt(false), 1800);
    } catch { /* presse-papiers indisponible */ }
  };
  const extraUrl = extraPlatformId ? tradeLinkFor(extraPlatformId, t.symbol) : null;
  const extraLabel = [...CEX_PLATFORMS, ...DEX_PLATFORMS].find((p) => p.id === extraPlatformId)?.name.replace(/\s*\([^)]*\)/g, '');
  const allLinks = extraUrl && extraLabel && !links.some((l) => l.id === extraPlatformId)
    ? [{ id: extraPlatformId, label: extraLabel, url: extraUrl }, ...links]
    : links;
  return (
    <li className="space-y-2 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={t.side === 'buy' ? 'up' : 'down'}>{t.side === 'buy' ? (t.kind === 'limit' ? 'ACHAT LIMITE' : 'ACHAT') : 'VENTE'}</Badge>
        <span className="font-semibold text-ink">{t.symbol.toUpperCase()}/USDC</span>
        <span className="text-xs text-muted">· {t.portfolioName} · {fmtDate(t.day)}</span>
        {t.openRealTradeId && <Badge tone="warn">Position réelle ouverte à clôturer</Badge>}
        {t.status === 'copied' && <Badge tone="up">Copié</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-2.5 text-xs sm:grid-cols-4">
        <div>
          <div className="text-muted">Prix limite suggéré</div>
          <div className="tnum font-semibold text-ink">{fmtPrice(t.suggestedLimitUsd, 'USD')}</div>
          {t.maxChaseUsd != null && <div className="tnum text-muted">Max : {fmtPrice(t.maxChaseUsd, 'USD')}</div>}
        </div>
        <div>
          <div className="text-muted">Montant réel suggéré</div>
          <div className="tnum font-semibold text-ink">{t.suggestedRealUsd != null ? `${fmtNum(t.suggestedRealUsd, 0)} USDC` : 'Selon position'}</div>
          {t.suggestedQty != null && <div className="tnum text-muted">≈ {fmtNum(t.suggestedQty, 4)} {t.symbol.toUpperCase()}</div>}
        </div>
        <div>
          <div className="text-muted">Stop-Loss</div>
          <div className="tnum font-semibold text-ink">{t.stopUsd != null ? fmtPrice(t.stopUsd, 'USD') : '—'}</div>
          {t.trailing && <div className="text-muted">Trailing {t.trailing.value}{t.trailing.mode === 'pct' ? ' %' : '× ATR'}</div>}
        </div>
        <div>
          <div className="text-muted">Objectifs (TP)</div>
          <div className="tnum font-semibold text-ink">{t.targetUsd != null ? fmtPrice(t.targetUsd, 'USD') : t.tpLegs?.length ? t.tpLegs.map((l) => `${l.rMultiple}R`).join(' / ') : '—'}</div>
        </div>
      </div>
      <p className="text-xs text-ink-2">{t.reason}</p>
      <div className="flex flex-wrap items-center gap-2">
        {t.status === 'pending' && (
          <Button size="sm" variant="primary" onClick={() => onCopy(t)}>
            {t.openRealTradeId ? 'Clôturer mon trade réel' : 'J’ai copié en réel'}
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={copiedTxt ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />} onClick={() => void copyText()}>
          {copiedTxt ? 'Copié !' : 'Copier le ticket'}
        </Button>
        {allLinks.map((l) => (
          <Button key={l.id} size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => openExternal(l.url)}>{l.label}</Button>
        ))}
      </div>
    </li>
  );
}

export function CopyQueueTab() {
  const portfolios = useStore((s) => s.paperPortfolios);
  const days = useStore((s) => s.paperDays);
  const txs = useStore((s) => s.transactions);
  const trades = useStore((s) => s.trades);
  const accounts = useStore((s) => s.accounts);
  const riskPct = useStore((s) => s.profile.rules.riskPerTradePct ?? 1);
  const currency = useStore((s) => s.settings.currency);
  const pf = usePortfolio();
  const fx = useFx();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [lookback, setLookback] = useState<number>(3);
  const [extraPlatformId, setExtraPlatformId] = useState<string>('');
  const [active, setActive] = useState<CopyTicket | null>(null);

  const realUsd = pf.totals ? pf.totals.value / (currency === 'EUR' ? fx || 1 : 1) : 0;
  const tickets = useMemo(() => buildCopyTickets({
    portfolios, days, txs, trades, verdicts: {}, realPortfolioUsd: realUsd, riskPerTradePct: riskPct, today: isoDay(), lookbackDays: lookback,
  }), [portfolios, days, txs, trades, realUsd, riskPct, lookback]);

  const shown = filter === 'pending' ? tickets.filter((t) => t.status === 'pending') : tickets;
  const pendingCount = tickets.filter((t) => t.status === 'pending').length;

  return (
    <div className="space-y-4">
      <Banner tone="info" title="Copie manuelle contrôlée">
        Chaque ticket calcule la taille adaptée à ton vrai portefeuille (plafonnée par ta règle de risque au stop). Les liens directs s’adaptent automatiquement à tes comptes CEX/DEX (ou à la plateforme choisie ci-dessous).
      </Banner>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'pending', label: `À copier (${pendingCount})` },
          { value: 'all', label: `Tous (${tickets.length})` },
        ]} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-48">
            <Select value={extraPlatformId} onChange={(e) => setExtraPlatformId(e.target.value)} aria-label="Plateforme de trading">
              <option value="">Ouvrir sur… (mes comptes)</option>
              <optgroup label="Centralisées (50)">
                {CEX_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
              <optgroup label="Décentralisées (50)">
                {DEX_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
            </Select>
          </div>
          <Segmented value={String(lookback)} onChange={(v) => setLookback(Number(v))} options={[
            { value: '1', label: 'Aujourd’hui' },
            { value: '3', label: '3 jours' },
            { value: '7', label: '7 jours' },
          ]} />
        </div>
      </div>
      <Card title="Tickets d’ordres prêts à copier" subtitle="Du plus urgent au plus ancien (clôtures sur positions réelles en tête)">
        {shown.length === 0 ? (
          <Empty title="Aucun ordre à copier sur cette période">
            Lance plusieurs autopilotes actifs (Retour à la moyenne, Swing 4H, Grid Auto, Rotation Momentum…) dans l’onglet Portefeuilles papier pour recevoir des ordres quotidiens ici.
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((t) => (
              <TicketRow
                key={t.id}
                t={t}
                onCopy={setActive}
                links={tradeLinksForAccounts(t.symbol, accounts)}
                extraPlatformId={extraPlatformId}
              />
            ))}
          </ul>
        )}
      </Card>
      {active && (
        <CopyForms
          p={active.portfolio}
          target={{ day: active.day, fill: active.fill }}
          trader={active.isTrader}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

/** Carte compacte pour le Cockpit : signale dès l'accueil les ordres papier prêts à copier aujourd'hui. */
export function CopyTodayCard() {
  const portfolios = useStore((s) => s.paperPortfolios);
  const days = useStore((s) => s.paperDays);
  const txs = useStore((s) => s.transactions);
  const trades = useStore((s) => s.trades);
  const riskPct = useStore((s) => s.profile.rules.riskPerTradePct ?? 1);
  const pf = usePortfolio();
  const fx = useFx();
  const currency = useStore((s) => s.settings.currency);
  const realUsd = pf.totals ? pf.totals.value / (currency === 'EUR' ? fx || 1 : 1) : 0;

  const pending = useMemo(() => buildCopyTickets({
    portfolios, days, txs, trades, verdicts: {}, realPortfolioUsd: realUsd, riskPerTradePct: riskPct, today: isoDay(), lookbackDays: 2,
  }).filter((t) => t.status === 'pending'), [portfolios, days, txs, trades, realUsd, riskPct]);

  if (!pending.length) return null;
  return (
    <Card
      title={`À copier aujourd’hui (${pending.length})`}
      subtitle="Ordres récents de tes autopilotes papier prêts à exécuter"
      actions={<Button size="sm" variant="primary" onClick={() => navigate('/labo?tab=copier')}>Ouvrir les tickets</Button>}
    >
      <ul className="divide-y divide-line text-sm">
        {pending.slice(0, 4).map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex items-center gap-2">
              <Badge tone={t.side === 'buy' ? 'up' : 'down'}>{t.side === 'buy' ? 'ACHAT' : 'VENTE'}</Badge>
              <strong className="text-ink">{t.symbol.toUpperCase()}</strong>
              <span className="text-xs text-muted">{t.portfolioName}</span>
              {t.openRealTradeId && <Badge tone="warn">Clôture réelle</Badge>}
            </span>
            <span className="tnum text-xs text-ink-2">
              ≈ {fmtPrice(t.suggestedLimitUsd, 'USD')}{t.suggestedRealUsd != null ? ` · ${fmtNum(t.suggestedRealUsd, 0)} USDC` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
