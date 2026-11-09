// « Frais réels » : écart entre le prix payé sur la plateforme et le cours du marché (Binance) à la même minute.

import { Gauge } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useFx, useMarkets } from '../hooks/useMarket';
import { binanceSymbolFor, getAllPrices, getMinutePrice } from '../api/binance';
import { pool } from '../api/http';
import { buySamplesFrom, priceUsdOf, spreadStats, type SpreadSample, type SpreadStats } from '../lib/fees';
import { fmtMoney, fmtPct } from '../lib/format';
import { Banner, Button, Card } from './ui';

export function RealFeesCard() {
  const txs = useStore((s) => s.transactions);
  const currency = useStore((s) => s.settings.currency);
  const markets = useMarkets();
  const fx = useFx();
  const rate = currency === 'EUR' ? fx : 1;
  const samples = useMemo(() => buySamplesFrom(txs, 60), [txs]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [out, setOut] = useState<{ stats: SpreadStats; noPair: number } | null>(null);

  async function run() {
    setRunning(true);
    setError('');
    try {
      const prices = await getAllPrices();
      const byId = new Map((markets.data ?? []).map((m) => [m.id, m]));
      const jobs = samples
        .map((t) => {
          const m = byId.get(t.coinId);
          return { t, sym: m ? binanceSymbolFor({ id: m.id, symbol: m.symbol, priceUsd: m.current_price }, prices) : null };
        })
        .filter((j): j is { t: (typeof samples)[number]; sym: string } => !!j.sym);
      const res = await pool(jobs, 4, async (j) => {
        const ref = await getMinutePrice(j.sym, Date.parse(j.t.time ?? ''));
        const price = priceUsdOf(j.t);
        return ref ? ({ txId: j.t.id, symbol: j.t.symbol.toUpperCase(), time: j.t.time ?? '', amountUsd: price * j.t.quantity, priceUsd: price, refUsd: ref } satisfies SpreadSample) : null;
      });
      setOut({ stats: spreadStats(res.filter((x): x is SpreadSample => !!x)), noPair: samples.length - jobs.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analyse impossible.');
    } finally {
      setRunning(false);
    }
  }

  const s = out?.stats;
  return (
    <Card
      title={<span className="inline-flex items-center gap-2"><Gauge className="size-4 text-accent" />Frais réels</span>}
      subtitle="Ce que l’application te coûte vraiment : ton prix d’achat comparé au cours Binance de la même minute"
      actions={samples.length > 0 && <Button size="sm" loading={running} onClick={() => void run()}>{out ? 'Relancer' : 'Analyser'}</Button>}
    >
      {samples.length === 0 && <p className="text-sm text-muted">Importe ton historique Crypto.com (onglet Comptes) : les achats datés à la minute permettent de mesurer l’écart de prix de l’application.</p>}
      {samples.length > 0 && !out && !running && !error && <p className="text-sm text-muted">{samples.length} achats importés peuvent être analysés (les 60 plus récents). Environ 1 requête par achat vers Binance.</p>}
      {error && <Banner tone="warn">{error}</Banner>}
      {s && s.n === 0 && <Banner tone="info">Aucun achat n’a pu être comparé (paire absente de Binance ou écart aberrant).</Banner>}
      {s && s.n > 0 && (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted">Écart moyen payé</dt><dd className="tnum text-lg font-semibold text-ink">{fmtPct(s.avgPct, 2)}</dd></div>
            <div><dt className="text-xs text-muted">Écart médian</dt><dd className="tnum text-lg font-semibold text-ink">{fmtPct(s.medianPct, 2)}</dd></div>
            <div><dt className="text-xs text-muted">Surcoût sur {s.n} achats</dt><dd className="tnum text-lg font-semibold text-ink">{fmtMoney(s.overpaidUsd * rate, currency, 2)}</dd></div>
            <div><dt className="text-xs text-muted">Soit par an</dt><dd className="tnum text-lg font-semibold text-ink">{s.perYearUsd != null ? fmtMoney(s.perYearUsd * rate, currency, 0) : '—'}</dd></div>
          </dl>
          <p className="text-xs text-muted">
            Sur {fmtMoney(s.spentUsd * rate, currency, 0)} dépensés. Cet écart inclut le spread de l’application et un petit écart de change entre USDC et USDT (≈ 0,1 %). {s.excluded > 0 ? `${s.excluded} achat(s) à l’écart aberrant (> 15 %) écarté(s). ` : ''}{out && out.noPair > 0 ? `${out.noPair} achat(s) sans paire Binance non comparé(s). ` : ''}
            Pour réduire ce coût : regrouper tes achats en moins d’ordres. L’achat « instantané » inclut un écart de prix ; un ordre limite sur un carnet d’ordres n’en a pas, mais a des frais de transaction à vérifier avant de comparer.
          </p>
          {s.worst.length > 0 && (
            <ul className="text-xs text-ink-2">
              {s.worst.map((w) => <li key={w.txId}>{w.symbol} · {new Date(w.time).toLocaleDateString('fr-FR')} · {fmtMoney(w.amountUsd * rate, currency, 0)} · <span className="text-down">{fmtPct(w.pct, 2)}</span></li>)}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
