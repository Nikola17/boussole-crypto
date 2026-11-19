// Outils rendement : comparateur multi-sources (Binance Earn + DeFi), simulateur Dual Investment,
// calculateur de perte impermanente. Lecture seule : aucun ordre n'est jamais passé depuis l'app.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useMarkets } from '../hooks/useMarket';
import { usePortfolio } from '../hooks/usePortfolio';
import { getBinanceFlexibleEarn } from '../api/binanceAccount';
import { DEFI_PROJECTS, getProjectPoolsEnriched, LENDING_PROJECTS } from '../api/yields';
import { compareRows } from '../lib/earnCompare';
import { RISK_LABEL } from '../lib/riskTier';
import { dualSim, dualScenarioLabel } from '../lib/dualInvestment';
import { impermanentLossPct, lpVsHodl } from '../lib/impermanentLoss';
import { fmtMoney, fmtNum } from '../lib/format';
import { openExternal } from '../lib/platform';
import { Badge, Card, Field, NumberInput, Spinner, Table, Td } from './ui';
import { useT } from '../hooks/useT';

const RISK_TONE = { 1: 'up', 2: 'warn', 3: 'down' } as const;

export function EarnTools() {
  const t = useT();
  const pf = usePortfolio();
  const currency = pf.currency;
  const binanceKey = useStore((s) => s.settings.binanceApiKey);
  const markets = useMarkets();

  const binance = useQuery({
    queryKey: ['binanceEarnCmp', binanceKey.slice(-6)],
    queryFn: () => getBinanceFlexibleEarn(binanceKey || undefined),
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const pools = useQuery({
    queryKey: ['defiPoolsEnriched'],
    queryFn: async () => {
      const out: { label: string; url?: string; list: Awaited<ReturnType<typeof getProjectPoolsEnriched>> }[] = [];
      for (const p of [...LENDING_PROJECTS, ...DEFI_PROJECTS]) out.push({ label: p.label, url: p.url, list: await getProjectPoolsEnriched(p.slug, 5) });
      return out;
    },
    staleTime: 30 * 60_000,
    retry: 1,
  });

  // Montant détenu par actif (symbole), en USD.
  const held = useMemo(() => {
    const bySymbol = new Map((markets.data ?? []).map((m) => [m.id, m.symbol.toUpperCase()]));
    const out: Record<string, number> = {};
    for (const h of pf.holdings) {
      const sym = h.coinId ? bySymbol.get(h.coinId) : undefined;
      if (sym) out[sym] = (out[sym] ?? 0) + h.valueUsd;
    }
    return out;
  }, [pf.holdings, markets.data]);

  const rows = useMemo(() => compareRows(binance.data ?? null, pools.data ?? [], held), [binance.data, pools.data, held]);
  const eur = (usd: number | null) => (usd == null ? '—' : fmtMoney(usd * pf.rate, currency, usd * pf.rate < 100 ? 2 : 0));

  return (
    <div className="space-y-4">
      <Card
        title={t('Comparateur de rendements')}
        subtitle={t('Binance Simple Earn + principaux protocoles DeFi, triés par APY — l’APY est variable et non garanti')}
      >
        {(binance.isLoading || pools.isLoading) && <Spinner label="Lecture des rendements…" />}
        {rows.length > 0 && (
          <Table head={[t('Source'), t('Actif'), 'APY', 'TVL', t('Risque'), t('Ta ligne'), t('Gain/an estimé')]}>
            {rows.slice(0, 25).map((r) => (
              <tr key={`${r.source}-${r.asset}`} className="hover:bg-surface-2">
                <Td left><span className="text-ink-2">{r.url ? <button type="button" className="inline-flex items-center gap-1 hover:text-accent" onClick={() => openExternal(r.url!)}>{r.source} <ExternalLink className="size-3" /></button> : r.source}</span></Td>
                <Td><span className="font-medium text-ink">{r.asset}</span></Td>
                <Td className="tnum text-ink">{r.apyPct != null ? `${fmtNum(r.apyPct, 2)} %` : '—'}</Td>
                <Td className="tnum text-muted">{r.tvlUsd != null ? `$${fmtNum(r.tvlUsd / 1_000_000, 1)} M` : '—'}</Td>
                <Td><Badge tone={RISK_TONE[r.risk]}>{RISK_LABEL[r.risk]}</Badge></Td>
                <Td className="tnum text-muted">{r.heldUsd > 0 ? eur(r.heldUsd) : '—'}</Td>
                <Td className={`tnum font-medium ${r.gainYearUsd && r.gainYearUsd > 0 ? 'text-up' : 'text-muted'}`}>{r.gainYearUsd != null && r.heldUsd > 0 ? `+${eur(r.gainYearUsd)}` : '—'}</Td>
              </tr>
            ))}
          </Table>
        )}
        {!binance.isLoading && !pools.isLoading && rows.length === 0 && (
          <p className="text-sm text-muted">{t('Rendements indisponibles pour le moment (API publiques injoignables).')}</p>
        )}
        <p className="mt-3 text-xs text-muted">
          {t('Règle : n’achète jamais un jeton uniquement pour son rendement. Le tier « Classique » reste un risque de contrat intelligent ; un APY très élevé signale souvent un risque caché (token inflationniste, pool jeune).')}
        </p>
      </Card>

      <DualSimulator currency={currency} rate={pf.rate} />
      <IlCalculator currency={currency} rate={pf.rate} />
    </div>
  );
}

function DualSimulator({ currency, rate }: { currency: 'EUR' | 'USD'; rate: number }) {
  const t = useT();
  const [amount, setAmount] = useState<number | ''>(1000);
  const [price, setPrice] = useState<number | ''>(60000);
  const [strike, setStrike] = useState<number | ''>(-10);
  const [days, setDays] = useState<number | ''>(7);
  const [apy, setApy] = useState<number | ''>(25);
  const [scenario, setScenario] = useState<number | ''>(-20);
  const money = (usd: number) => fmtMoney(usd * (currency === 'EUR' ? rate : 1), currency, usd * rate < 100 ? 2 : 0);

  const r = useMemo(() => {
    if ([amount, price, days, apy].some((v) => v === '' || !(Number(v) > 0)) || strike === '') return null;
    return dualSim({ amountUsd: Number(amount), priceNowUsd: Number(price), strikePct: Number(strike), days: Number(days), apyPct: Number(apy), priceChangePct: Number(scenario || 0) });
  }, [amount, price, strike, days, apy, scenario]);

  return (
    <Card title={t('Simulateur Dual Investment')} subtitle={t('Binance Advanced Earn : mise en stablecoin, strike, durée, APY — que se passe-t-il à l’échéance ?')}>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label={t('Montant (USDC)')}><NumberInput value={amount} onChange={setAmount} /></Field>
        <Field label={t('Prix actuel ($)')}><NumberInput value={price} onChange={setPrice} /></Field>
        <Field label={t('Strike (% vs cours)')}><NumberInput value={strike} onChange={setStrike} /></Field>
        <Field label={t('Durée (jours)')}><NumberInput value={days} onChange={setDays} /></Field>
        <Field label={t('APY annoncé (%)')}><NumberInput value={apy} onChange={setApy} /></Field>
        <Field label={t('Scénario prix (%)')}><NumberInput value={scenario} onChange={setScenario} /></Field>
      </div>
      {r && (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-muted">Strike</dt><dd className="tnum font-medium text-ink">{money(r.strikeUsd)}</dd></div>
          <div className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-muted">{t('Intérêts si strike non touché')}</dt><dd className="tnum font-medium text-up">+{money(r.interestUsd)}</dd></div>
          <div className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-muted">{r.converted ? t('Tu reçois (actif, au strike)') : t('Tu récupères')}</dt><dd className="tnum font-medium text-ink">{r.converted ? `${fmtNum(r.qtyIfConverted, 6)} unités` : money(r.valueAtScenarioUsd)}</dd></div>
          <div className="rounded-lg bg-surface-2 p-3">
            <dt className="text-xs text-muted">{t('Résultat du scénario')} ({dualScenarioLabel(Number(scenario || 0))})</dt>
            <dd className={`tnum font-semibold ${r.pnlPct >= 0 ? 'text-up' : 'text-down'}`}>{r.pnlPct >= 0 ? '+' : ''}{fmtNum(r.pnlPct, 1)} % · {money(r.valueAtScenarioUsd)}</dd>
          </div>
        </dl>
      )}
      <p className="mt-3 text-xs text-muted">
        {t('Si le prix passe sous le strike, tu reçois l’actif au strike (plus les intérêts) : si le prix continue de baisser, la valeur reçue peut être bien inférieure à ta mise. C’est le prix du rendement annoncé.')}
      </p>
    </Card>
  );
}

function IlCalculator({ currency, rate }: { currency: 'EUR' | 'USD'; rate: number }) {
  const t = useT();
  const [entry, setEntry] = useState<number | ''>(100);
  const [now, setNow] = useState<number | ''>(150);
  const [amount, setAmount] = useState<number | ''>(1000);
  const money = (usd: number) => fmtMoney(usd * (currency === 'EUR' ? rate : 1), currency, 0);

  const r = useMemo(() => {
    if ([entry, now, amount].some((v) => v === '' || !(Number(v) > 0))) return null;
    const ratio = Number(now) / Number(entry);
    return { ilPct: impermanentLossPct(ratio), ...lpVsHodl(Number(amount), ratio) };
  }, [entry, now, amount]);

  return (
    <Card title={t('Calculateur de perte impermanente (LP)')} subtitle={t('Ce que vaut une position de liquidité quand le prix du pool bouge, vs garder les deux actifs')}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('Prix du pool à l’entrée')}><NumberInput value={entry} onChange={setEntry} /></Field>
        <Field label={t('Prix du pool maintenant')}><NumberInput value={now} onChange={setNow} /></Field>
        <Field label={t('Valeur de la position ($)')}><NumberInput value={amount} onChange={setAmount} /></Field>
      </div>
      {r && (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-muted">{t('Perte impermanente')}</dt><dd className={`tnum font-semibold ${r.ilPct < 0 ? 'text-down' : 'text-ink'}`}>{fmtNum(r.ilPct, 1)} %</dd></div>
          <div className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-muted">{t('Valeur LP maintenant')}</dt><dd className="tnum font-medium text-ink">{money(r.lpUsd)}</dd></div>
          <div className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-muted">{t('Si tu avais gardé (HODL)')}</dt><dd className="tnum font-medium text-ink">{money(r.hodlUsd)} <span className="text-xs text-down">({fmtNum(r.diffPct, 1)} %)</span></dd></div>
        </dl>
      )}
      <p className="mt-3 text-xs text-muted">{t('La perte impermanente n’est « impermanente » que si le prix revient à son niveau d’entrée. Les frais de la LP peuvent la compenser si le volume est élevé — d’où l’intérêt de pools établis à fort volume.')}</p>
    </Card>
  );
}
