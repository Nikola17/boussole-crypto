// Enveloppe DeFi : règles posées à froid pour les petits paris sur Solana (compte Phantom séparé du Ledger).

import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { newId, useStore } from '../store/useStore';
import { usePortfolio } from '../hooks/usePortfolio';
import { scanSolana, type SecurityReport } from '../api/security';
import { getTokenPairs } from '../api/dex';
import { betViolations, envelopeStatus, pauseEnd, preBuyChecks, type PreBuyResult } from '../lib/envelope';
import { fmtDate, fmtMoney, fmtNum, isoDay } from '../lib/format';
import { Link } from '../router';
import type { DefiBet, DefiEnvelope } from '../types';
import { Badge, Banner, Button, Card, Field, Input, Modal, NumberInput, Stat, Table, Td, Toggle } from './ui';

const SOL_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function Envelope() {
  const env = useStore((s) => s.envelope);
  const setEnv = useStore((s) => s.setEnvelope);
  const bets = useStore((s) => s.defiBets);
  const upsert = useStore((s) => s.upsertDefiBet);
  const pf = usePortfolio();
  const totalUsd = useMemo(() => pf.holdings.reduce((s, h) => s + h.valueUsd, 0), [pf.holdings]);
  const status = useMemo(() => envelopeStatus(bets, totalUsd, env), [bets, totalUsd, env]);
  const money = (usd: number) => fmtMoney(usd * pf.rate, pf.currency, 0);

  return (
    <div className="space-y-4">
      <Banner tone="info" title="Des paris, pas un plan : un cadre pour ne pas se faire plumer">
        98,6 % des tokens lancés sur pump.fun entre janvier 2024 et mars 2025 étaient des arnaques ou des pump-and-dumps (rapport Solidus Labs). Le swap de Phantom prend 0,85 %, plus le slippage. Garde un <b>compte Phantom séparé</b> : ne connecte jamais ton Ledger à ces sites. Suis ce compte ici en lecture seule dans <Link to="/portefeuille?tab=wallets" className="font-medium text-accent hover:underline">Wallet → adresse Solana</Link>.
      </Banner>

      <Card title="Mes règles" subtitle="Fixées à froid, avant d’acheter" actions={<Toggle checked={env.enabled} onChange={(v) => setEnv({ enabled: v })} label={env.enabled ? 'Active' : 'Désactivée'} />}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="Plafond (% du portefeuille)"><NumberInput value={env.capPct} onChange={(v) => setEnv({ capPct: v === '' ? 0 : v })} /></Field>
          <Field label="Achat maximal (USD)"><NumberInput value={env.maxPerBuyUsd} onChange={(v) => setEnv({ maxPerBuyUsd: v === '' ? 0 : v })} /></Field>
          <Field label="Retirer la mise à ×" hint="Tu sors ta mise de départ à ce multiple."><NumberInput value={env.takeProfitMultiple} onChange={(v) => setEnv({ takeProfitMultiple: v === '' ? 2 : v })} /></Field>
          <Field label="Pause si perte de (%)" hint="Un mois sans acheter."><NumberInput value={env.pauseDrawdownPct} onChange={(v) => setEnv({ pauseDrawdownPct: v === '' ? 50 : v })} /></Field>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Plafond" value={money(status.capUsd)} hint={`${fmtNum(env.capPct, 1)} % de ${money(totalUsd)}`} />
          <Stat label="Engagé" value={money(status.exposureUsd)} />
          <Stat label="Place restante" value={money(status.roomUsd)} />
          <Stat label="Résultat de l’enveloppe" value={<span className={status.pnlUsd < 0 ? 'text-down' : 'text-ink'}>{fmtNum(status.pnlPct, 0)} %</span>} hint={`${money(status.pnlUsd)} sur ${money(status.investedUsd)} misés`} />
        </div>
        {status.paused && <Banner tone="warn" title={`En pause jusqu’au ${fmtDate(env.pausedUntil)}`} action={<Button size="sm" onClick={() => setEnv({ pausedUntil: undefined })}>Lever la pause</Button>}>Ta règle : pas d’achat avant cette date. La lever est possible, mais c’est précisément ce que la règle voulait t’éviter.</Banner>}
        {status.drawdownHit && !status.paused && <Banner tone="danger" title={`L’enveloppe a perdu ${fmtNum(-status.pnlPct, 0)} %`} action={<Button size="sm" variant="primary" onClick={() => setEnv({ pausedUntil: pauseEnd(), windowStart: pauseEnd() })}>Démarrer la pause d’un mois</Button>}>Ta règle est de t’arrêter un mois. Les pertes passées ne comptent plus après la pause.</Banner>}
        {status.takeProfit.map(({ bet, valueUsd }) => (
          <Banner key={bet.id} tone="warn" title={`${bet.symbol} vaut ×${fmtNum(valueUsd / bet.costUsd, 1)} sa mise`} action={<Button size="sm" onClick={() => upsert({ ...bet, recovered: true, realizedUsd: (bet.realizedUsd ?? 0) + bet.costUsd, valueUsd: Math.max(0, valueUsd - bet.costUsd) })}>Mise retirée</Button>}>
            Retire ta mise de départ (≈ {money(bet.costUsd)}) : le reste devient « argent gratuit » qui peut courir.
          </Banner>
        ))}
      </Card>

      <PreBuy env={env} status={status} />
      <Journal env={env} status={status} />
    </div>
  );
}

