// Achats fantômes (onglet de la page Labo) : « j'aurais acheté ici », chiffré aux prix réels.
// Les portefeuilles papier eux-mêmes vivent dans src/pages/labo/Portfolios.tsx.

import { useMemo, useState } from 'react';
import { Ghost, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useMarkets } from '../hooks/useMarket';
import { ghostTheses } from '../lib/paper';
import type { CoinRef } from '../types';
import { Badge, Button, Card, CoinIcon, Field, NumberInput, Table, Td } from '../components/ui';
import { CoinPicker } from '../components/CoinPicker';
import { fmtDate, fmtNum, fmtPrice, uid } from '../lib/format';

const FEE_PCT = 0.1; // frais simulés par défaut : 0,1 %, comme un vrai passage d'ordre

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

  const ghosts = useMemo(() => ghostTheses(trades, prices), [trades, prices]);
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
  function closeThesis(t: (typeof ghosts)[number]) {
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
      {ghosts.length > 0 ? (
        <Table head={['Crypto', 'Mis (-)', 'Valeur du jour', 'Bilan', '']}>
          {ghosts.map((t) => (
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
