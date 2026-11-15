// Smart money : suivre des wallets publics connus pour leurs résultats — funds, préparateurs actifs, KOL —
// et lire leurs achats/ventes aux prix réels. L'alerte qui compte arrive sur Telegram (via ton serveur) quand
// un wallet suivi touche un token de ta liste, surtout quand il VEND : c'est le signal « il est temps de relire
// ta sortie ». Ici : la liste des wallets, leur flux de mouvements, et le lien avec ta liste de tokens.

import { useMemo, useState } from 'react';
import { Eye, Plus, Sparkles, Trash2, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { fetchAllWalletEvents } from '../api/smartmoney';
import { refsOf, tokenMatches, type SmartEvent } from '../lib/smartmoney';
import { buildPositions } from '../lib/portfolio';
import { recommendSmartWallets, type Recommendation } from '../lib/smartCatalog';
import { usePortfolio } from '../hooks/usePortfolio';
import type { SmartWallet } from '../types';
import { scoreLine, scoreWallet, type WalletScore } from '../lib/smartScore';
import { Badge, Banner, Button, Card, Empty, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, Table, Td } from '../components/ui';
import { fmtDate, uid } from '../lib/format';

const KINDS: { value: SmartWallet['kind']; label: string }[] = [
  { value: 'fund', label: 'Fond / équipe' },
  { value: 'insider', label: 'Initié du projet' },
  { value: 'kol', label: 'KOL / influenceur' },
  { value: 'other', label: 'Autre' },
];

const validAddress = (chain: SmartWallet['chain'], address: string): boolean =>
  chain === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim()) : /^0x[0-9a-fA-F]{40}$/.test(address.trim());

const explorerOf = (w: SmartWallet): string =>
  w.chain === 'solana' ? `https://solscan.io/account/${w.address}` : w.chain === 'base' ? `https://base.blockscout.com/address/${w.address}` : `https://eth.blockscout.com/address/${w.address}`;

const KIND_LABEL: Record<SmartWallet['kind'], string> = { fund: 'Fond', insider: 'Initié', kol: 'KOL', other: 'Autre' };