type EnvStatus = ReturnType<typeof envelopeStatus>;

function PreBuy({ env, status }: { env: ReturnType<typeof useStore.getState>['envelope']; status: EnvStatus }) {
  const [mint, setMint] = useState('');
  const [amount, setAmount] = useState<number | ''>(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [out, setOut] = useState<{ result: PreBuyResult; report: SecurityReport | null; token?: { name: string; symbol: string; priceUsd?: string } } | null>(null);
  const [note, setNote] = useState(false);

  async function run() {
    const m = mint.trim();
    setError('');
    setOut(null);
    if (!SOL_MINT.test(m)) { setError('Adresse de token Solana invalide : colle l’adresse du token (contrat), pas celle d’un wallet.'); return; }
    if (amount === '' || amount <= 0) { setError('Indique le montant que tu comptes acheter.'); return; }
    setBusy(true);
    const [sec, pairs] = await Promise.allSettled([scanSolana(m), getTokenPairs('solana', [m])]);
    const report = sec.status === 'fulfilled' ? sec.value : null;
    const pair = pairs.status === 'fulfilled' ? pairs.value.get(m.toLowerCase()) : undefined;
    const result = preBuyChecks({
      amountUsd: Number(amount), env, status,
      liquidityUsd: pair?.liquidity?.usd ?? null, volume24hUsd: pair?.volume?.h24 ?? null,
      ageHours: pair?.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 3.6e6 : null,
      securityVerdict: report?.verdict ?? null, top10Pct: report?.top10HoldersPct ?? null,
    });
    setOut({ result, report, token: pair ? { name: pair.baseToken.name, symbol: pair.baseToken.symbol, priceUsd: pair.priceUsd } : undefined });
    setBusy(false);
  }

  const tone = out?.result.verdict === 'passe' ? 'up' : out?.result.verdict === 'prudence' ? 'warn' : 'down';
  return (
    <Card title={<span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-accent" />Contrôle avant achat</span>} subtitle="Colle l’adresse du token (contrat) : sécurité, liquidité, âge et concentration, puis tes règles">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Adresse du token Solana" className="sm:col-span-2"><Input value={mint} onChange={(e) => setMint(e.target.value)} placeholder="So1…" autoComplete="off" spellCheck={false} /></Field>
        <Field label="Montant prévu (USD)"><NumberInput value={amount} onChange={setAmount} /></Field>
      </div>
      <div className="mt-3"><Button variant="primary" loading={busy} onClick={() => void run()}>Contrôler</Button></div>
      {error && <div className="mt-3"><Banner tone="warn">{error}</Banner></div>}
      {out && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {out.token && <span className="text-sm font-medium text-ink">{out.token.name} <span className="text-muted">{out.token.symbol}</span>{out.token.priceUsd ? <span className="ml-2 text-xs text-ink-2">{out.token.priceUsd} $</span> : null}</span>}
            <Badge tone={tone}>{out.result.verdict === 'passe' ? 'Règles respectées' : out.result.verdict === 'prudence' ? 'Prudence' : 'Ne pas acheter'}</Badge>
          </div>
          <p className="text-sm text-ink-2">{out.result.summary}</p>
          <ul className="divide-y divide-line text-sm">
            {out.result.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-3 py-1.5">
                <span className={`w-4 shrink-0 text-center font-semibold ${c.ok === true ? 'text-up' : c.ok === false ? 'text-down' : 'text-warn'}`}>{c.ok === true ? '✓' : c.ok === false ? '✗' : '!'}</span>
                <span className="min-w-0 flex-1"><span className="text-ink">{c.label}</span><span className="block text-xs text-muted">{c.detail}</span></span>
              </li>
            ))}
          </ul>
          {out.report && out.report.flags.filter((f) => f.severity !== 'ok').length > 0 && (
            <ul className="list-disc pl-5 text-xs text-ink-2">{out.report.flags.filter((f) => f.severity !== 'ok').slice(0, 6).map((f) => <li key={f.label} className={f.severity === 'danger' ? 'text-down' : ''}>{f.label}</li>)}</ul>
          )}
          {out.result.verdict !== 'non' && <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setNote(true)}>Noter cet achat dans mon journal DeFi</Button>}
        </div>
      )}
      <BetModal open={note} onClose={() => setNote(false)} env={env} status={status} initial={{ symbol: out?.token?.symbol ?? '', name: out?.token?.name ?? '', mint: mint.trim(), costUsd: amount === '' ? 0 : amount }} />
    </Card>
  );
}

