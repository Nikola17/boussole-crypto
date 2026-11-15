// Portefeuille papier : le profil « expérimentations » — des ordres fictifs en USDC aux prix réels du marché,
// pour tester une stratégie sans risquer un euro. Les ordres sont séparés du vrai journal (multi-profils)
// et synchronisés entre tes appareils comme le reste.

import { useMemo, useState } from 'react';
import { FlaskConical, Ghost, RefreshCw, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useBtcHistory, useMarkets } from '../hooks/useMarket';
import { btcBenchmark, checkPaperOrder, ghostTheses, paperStatus } from '../lib/paper';
import type { CoinRef, PaperTrade } from '../types';
import { Banner, Badge, Button, Card, CoinIcon, Empty, Field, Modal, NumberInput, Stat, Table, Td } from '../components/ui';
import { CoinPicker } from '../components/CoinPicker';
import { fmtDate, fmtNum, fmtPrice, uid } from '../lib/format';

const FEE_PCT = 0.1; // frais simulés par défaut : 0,1 %, comme un vrai passage d'ordre

/** Onglet « Papier » de la page Labo. */
export function PaperPanel() {
  const paper = useStore((s) => s.paper);
  const trades = useStore((s) => s.paperTrades);
  const upsertPaperTrade = useStore((s) => s.upsertPaperTrade);
  const removePaperTrade = useStore((s) => s.removePaperTrade);
  const setPaper = useStore((s) => s.setPaper);
  const markets = useMarkets();
  const btc = useBtcHistory();

  const [coin, setCoin] = useState<CoinRef | null>(null);
  const [qty, setQty] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [askReset, setAskReset] = useState(false);

  const prices = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of markets.data ?? []) m.set(row.id, row.current_price);
    return m;
  }, [markets.data]);

  const st = useMemo(() => paperStatus(paper.startingUsd, trades, prices), [paper.startingUsd, trades, prices]);

  // Le même montant investi aux mêmes dates, mais en Bitcoin : le juge de paix du plan.
  const bench = useMemo(() => {
    if (!btc.data) return null;
    const byDay = new Map(btc.data.map((c) => [new Date(c.time * 1000).toISOString().slice(0, 10), c.close]));
    return btcBenchmark(trades, byDay, prices.get('bitcoin') ?? null);
  }, [btc.data, trades, prices]);

  const marketCoin = coin ? (markets.data ?? []).find((m) => m.id === coin.coinId) : undefined;
  const priceUsd = marketCoin?.current_price ?? null;

  function place(side: 'buy' | 'sell') {
    setError(null);
    if (!coin || priceUsd == null) return setError('Choisis une crypto dont le prix est connu.');
    const quantity = Number(qty);
    const owned = st.positions.find((p) => p.coinId === coin.coinId)?.quantity ?? 0;
    const check = checkPaperOrder(side, quantity, priceUsd, st, owned);
    if (!check.ok) return setError(check.why ?? 'Ordre impossible.');
    const t: PaperTrade = {
      id: uid(),
      coinId: coin.coinId, symbol: coin.symbol, name: coin.name,
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toISOString(),
      type: side,
      quantity,
      priceUsd,
      feeUsd: Math.round(quantity * priceUsd * FEE_PCT) / 100, // FEE_PCT est en % : 0,1 % du montant
    };
    upsertPaperTrade(t);
    setQty('');
  }

  function reset(starting: number | '') {
    for (const t of trades) removePaperTrade(t.id);
    setPaper({ startingUsd: Number(starting) || 1000, resetAt: new Date().toISOString() });
    setAskReset(false);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={() => { void markets.refetch(); void btc.refetch(); }}>Actualiser les prix</Button>
      </div>

      <Banner tone="info" title="Argent fictif, marché réel">
        Ce profil est indépendant de ton vrai portefeuille (le journal du Wallet). Les ordres sont valorisés aux prix réels du
        moment, avec {fmtNum(FEE_PCT)} % de frais simulés. Idéal pour tester une stratégie ou un timing avant de le faire pour de
        vrai — et pour comparer honnêtement avec le même montant en Bitcoin.
      </Banner>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <Stat label="Cash papier" value={`${fmtNum(st.cashUsd)} USDC`} hint={`départ ${fmtNum(paper.startingUsd)} USDC`} />
        <Stat label="Positions" value={fmtPrice(st.valueUsd, 'USD')} hint={st.unpriced ? `${st.unpriced} ligne${st.unpriced > 1 ? 's' : ''} sans prix connu` : `${st.positions.length} ligne${st.positions.length > 1 ? 's' : ''}`} />
        <Stat label="Valeur totale" value={fmtPrice(st.totalUsd, 'USD')} />
        <Stat
          label="P&L papier"
          value={<span className={st.pnlUsd >= 0 ? 'text-good' : 'text-critical'}>{st.pnlUsd >= 0 ? '+' : ''}{fmtNum(st.pnlPct)} %</span>}
          hint={`${st.pnlUsd >= 0 ? '+' : ''}${fmtNum(st.pnlUsd)} USDC sur ${fmtNum(st.totalInvestedUsd)} investis`}
        />
      </div>

      {bench != null && trades.length > 0 && (
        <Banner tone={st.pnlPct >= bench.pct ? 'success' : 'warn'} title="Et le même montant en Bitcoin ?">
          Tes achats papier ({fmtPrice(bench.investedUsd, 'USD')}) réinvestis en Bitcoin aux mêmes dates vaudraient
          aujourd’hui {fmtPrice(bench.nowUsd, 'USD')} ({bench.pct >= 0 ? '+' : ''}{fmtNum(bench.pct)} %). Ton papier fait
          {' '}{st.pnlPct >= bench.pct ? 'mieux' : 'moins bien'} que le socle Bitcoin.
        </Banner>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2" title="Passer un ordre papier" subtitle="Au prix réel du marché">
          <div className="space-y-3">
            <Field label="Crypto">
              <CoinPicker value={coin} onChange={setCoin} />
            </Field>
            <div className="text-sm text-ink-2">
              {coin && priceUsd != null ? <>1 {coin.symbol.toUpperCase()} = {fmtPrice(priceUsd, 'USD')}</> : coin ? 'Prix inconnu pour cette crypto.' : 'Choisis une crypto pour voir son prix.'}
            </div>
            <Field label={`Quantité (${coin?.symbol.toUpperCase() ?? '—'})`}>
              <NumberInput value={qty} onChange={setQty} placeholder={coin ? `ex : 0,5 ${coin.symbol.toUpperCase()}` : '0,5'} />
            </Field>
            {error && <p className="text-sm text-critical">{error}</p>}
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" disabled={!coin || qty === ''} onClick={() => place('buy')}>Acheter (papier)</Button>
              <Button variant="secondary" className="flex-1" disabled={!coin || qty === ''} onClick={() => place('sell')}>Vendre (papier)</Button>
            </div>
            <Button size="sm" variant="ghost" className="w-full" onClick={() => setAskReset(true)}>Tout remettre à zéro</Button>
          </div>
        </Card>

        <Card className="lg:col-span-3" title="Positions papier" subtitle="Valorisées aux prix réels du moment">
          {st.positions.length === 0 ? (
            <Empty icon={<FlaskConical className="size-8" />} title="Aucune position papier">Passe ton premier ordre fictif pour tester une stratégie.</Empty>
          ) : (
            <Table head={['Crypto', 'Quantité', 'Coût', 'Valeur', 'P&L']}>
              {st.positions.map((p) => (
                <tr key={p.coinId}>
                  <Td><span className="flex items-center gap-2"><CoinIcon src={undefined} symbol={p.symbol} size={20} /><span className="font-medium text-ink">{p.symbol.toUpperCase()}</span></span></Td>
                  <Td>{fmtNum(p.quantity, 6)}</Td>
                  <Td>{fmtPrice(p.costUsd, 'USD')}</Td>
                  <Td>{p.valueUsd != null ? fmtPrice(p.valueUsd, 'USD') : 'prix inconnu'}</Td>
                  <Td>{p.pnlUsd != null ? `${p.pnlUsd >= 0 ? '+' : ''}${fmtNum(p.pnlPct)} %` : '—'}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Card title="Historique des ordres" subtitle={`${trades.length} ordre${trades.length > 1 ? 's' : ''} fictif${trades.length > 1 ? 's' : ''}`}>
        {trades.length === 0 ? (
          <Empty title="Pas encore d'ordre">Tout ce que tu fais ici reste fictif : ton vrai portefeuille (le journal du Wallet) n'est jamais touché.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {[...trades].reverse().map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <Badge tone={t.type === 'buy' ? 'up' : 'down'}>{t.type === 'buy' ? 'ACHAT' : 'VENTE'}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">
                    {fmtNum(t.quantity, 6)} {t.symbol.toUpperCase()} — {fmtPrice(t.quantity * t.priceUsd, 'USD')}
                  </div>
                  <div className="text-xs text-muted">
                    à {fmtPrice(t.priceUsd, 'USD')} · {fmtDate(t.time ?? t.date)}{t.feeUsd ? ` · frais ${fmtNum(t.feeUsd)} USDC` : ''}
                  </div>
                </div>
                <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} aria-label="Supprimer cet ordre" onClick={() => removePaperTrade(t.id)} />
              </li>
            ))}
          </ul>
        )}
      </Card>


      <Modal
        open={askReset}
        onClose={() => setAskReset(false)}
        title="Remettre le papier à zéro ?"
        footer={<><Button variant="ghost" onClick={() => setAskReset(false)}>Annuler</Button><Button variant="primary" onClick={() => reset(1000)}>Tout effacer (1000 USDC)</Button></>}
      >
        <p className="text-sm text-ink-2">
          Les {trades.length} ordres fictifs seront supprimés et le cash papier repartira à 1000 USDC. Ton vrai portefeuille
          (le journal du Wallet) n’est pas concerné. Les suppressions se synchronisent comme d’habitude.
        </p>
      </Modal>
    </div>
  );
}

/**
 * Achats fantômes : « j'aurais acheté X ici » — ce que tu n'as PAS fait, chiffré aux prix réels.
 * Aucun cash papier consommé : une envie se note, se valorise, et se confronte au réel quand tu la closes.
 */
export function GhostCard({ prices }: { prices: Map<string, number> }) {
  // Le filtre se fait HORS du sélecteur : un sélecteur qui renvoie une nouvelle liste à chaque lecture fait boucler
  // React (erreur #185, « Maximum update depth exceeded ») — c'est ce qui faisait planter la page Papier.
  const allTrades = useStore((s) => s.paperTrades);
  const trades = useMemo(() => allTrades.filter((t) => t.ghost), [allTrades]);
  const upsertPaperTrade = useStore((s) => s.upsertPaperTrade);
  const removePaperTrade = useStore((s) => s.removePaperTrade);
  const markets = useMarkets();
  const [coin, setCoin] = useState<CoinRef | null>(null);
  const [amount, setAmount] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  const theses = useMemo(() => ghostTheses(trades, prices), [trades, prices]);
  const priceUsd = coin ? prices.get(coin.coinId) ?? (markets.data ?? []).find((m) => m.id === coin.coinId)?.current_price ?? null : null;

  function placeGhost() {
    setError(null);
    if (!coin) return setError('Choisis la crypto que tu n’as pas achetée.');
    if (priceUsd == null || !(priceUsd > 0)) return setError('Prix inconnu pour cette crypto.');
    const total = Number(amount);
    if (!(total > 0)) return setError('Combien aurais-tu mis ?');
    const fee = Math.round(total * FEE_PCT) / 100; // les frais des vraies plateformes s'appliquent aussi aux regrets
    upsertPaperTrade({
      id: uid(),
      coinId: coin.coinId, symbol: coin.symbol, name: coin.name,
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toISOString(),
      type: 'buy',
      quantity: Math.round((total / priceUsd) * 1e8) / 1e8,
      priceUsd,
      feeUsd: fee,
      ghost: true,
    });
    setAmount('');
  }

  /** Clôturer : revendre en fantôme toute la part restante, au prix réel du moment. */
  function closeThesis(t: (typeof theses)[number]) {
    if (t.openQty <= 0 || t.priceUsd == null || !(t.priceUsd > 0)) return;
    upsertPaperTrade({
      id: uid(),
      coinId: t.coinId, symbol: t.symbol, name: t.name,
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toISOString(),
      type: 'sell',
      quantity: t.openQty,
      priceUsd: t.priceUsd,
      ghost: true,
    });
  }

  function dropThesis(coinId: string) {
    for (const t of trades.filter((x) => x.coinId === coinId)) removePaperTrade(t.id);
  }

  return (
    <Card title={<span className="inline-flex items-center gap-2"><Ghost className="size-4 text-accent" />Achats fantômes</span>} subtitle="« J'aurais acheté ici » : ce que tu n'as pas fait, chiffré aux prix réels — aucun cash papier engagé">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <Field label="Crypto que tu n'as pas achetée"><CoinPicker value={coin} onChange={setCoin} /></Field>
        <Field label="Montant d'envie ($)"><NumberInput value={amount} onChange={setAmount} placeholder="100" /></Field>
        <Button variant="secondary" disabled={!coin || amount === ''} onClick={placeGhost}>Noter l'envie</Button>
      </div>
      {error && <p className="text-sm text-critical">{error}</p>}
      {coin && priceUsd != null && <p className="text-xs text-muted">1 {coin.symbol.toUpperCase()} = {fmtPrice(priceUsd, 'USD')} · l'envie sera valorisée à chaque relevé de prix.</p>}
      {theses.length > 0 ? (
        <Table head={['Crypto', 'Mis (-)', 'Valeur du jour', 'Bilan', '']}>
          {theses.map((t) => (
            <tr key={t.coinId}>
              <Td><span className="flex items-center gap-2"><CoinIcon src={undefined} symbol={t.symbol} size={20} /><span className="font-medium text-ink">{t.symbol.toUpperCase()}</span><span className="text-xs text-muted">{fmtDate(t.firstAt, true)}</span></span></Td>
              <Td>{fmtPrice(t.investedUsd, 'USD')}</Td>
              <Td>{t.closed ? <Badge tone="neutral">close</Badge> : t.openValueUsd != null ? fmtPrice(t.openValueUsd, 'USD') : 'prix inconnu'}</Td>
              <Td>{t.pnlPct != null ? <span className={t.pnlPct >= 0 ? 'text-good' : 'text-critical'}>{t.pnlPct >= 0 ? '+' : ''}{fmtNum(t.pnlPct)} %</span> : '—'}</Td>
              <Td className="whitespace-nowrap">
                {!t.closed && <Button size="sm" variant="ghost" disabled={t.priceUsd == null} onClick={() => closeThesis(t)}>Clôturer</Button>}
                <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} aria-label="Supprimer cet achat fantôme" onClick={() => dropThesis(t.coinId)} />
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <p className="text-sm text-muted">La prochaine fois qu'une crypto te fait de l'œil et que tu résistes, note-la ici : dans un mois, le chiffre dira si tu as bien fait d'attendre — ou de tenter.</p>
      )}
    </Card>
  );
}
