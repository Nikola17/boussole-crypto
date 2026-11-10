// « Quand vendre » : paliers fixés à froid sur ton prix de revient (altcoins), allègement en euphorie (Bitcoin, Ethereum).

import { DoorOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useExitPlan, type ExitCoin } from '../hooks/useExitPlan';
import { computeFrenchTax, simulateSale } from '../lib/tax';
import { fmtMoney, fmtNum, fmtPrice, fmtQty } from '../lib/format';
import { Link } from '../router';
import { MIN_DAYS_BETWEEN_TRIMS } from '../lib/thresholds';
import type { CoinRef } from '../types';
import { TransactionModal } from './forms';
import { Badge, Banner, Button, Card, CoinIcon } from './ui';

export function ExitPlanCard() {
  const plan = useExitPlan();
  const txs = useStore((s) => s.transactions);
  const rateSetting = useStore((s) => s.settings.taxRatePct);
  const toggle = useStore((s) => s.toggleExitDone);
  const markTrim = useStore((s) => s.markCoreTrim);
  const clearTrim = useStore((s) => s.clearCoreTrim);
  const [sell, setSell] = useState<CoinRef | null>(null);
  const { currency, rate, fx } = plan;

  const taxes = useMemo(() => computeFrenchTax(txs, rateSetting), [txs, rateSetting]);
  const thisYear = new Date().getFullYear();
  const ceded = taxes.years.find((y) => y.year === thisYear)?.totalCessions ?? 0;
  const valueEur = currency === 'EUR' ? plan.totalValue : plan.totalValue * fx;
  const taxFor = (usd: number) => {
    const eur = usd * fx;
    if (!(eur > 0) || !(valueEur > 0)) return null;
    return simulateSale(eur, valueEur, taxes.acquisitionRemaining, rateSetting, ceded);
  };

  const core = plan.coins.filter((c) => c.core);
  const tinyLines = plan.coins.filter((c) => !c.core && c.tiny);
  const alts = plan.coins.filter((c) => !c.core && !c.tiny && c.avgCostUsd > 0);
  const noCost = plan.coins.filter((c) => !c.core && !c.tiny && c.avgCostUsd <= 0);
  // Les lignes dont un palier est atteint s'affichent en grand ; les autres se résument en une ligne chacune.
  const pendingAlts = alts.filter((c) => c.rungs.some((r) => r.reached && !r.done));
  const watchAlts = alts.filter((c) => !c.rungs.some((r) => r.reached && !r.done));
  if (!core.length && !alts.length && !tinyLines.length) return null;

  const ref = (c: ExitCoin): CoinRef => ({ coinId: c.coinId, symbol: c.symbol.toLowerCase(), name: c.name, image: c.image });

  return (
    <Card
      title={<span className="inline-flex items-center gap-2"><DoorOpen className="size-4 text-accent" />Plan de sortie : quand vendre</span>}
      subtitle="Des règles fixées à froid, pour ne pas décider sous le coup de l’émotion"
    >
      <div className="space-y-4">
        {core.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-ink-2">Bitcoin et Ethereum : seulement en euphorie, par petites tranches, jamais tout</p>
            {plan.euphoria.active ? (
              <div className="space-y-2">
                <Banner tone="warn" title={plan.euphoria.label}>
                  Une tranche à la fois, avec au moins {MIN_DAYS_BETWEEN_TRIMS} jours entre deux : l’euphorie peut durer des mois.
                </Banner>
                <ul className="divide-y divide-line text-sm">
                  {core.map((c) => (
                    <li key={c.coinId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <CoinIcon src={c.image} symbol={c.symbol} size={20} />
                      <span className="min-w-0 flex-1 text-ink">{c.symbol}</span>
                      {c.trim?.allowed ? (
                        <>
                          <span className="tnum text-xs text-ink-2">tranche ≈ {fmtMoney(((c.valueUsd * plan.euphoria.sellPct) / 100) * rate, currency, 0)}</span>
                          <Button size="sm" onClick={() => markTrim(c.coinId)}>J’ai vendu cette tranche</Button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-ink-2">tranche déjà vendue : prochaine possible le {c.trim?.nextDate?.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span>
                          <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => clearTrim(c.coinId)}>annuler</button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : <p className="text-sm text-ink-2">{plan.euphoria.label} Si ton Bitcoin dépasse sa part visée, ne vends pas : oriente ton DCA vers les autres poches.</p>}
          </div>
        )}
        {pendingAlts.map((c) => (
          <div key={c.coinId} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <CoinIcon src={c.image} symbol={c.symbol} size={22} />
              <Link to={`/coin/${c.coinId}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:underline">{c.name} <span className="text-muted">{c.symbol}</span></Link>
              <span className="tnum text-xs text-ink-2">revient à {fmtPrice(c.avgCostUsd * rate, currency)} · cours {fmtPrice((c.priceUsd ?? 0) * rate, currency)} · ×{fmtNum((c.priceUsd ?? 0) / c.avgCostUsd, 2)}</span>
            </div>
            <ul className="mt-2 grid gap-2 sm:grid-cols-3">
              {c.rungs.map((r) => (
                <li key={r.multiple} className={`rounded-md border p-2 text-xs ${r.done ? 'border-line opacity-60' : r.reached ? 'border-warn/60 bg-warn/10' : 'border-line'}`}>
                  <div className="flex items-center justify-between"><span className="font-semibold text-ink">×{fmtNum(r.multiple, 1)}</span><span className="text-muted">{r.pct} % de la position</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className={`h-full ${r.reached ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${r.progressPct}%` }} /></div>
                  <p className="mt-1 text-ink-2">cible {fmtPrice(r.targetPrice * rate, currency)} · {r.done ? 'vendu ✓' : r.reached ? 'atteint' : `${Math.round(r.progressPct)} %`}</p>
                </li>
              ))}
            </ul>
            {c.rungs.filter((r) => r.reached && !r.done).map((r) => {
              const t = taxFor(r.valueUsd);
              return (
                <div key={r.multiple} className="mt-2 rounded-md bg-warn/10 p-2 text-xs text-ink-2">
                  <p><Badge tone="warn">Palier ×{fmtNum(r.multiple, 1)} atteint</Badge> Vends <b className="text-ink">{r.pct} %</b> de ta position de départ : {fmtQty(r.qty)} {c.symbol} ≈ <b className="text-ink">{fmtMoney(r.valueUsd * rate, currency, 0)}</b>.{t && !t.exempt ? ` Si tu convertis en euros, impôt estimé ≈ ${fmtMoney(t.tax, 'EUR', 0)} (estimation).` : ''}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" onClick={() => setSell(ref(c))}>Enregistrer la vente</Button>
                    <Button size="sm" onClick={() => toggle(c.coinId, r.multiple)}>Palier fait</Button>
                  </div>
                </div>
              );
            })}
            {c.rungs.some((r) => r.done) && <button type="button" className="mt-1 text-xs text-muted hover:text-ink" onClick={() => c.rungs.filter((r) => r.done).forEach((r) => toggle(c.coinId, r.multiple))}>Réinitialiser les paliers vendus</button>}
            {!c.hasThesis && <p className="mt-1 text-xs text-muted">Paliers par défaut (×2, ×3, ×5 à 25 % chacun). Écris une thèse sur la fiche de {c.symbol} pour les personnaliser.</p>}
          </div>
        ))}
        {watchAlts.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-ink-2">En surveillance : prochain palier de chaque ligne</p>
            <ul className="divide-y divide-line text-sm">
              {watchAlts.map((c) => {
                const n = c.rungs.find((r) => !r.done);
                return (
                  <li key={c.coinId} className="flex items-center gap-3 py-2">
                    <CoinIcon src={c.image} symbol={c.symbol} size={20} />
                    <Link to={`/coin/${c.coinId}`} className="min-w-0 flex-1 truncate text-ink hover:underline">{c.symbol} <span className="text-xs text-muted">×{fmtNum((c.priceUsd ?? 0) / c.avgCostUsd, 2)} de ton prix de revient</span></Link>
                    {n ? (
                      <>
                        <span className="tnum text-xs text-ink-2">×{fmtNum(n.multiple, 1)} à {fmtPrice(n.targetPrice * rate, currency)}</span>
                        <span className="hidden w-24 sm:block"><span className="block h-1.5 overflow-hidden rounded-full bg-surface-3"><span className="block h-full bg-accent" style={{ width: `${n.progressPct}%` }} /></span></span>
                        <span className="tnum w-10 text-right text-xs text-muted">{Math.round(n.progressPct)} %</span>
                      </>
                    ) : <span className="text-xs text-muted">tous les paliers vendus</span>}
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-xs text-muted">Paliers par défaut : ×2, ×3 et ×5 à 25 % de la position chacun. Écris une thèse sur la fiche d’une crypto pour personnaliser ses paliers.</p>
          </div>
        )}
        {tinyLines.length > 0 && <p className="text-xs text-muted">Trop petites pour des paliers de sortie ({tinyLines.map((c) => c.symbol).join(', ')}) : regroupe-les vers Bitcoin (carte « Consolider ») ou renforce-les si tu y crois vraiment.</p>}
        {noCost.length > 0 && <p className="text-xs text-muted">Sans prix d’achat enregistré, pas de paliers possibles : {noCost.map((c) => c.symbol).join(', ')}. Ajoute tes achats ou importe ton historique.</p>}
      </div>
      <TransactionModal open={!!sell} onClose={() => setSell(null)} presetCoin={sell} presetType="sell" />
    </Card>
  );
}