function BetModal({ open, onClose, initial, env, status }: { open: boolean; onClose: () => void; initial: { symbol: string; name: string; mint: string; costUsd: number }; env: DefiEnvelope; status: EnvStatus }) {
  const upsert = useStore((s) => s.upsertDefiBet);
  const [d, setD] = useState({ date: isoDay(), symbol: '', name: '', mint: '', costUsd: 0 as number | '' });
  const [ack, setAck] = useState(false);
  useEffect(() => {
    if (open) { setD({ date: isoDay(), symbol: initial.symbol, name: initial.name, mint: initial.mint, costUsd: initial.costUsd }); setAck(false); }
  }, [open]);
  // Noter un achat à la main ne contourne pas l'enveloppe : s'il sort de tes règles, tu dois le reconnaître, et le journal le marque.
  const violations = d.costUsd !== '' && d.costUsd > 0 ? betViolations(env, status, Number(d.costUsd)) : [];
  const valid = d.symbol.trim() && d.costUsd !== '' && d.costUsd > 0 && (violations.length === 0 || ack);
  function save() {
    if (!valid) return;
    upsert({
      id: newId(), date: d.date, symbol: d.symbol.trim().toUpperCase(), name: d.name.trim() || d.symbol.trim(), mint: d.mint.trim() || undefined,
      costUsd: Number(d.costUsd), status: 'open', outsideRules: violations.length ? violations : undefined,
    });
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title="Noter un pari DeFi" footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!valid} onClick={save}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Symbole"><Input value={d.symbol} onChange={(e) => setD({ ...d, symbol: e.target.value })} /></Field>
        <Field label="Nom"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
        <Field label="Date"><Input type="date" value={d.date} max={isoDay()} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
        <Field label="Mise (USD)"><NumberInput value={d.costUsd} onChange={(v) => setD({ ...d, costUsd: v })} /></Field>
        <Field label="Adresse du token (facultatif)" className="col-span-2"><Input value={d.mint} onChange={(e) => setD({ ...d, mint: e.target.value })} spellCheck={false} /></Field>
      </div>
      {violations.length > 0 && (
        <div className="mt-3">
          <Banner tone="danger" title="Cet achat sort de ton enveloppe">
            {violations.map((v) => <span key={v} className="block">• {v}</span>)}
            <label className="mt-2 flex items-start gap-2 text-ink">
              <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>Je sais que c’est hors de mes règles : le noter quand même (il sera marqué « hors règles »).</span>
            </label>
          </Banner>
        </div>
      )}
    </Modal>
  );
}

function Journal({ env, status }: { env: DefiEnvelope; status: EnvStatus }) {
  const bets = useStore((s) => s.defiBets);
  const upsert = useStore((s) => s.upsertDefiBet);
  const remove = useStore((s) => s.removeDefiBet);
  const [open, setOpen] = useState(false);
  const list = useMemo(() => [...bets].sort((a, b) => b.date.localeCompare(a.date)), [bets]);
  const close = (b: DefiBet) => upsert({ ...b, status: 'closed', realizedUsd: (b.realizedUsd ?? 0) + (b.valueUsd ?? b.costUsd), valueUsd: 0 });
  return (
    <Card title="Mon journal DeFi" subtitle="Mets à jour la valeur actuelle de chaque pari : l’enveloppe en déduit ta place restante, tes retraits de mise et ta perte" actions={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setOpen(true)}>Ajouter</Button>} padded={!!list.length ? false : true}>
      {!list.length && <p className="text-sm text-muted">Aucun pari noté. Le contrôle ci-dessus propose de noter l’achat une fois les règles validées.</p>}
      {list.length > 0 && (
        <Table head={['Date', 'Token', 'Mise ($)', 'Valeur actuelle ($)', 'Ressorti ($)', 'Statut', '']}>
          {list.map((b) => (
            <tr key={b.id}>
              <Td left className="text-ink-2">{fmtDate(b.date)}</Td>
              <Td className="font-medium text-ink">{b.symbol}</Td>
              <Td>{fmtMoney(b.costUsd, 'USD', 0)}</Td>
              <Td>{b.status === 'open' ? <div className="ml-auto w-24"><NumberInput value={b.valueUsd ?? b.costUsd} onChange={(v) => upsert({ ...b, valueUsd: v === '' ? undefined : v })} /></div> : '—'}</Td>
              <Td className="text-ink-2">{fmtMoney(b.realizedUsd ?? 0, 'USD', 0)}</Td>
              <Td>{b.status === 'closed' ? <Badge>Clos</Badge> : b.recovered ? <Badge tone="up">Mise retirée</Badge> : <Badge tone="accent">Ouvert</Badge>}{b.outsideRules?.length ? <span title={b.outsideRules.join(' ; ')}> <Badge tone="warn">Hors règles</Badge></span> : null}</Td>
              <Td><span className="inline-flex gap-1">{b.status === 'open' && <Button size="sm" variant="ghost" onClick={() => close(b)}>Clore</Button>}<Button size="sm" variant="ghost" aria-label="Supprimer" icon={<Trash2 className="size-3.5" />} onClick={() => remove(b.id)} /></span></Td>
            </tr>
          ))}
        </Table>
      )}
      <BetModal open={open} onClose={() => setOpen(false)} env={env} status={status} initial={{ symbol: '', name: '', mint: '', costUsd: 20 }} />
    </Card>
  );
}