export default function Smart({ embedded = false }: { embedded?: boolean } = {}) {
  const wallets = useStore((s) => s.smartWallets);
  const watched = useStore((s) => s.watchedTokens);
  const transactions = useStore((s) => s.transactions);
  const alerts = useStore((s) => s.alerts);
  const addSmartWallet = useStore((s) => s.addSmartWallet);
  const removeSmartWallet = useStore((s) => s.removeSmartWallet);
  const moves = useStore((s) => s.smartMoves);
  // Note de chaque wallet : ses mouvements rejugés à 7 et 30 jours par le serveur veilleur.
  const scores = useMemo(() => {
    const m = new Map<string, WalletScore>();
    for (const w of wallets) m.set(w.id, scoreWallet(moves.filter((x) => x.walletId === w.id), (x, d) => (d === 7 ? x.p7 ?? null : x.p30 ?? null)));
    return m;
  }, [wallets, moves]);

  const [addOpen, setAddOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [chain, setChain] = useState<SmartWallet['chain']>('solana');
  const [kind, setKind] = useState<SmartWallet['kind']>('fund');
  const [error, setError] = useState<string | null>(null);

  const sig = wallets.map((w) => w.id).join(',');
  const events = useQuery({
    queryKey: ['smart-events', sig],
    queryFn: () => fetchAllWalletEvents(wallets, Date.now() - 48 * 3600_000),
    enabled: wallets.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const refs = useMemo(() => refsOf({
    watched,
    positions: [...buildPositions(transactions).values()],
    alerts: alerts.filter((a) => a.active && !a.triggeredAt).map((a) => ({ symbol: a.symbol, active: a.active, triggeredAt: a.triggeredAt })),
  }), [watched, transactions, alerts]);

  const mine = useMemo(() => {
    const rows = (events.data ?? []);
    const set = new Set(rows.filter((e) => tokenMatches(e, refs)).map((e) => `${e.txHash}:${e.mint}`));
    return set;
  }, [events.data, refs]);

  function add() {
    setError(null);
    if (!label.trim()) return setError('Donne un nom à ce wallet : c\'est ce qui s\'affiche dans les alertes.');
    const a = address.trim();
    if (!validAddress(chain, a)) return setError(chain === 'solana' ? 'Adresse Solana invalide (32 à 44 caractères base58).' : 'Adresse EVM invalide (0x…, 42 caractères).');
    if (wallets.some((w) => w.address.toLowerCase() === a.toLowerCase() && w.chain === chain)) return setError('Ce wallet est déjà suivi.');
    addSmartWallet({ id: uid(), label: label.trim(), chain, address: a, kind, addedAt: new Date().toISOString() });
    setLabel(''); setAddress(''); setAddOpen(false);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {embedded ? <div className="flex justify-end"><Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setAddOpen(true)}>Suivre un wallet</Button></div> : <PageHeader
        title="Smart money"
        subtitle="Les wallets publics que tu suis pour leurs résultats — et ce qu'ils achètent, ou surtout vendent"
        actions={<Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setAddOpen(true)}>Suivre un wallet</Button>}
      />}

      <Banner tone="info" title="Des adresses publiques, des mouvements publics">
        Tu suis des adresses de blockchain publiques (fonds, initiés, KOL) — jamais des secrets. Les mouvements sont
        lus sur Solana, Ethereum et Base via des services publics. Un wallet qui vend un token de ta liste déclenche
        une alerte Telegram (ton serveur veille) : c'est le moment de relire ton plan de sortie, pas de paniquer. Chaque mouvement est ensuite rejugé à 7 et
        30 jours (achat gagnant si le prix a monté, vente gagnante si elle a évité une baisse) : sous 40 % de gagnants
        sur 10 mouvements ou plus, le wallet est marqué « historique défavorable ».
      </Banner>

      <RecommendedCard />

      <Card title="Wallets suivis" subtitle={`${wallets.length} wallet${wallets.length > 1 ? 's' : ''} — synchronisés entre tes appareils`}>
        {wallets.length === 0 ? (
          <Empty icon={<Users className="size-8" />} title="Aucun wallet suivi">Ajoute l'adresse publique d'un fond reconnu pour ses bons coups, ou d'un initié qui a souvent raison.</Empty>
        ) : (
          <Table head={['Nom', 'Pourquoi', 'Chaîne', 'Adresse', 'Résultats', '']}>
            {wallets.map((w) => (
              <tr key={w.id}>
                <Td>{w.label}</Td>
                <Td>{KIND_LABEL[w.kind]}</Td>
                <Td>{w.chain === 'solana' ? 'Solana' : w.chain === 'base' ? 'Base' : 'Ethereum'}</Td>
                <Td><a className="text-link underline decoration-dotted underline-offset-2" href={explorerOf(w)} target="_blank" rel="noreferrer">{w.address.slice(0, 8)}…{w.address.slice(-6)}</a></Td>
                <Td>{(() => { const s = scores.get(w.id); return s && s.followed > 0 ? <span className={s.unfavorable ? 'text-warn' : 'text-ink-2'}>{scoreLine(s)}</span> : <span className="text-muted">pas encore de mouvement noté</span>; })()}</Td>
                <Td><Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} aria-label="Ne plus suivre" onClick={() => removeSmartWallet(w.id)} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card
        title="Leurs mouvements (48 dernières heures)"
        subtitle="Alerte Telegram quand ça touche ta liste ; le brief du matin résume le reste"
        actions={events.isFetching ? <Spinner /> : undefined}
      >
        {wallets.length === 0 ? (
          <Empty title="Rien à lire pour l'instant">Suis un wallet pour voir ses mouvements ici.</Empty>
        ) : events.data && events.data.length > 0 ? (
          <ul className="divide-y divide-line">
            {events.data.slice(0, 30).map((e) => (
              <EventRow key={`${e.txHash}:${e.mint}`} e={e} mine={mine.has(`${e.txHash}:${e.mint}`)} />
            ))}
          </ul>
        ) : events.isError ? (
          <Empty title="Lecture indisponible">Les sources publiques (RPC Solana, Blockscout) n'ont pas répondu. On réessaiera.</Empty>
        ) : (
          <Empty title="Aucun mouvement depuis 48 h">Tes wallets suivis n'ont rien fait de notable — ou leurs chaînes sont en lecture lente aujourd'hui.</Empty>
        )}
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Suivre un wallet public"
        footer={<><Button variant="ghost" onClick={() => setAddOpen(false)}>Annuler</Button><Button variant="primary" onClick={add}>Suivre</Button></>}
      >
        <div className="space-y-3">
          <Field label="Nom (affiché dans les alertes)">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex : Fonds Crypto XYZ" />
          </Field>
          <Field label="Chaîne">
            <Segmented value={chain} onChange={(v) => setChain(v)} options={[{ value: 'solana', label: 'Solana' }, { value: 'base', label: 'Base' }, { value: 'eth', label: 'Ethereum' }]} />
          </Field>
          <Field label="Adresse publique du wallet" hint="L'adresse suffit : c'est une donnée publique de la blockchain. Aucun secret, aucun accès.">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={chain === 'solana' ? 'Ex : 7xKX…base58' : 'Ex : 0xA0b8…'} />
          </Field>
          <Field label="Pourquoi tu le suis">
            <Select value={kind} onChange={(e) => setKind(e.target.value as SmartWallet['kind'])}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          {error && <p className="text-sm text-critical">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}

function EventRow({ e, mine }: { e: SmartEvent; mine: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Badge tone={e.side === 'buy' ? 'up' : 'down'}>{e.side === 'buy' ? 'ACHAT' : 'VENTE'}</Badge>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">
          {e.symbol ? e.symbol.toUpperCase() : `${e.mint.slice(0, 4)}…`} — {e.walletLabel}
        </div>
        <div className="text-xs text-muted">
          {e.uiAmount.toFixed(e.uiAmount >= 1000 ? 0 : e.uiAmount >= 1 ? 2 : 4)} unités · {e.chain === 'solana' ? 'Solana' : e.chain === 'base' ? 'Base' : 'Ethereum'} · {fmtDate(new Date(e.atMs), true)}
        </div>
      </div>
      {mine && <Badge tone="accent" icon={<Eye className="size-3" />}>dans ta liste</Badge>}
    </li>
  );
}

/** Wallets connus proposés selon TON portefeuille : un clic pour les suivre. */
function RecommendedCard() {
  const wallets = useStore((s) => s.smartWallets);
  const addSmartWallet = useStore((s) => s.addSmartWallet);
  const likesGems = useStore((s) => s.profile.interests.gems);
  const pf = usePortfolio();
  const [all, setAll] = useState(false);
  const recos = useMemo(() => recommendSmartWallets(pf.holdings.map((h) => ({ coinId: h.coinId, symbol: h.symbol, valueUsd: h.valueUsd, bucket: h.bucket })), wallets, { likesGems }), [pf.holdings, wallets, likesGems]);
  const relevant = recos.filter((r) => r.score > 0);
  const shown = all ? recos : (relevant.length ? relevant : recos).slice(0, 5);
  const btcPct = pf.totals.value > 0 ? (pf.holdings.filter((h) => h.bucket === 'btc').reduce((s, h) => s + h.value, 0) / pf.totals.value) * 100 : 0;

  const follow = (r: Recommendation) => addSmartWallet({ id: uid(), label: r.wallet.label, chain: r.wallet.chain, address: r.wallet.address, kind: r.wallet.kind, addedAt: new Date().toISOString() });

  return (
    <Card title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-accent" />Wallets recommandés pour ton portefeuille</span>} subtitle="Des adresses publiques connues, vérifiées sur leur étiquette Etherscan ou leur nom ENS, classées selon ce que tu détiens">
      {recos.length === 0 ? (
        <Empty title="Tu suis déjà toute la liste">Ajoute d'autres adresses avec « Suivre un wallet ».</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((r) => (
            <li key={r.wallet.key} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {r.wallet.label}
                  <Badge>{KIND_LABEL[r.wallet.kind]}</Badge>
                  <a className="text-xs font-normal text-link underline decoration-dotted underline-offset-2" href={explorerOf({ ...r.wallet, id: r.wallet.key, addedAt: '' })} target="_blank" rel="noreferrer">{r.wallet.address.slice(0, 6)}…{r.wallet.address.slice(-4)}</a>
                </div>
                <p className="mt-0.5 text-xs text-ink-2">{r.wallet.why}</p>
                {r.reasons.length > 0 && <p className="mt-0.5 text-xs text-accent">{r.reasons.join(' ')}</p>}
                <p className="mt-0.5 text-[0.7rem] text-muted">Source : {r.wallet.source}</p>
              </div>
              <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => follow(r)}>Suivre</Button>
            </li>
          ))}
        </ul>
      )}
      {recos.length > shown.length && !all && <button type="button" className="mt-2 text-xs font-medium text-accent hover:underline" onClick={() => setAll(true)}>Voir toute la liste ({recos.length})</button>}
      <p className="mt-3 text-xs text-muted">
        Le suivi lit les transferts de tokens sur Ethereum (pas l'ETH « natif ») : une vente d'ETH apparaît comme un achat de stablecoins.
        {btcPct >= 30 ? ` Ton Bitcoin (${Math.round(btcPct)} %) n'a pas d'équivalent ici : la chaîne Bitcoin n'est pas suivie.` : ''} Aucune adresse Solana ou Base n'a pu être attribuée de façon fiable : ajoute les tiennes à la main.
      </p>
    </Card>
  );
}
