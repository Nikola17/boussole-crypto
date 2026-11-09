import { FileUp, Landmark, Pencil, Plus, RefreshCw, ShieldAlert, Trash2, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { usePortfolio } from '../hooks/usePortfolio';
import { useFx } from '../hooks/useMarket';
import { BUCKET_LABEL, BUCKET_ORDER, concentration, rebalance, stressTest } from '../lib/portfolio';
import { computeFrenchTax, simulateSale, EXEMPTION_THRESHOLD_EUR } from '../lib/tax';
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtPrice, fmtQty, shortAddress, uid } from '../lib/format';
import { detectChain, EVM_CHAINS } from '../api/wallets';
import { Link, setQuery, useHashPath } from '../router';
import {
  Badge, Banner, Button, Card, CoinIcon, Delta, Empty, Field, Input, Modal, NumberInput, PageHeader, Segmented,
  SegmentedBar, Select, Spinner, Stat, Table, Td, Toggle,
} from '../components/ui';
import { TransactionModal } from '../components/forms';
import { AccountsPanel } from '../components/AccountsPanel';
import { ImportCryptoCom } from '../components/ImportCryptoCom';
import { RealFeesCard } from '../components/RealFeesCard';
import { ConsolidateCard } from '../components/ConsolidateCard';
import { ExitPlanCard } from '../components/ExitPlanCard';
import { BenchmarkCard } from '../components/BenchmarkCard';
import { isExtendedKey, isExtendedPrivateKey, SCRIPT_LABEL, type BtcScript, type BtcScriptChoice } from '../lib/xpub';
import type { Bucket, Transaction, WalletAddress } from '../types';

const BUCKET_COLOR: Record<Bucket, string> = {
  btc: 'var(--series-2)', eth: 'var(--series-3)', large: 'var(--series-4)', mid: 'var(--series-5)', small: 'var(--series-6)', stable: 'var(--series-7)',
};

type Tab = 'positions' | 'comptes' | 'wallets' | 'transactions' | 'fiscalite';

export default function Portfolio() {
  const { query } = useHashPath();
  const tab = (query.get('tab') as Tab) || 'positions';
  const pf = usePortfolio();
  const currency = pf.currency;
  const [txOpen, setTxOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Mon portefeuille"
        subtitle="Tes achats (journal) et tes wallets publics, valorisés en temps réel. Tes données restent sur cet appareil."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setTxOpen(true)}>Transaction</Button>}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Valeur totale" value={<span className="text-2xl">{fmtMoney(pf.totals.value, currency, 0)}</span>} delta={<Delta value={pf.totals.change24hPct} />} hint="24 h" />
        <Stat label="Investi (journal)" value={fmtMoney(pf.totals.cost, currency, 0)} />
        <Stat label="Plus-value latente" value={fmtMoney(pf.totals.unrealized, currency, 0)} delta={<Delta value={pf.totals.unrealizedPct} />} />
        <Stat label="Plus-value réalisée" value={fmtMoney(pf.totals.realized, currency, 0)} />
      </div>
      <Segmented
        value={tab}
        onChange={(v) => setQuery({ tab: v })}
        options={[
          { value: 'positions', label: 'Positions & répartition' },
          { value: 'comptes', label: `Comptes (${pf.accounts.length})` },
          { value: 'wallets', label: `Wallets (${pf.wallets.length})` },
          { value: 'transactions', label: 'Transactions' },
          { value: 'fiscalite', label: 'Fiscalité 🇫🇷' },
        ]}
      />
      {tab === 'positions' && <Positions />}
      {tab === 'comptes' && <AccountsPanel onImport={() => setImportOpen(true)} />}
      {tab === 'wallets' && <Wallets />}
      {tab === 'transactions' && <Transactions onImport={() => setImportOpen(true)} />}
      {tab === 'fiscalite' && <Taxes />}
      <TransactionModal open={txOpen} onClose={() => setTxOpen(false)} />
      <ImportCryptoCom open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function Positions() {
  const pf = usePortfolio();
  const profile = useStore((s) => s.profile);
  const currency = pf.currency;
  const [move, setMove] = useState(-30);
  const total = pf.totals.value;
  const lines = rebalance(pf.alloc, profile.target);
  const stress = stressTest(pf.alloc, move);
  const conc = concentration(pf.holdings.map((h) => h.value));

  if (!pf.holdings.length) {
    return (
      <Empty icon={<Wallet className="size-8" />} title="Ton portefeuille est vide" action={<Link to="/portefeuille?tab=wallets" className="text-sm font-medium text-accent hover:underline">Ajouter une adresse de wallet</Link>}>
        Ajoute tes achats avec le bouton « Transaction » (recommandé : calcul des plus-values et de la fiscalité) ou suis une adresse publique Bitcoin, Ethereum/EVM ou Solana.
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Répartition par poche de risque" subtitle={`Profil ${profile.archetype} : compare ta répartition à ta cible`}>
          <SegmentedBar format={(v) => fmtMoney(v, currency, 0)} segments={BUCKET_ORDER.map((b) => ({ key: b, label: BUCKET_LABEL[b], value: pf.alloc[b], color: BUCKET_COLOR[b] }))} />
          <div className="mt-4 overflow-x-auto">
            <table className="tnum w-full min-w-[420px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-2 font-medium">Poche</th><th className="py-2 text-right font-medium">Actuel</th><th className="py-2 text-right font-medium">Cible</th><th className="py-2 text-right font-medium">Pour rééquilibrer</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.bucket} className="border-b border-line">
                    <td className="py-2"><span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: BUCKET_COLOR[l.bucket] }} />{BUCKET_LABEL[l.bucket]}</span></td>
                    <td className="py-2 text-right">{fmtNum(l.currentPct, 1)} %</td>
                    <td className="py-2 text-right text-ink-2">{fmtNum(l.targetPct, 0)} %</td>
                    <td className={`py-2 text-right ${Math.abs(l.currentPct - l.targetPct) < 3 ? 'text-muted' : l.diffValue > 0 ? 'text-up' : 'text-down'}`}>
                      {Math.abs(l.currentPct - l.targetPct) < 3 ? 'OK' : `${l.diffValue > 0 ? 'Acheter' : 'Vendre'} ${fmtMoney(Math.abs(l.diffValue), currency, 0)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Rééquilibre de préférence en orientant tes prochains achats (DCA) plutôt qu’en vendant : c’est plus simple et fiscalement neutre.</p>
        </Card>
        <Card className="lg:col-span-2" title={<span className="inline-flex items-center gap-2"><ShieldAlert className="size-4 text-accent" />Test de résistance</span>} subtitle="Et si le Bitcoin chutait (ou montait) de…">
          <input type="range" min={-70} max={100} step={5} value={move} onChange={(e) => setMove(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label="Variation du Bitcoin" />
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-sm text-ink-2">Bitcoin {fmtPct(move, 0)}</span>
            <span className="text-xl font-semibold text-ink">{fmtMoney(stress.newTotal, currency, 0)}</span>
          </div>
          <p className="mt-1 text-sm"><Delta value={stress.changePct} /> <span className="text-muted">sur ton portefeuille (bêta historique par poche)</span></p>
          <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm">
            <div className="flex justify-between"><span className="text-ink-2">Concentration</span><span className="font-medium text-ink">{conc}/100</span></div>
            <p className="mt-1 text-xs text-muted">{conc > 50 ? 'Très concentré : une seule ligne domine.' : conc > 25 ? 'Concentration modérée.' : 'Bonne diversification.'}</p>
            <div className="mt-2 flex justify-between"><span className="text-ink-2">Stablecoins</span><span className="font-medium text-ink">{total > 0 ? fmtNum((pf.alloc.stable / total) * 100, 1) : 0} %</span></div>
            <p className="mt-1 text-xs text-muted">Réserve visée : {profile.rules.cashReservePct} % pour acheter les baisses.</p>
          </div>
        </Card>
      </div>

      <ExitPlanCard />

      <BenchmarkCard />

      <ConsolidateCard />

      <Card padded={false} title="Positions" subtitle="Clique sur une ligne pour voir ses signaux">
        <Table head={['Crypto', 'Quantité', 'Prix', 'Valeur', 'Poids', '24 h', 'Prix moyen', 'Plus-value', 'Source']}>
          {pf.holdings.map((h) => {
            const avg = h.cost != null && h.quantity > 0 ? h.cost / h.quantity : null;
            return (
              <tr key={h.key} className="hover:bg-surface-2">
                <Td left>
                  {h.coinId ? (
                    <Link to={`/coin/${h.coinId}`} className="flex items-center gap-2"><CoinIcon src={h.image} symbol={h.symbol} size={22} /><span className="font-medium text-ink">{h.symbol}</span><span className="max-w-[140px] truncate text-xs text-muted">{h.name}</span></Link>
                  ) : (
                    <span className="flex items-center gap-2"><CoinIcon src={h.image} symbol={h.symbol} size={22} /><span className="font-medium text-ink">{h.symbol}</span></span>
                  )}
                </Td>
                <Td>{fmtQty(h.quantity)}</Td>
                <Td>{fmtPrice(h.priceUsd != null ? h.priceUsd * pf.rate : null, currency)}</Td>
                <Td className="font-medium text-ink">{fmtMoney(h.value, currency, 0)}</Td>
                <Td className="text-ink-2">{total > 0 ? `${fmtNum((h.value / total) * 100, 1)} %` : '—'}</Td>
                <Td><Delta value={h.change24h} /></Td>
                <Td className="text-ink-2">{avg != null ? fmtPrice(avg, currency) : '—'}</Td>
                <Td>{h.pnl != null ? <span className="inline-flex flex-col items-end"><span className={h.pnl >= 0 ? 'text-up' : 'text-down'}>{fmtMoney(h.pnl, currency, 0)}</span><Delta value={h.pnlPct} className="text-xs" /></span> : <span className="text-muted">—</span>}</Td>
                <Td><Badge>{h.accountName ?? (h.source === 'wallet' ? h.walletLabel ?? 'Wallet' : 'Journal')}</Badge></Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}

function Wallets() {
  const pf = usePortfolio();
  const upsert = useStore((s) => s.upsertWallet);
  const remove = useStore((s) => s.removeWallet);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [chains, setChains] = useState<string[]>(['ethereum', 'base', 'arbitrum']);
  const [include, setInclude] = useState(true);
  const [btcScript, setBtcScript] = useState<BtcScriptChoice>('auto');
  const detected = detectChain(address);
  const isXpub = isExtendedKey(address);
  const isPrivate = isExtendedPrivateKey(address);

  function save() {
    if (!detected) return;
    const w: WalletAddress = { id: uid(), label: label.trim() || (detected === 'bitcoin' ? (isXpub ? 'Compte Bitcoin (xpub)' : 'Wallet Bitcoin') : detected === 'solana' ? 'Wallet Solana' : 'Wallet EVM'), chain: detected, address: address.trim(), evmChains: detected === 'evm' ? chains : undefined, btcScript: isXpub ? btcScript : undefined, includeInTotal: include, createdAt: new Date().toISOString() };
    upsert(w);
    setOpen(false);
    setLabel('');
    setAddress('');
  }

  return (
    <div className="space-y-4">
      <Banner tone="info" title="Lecture seule, 100 % sûr">Boussole ne lit que des adresses publiques et des clés publiques étendues (xpub). Il ne te demandera JAMAIS ta phrase secrète (seed) ni ta clé privée : quiconque te la demande essaie de te voler.</Banner>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Ajouter une adresse</Button>
        <Button icon={<RefreshCw className="size-4" />} onClick={() => void qc.invalidateQueries({ queryKey: ['wallet'] })}>Actualiser les soldes</Button>
      </div>
      {!pf.wallets.length && <Empty icon={<Wallet className="size-8" />} title="Aucun wallet suivi">Ajoute une adresse Bitcoin (bc1…, 1…, 3…), Ethereum / EVM (0x…, scanne aussi Base, Arbitrum, BNB Chain…) ou Solana.</Empty>}
      <div className="grid gap-4 lg:grid-cols-2">
        {pf.wallets.map((w, i) => {
          const r = pf.walletResults[i];
          const data = pf.walletData[i];
          const total = (data?.totalUsd ?? 0) * pf.rate;
          return (
            <Card key={w.id} title={w.label} subtitle={`${w.chain === 'bitcoin' ? 'Bitcoin' : w.chain === 'solana' ? 'Solana' : `EVM · ${(w.evmChains ?? []).join(', ')}`} · ${shortAddress(w.address)}`} actions={<Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} aria-label="Supprimer" onClick={() => remove(w.id)} />}>
              {r?.isLoading && <Spinner label="Lecture de la blockchain…" />}
              {r?.error && <Banner tone="warn">{(r.error as Error).message}</Banner>}
              {data && (
                <>
                  <div className="mb-2 text-xl font-semibold text-ink">{fmtMoney(total, pf.currency, 0)}</div>
                  <ul className="divide-y divide-line text-sm">
                    {data.holdings.filter((h) => (h.valueUsd ?? 0) >= 1 || h.valueUsd == null).sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0)).slice(0, 25).map((h, j) => (
                      <li key={j} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="min-w-0 truncate"><span className="font-medium text-ink">{h.symbol}</span> <span className="text-xs text-muted">{h.chain}</span></span>
                        <span className="tnum text-right text-ink-2">{fmtQty(h.quantity)} · <span className="text-ink">{h.valueUsd != null ? fmtMoney(h.valueUsd * pf.rate, pf.currency, 0) : 'prix inconnu'}</span></span>
                      </li>
                    ))}
                  </ul>
                  {!!data.notes?.length && <p className="mt-2 text-xs text-muted">{data.notes.join(' · ')}</p>}
                  {data.errors.length > 0 && <p className="mt-2 text-xs text-muted">{data.errors.join(' · ')}</p>}
                </>
              )}
              <div className="mt-3 border-t border-line pt-3">
                <Toggle checked={w.includeInTotal} onChange={(v) => upsert({ ...w, includeInTotal: v })} label="Inclure dans le total du portefeuille" hint="Désactive si ces avoirs sont déjà saisis dans ton journal de transactions (évite le double comptage)." />
              </div>
            </Card>
          );
        })}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Suivre une adresse publique" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button variant="primary" disabled={!detected || isPrivate} onClick={save}>Ajouter</Button></>}>
        <div className="space-y-3">
          <Field label="Adresse publique ou clé publique étendue (xpub)" hint={address ? (isPrivate ? 'Clé privée : refusée' : isXpub ? 'Clé publique étendue : toutes les adresses de ton compte Bitcoin seront lues' : detected ? `Détectée : ${detected === 'evm' ? 'EVM (Ethereum & compatibles)' : detected === 'bitcoin' ? 'Bitcoin' : 'Solana'}` : 'Format non reconnu') : 'Bitcoin (adresse ou xpub), EVM (0x…) ou Solana. Pour tout ton Ledger Bitcoin, utilise la clé publique étendue du compte : Ledger Live l’affiche dans les réglages avancés du compte (selon la version).'}>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="bc1…, xpub…, 0x… ou adresse Solana" autoComplete="off" spellCheck={false} />
          </Field>
          {isPrivate && <Banner tone="danger" title="Ceci est une clé PRIVÉE (xprv)">Ne la colle jamais ici ni ailleurs : elle donne accès à tes fonds. Utilise la clé publique du compte (xpub, ypub ou zpub).</Banner>}
          {isXpub && (
            <Field label="Format des adresses" hint="zpub = Native SegWit, ypub = SegWit. Pour un xpub, « Automatique » repère le format qui contient des fonds (Native SegWit d’abord, le choix par défaut de Ledger Live).">
              <Select value={btcScript} onChange={(e) => setBtcScript(e.target.value as BtcScriptChoice)}>
                <option value="auto">Automatique</option>
                {(Object.keys(SCRIPT_LABEL) as BtcScript[]).map((k) => <option key={k} value={k}>{SCRIPT_LABEL[k]}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Nom"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex : Ledger, MetaMask, Phantom" /></Field>
          {detected === 'evm' && (
            <div>
              <p className="mb-2 text-xs font-medium text-ink-2">Réseaux à scanner</p>
              <div className="flex flex-wrap gap-2">
                {EVM_CHAINS.map((c) => (
                  <button key={c.key} type="button" onClick={() => setChains(chains.includes(c.key) ? chains.filter((x) => x !== c.key) : [...chains, c.key])} className={`rounded-lg border px-2.5 py-1 text-xs ${chains.includes(c.key) ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-2'}`}>{c.label}</button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Le solde natif et les principaux tokens de chaque réseau sont lus via des nœuds publics.</p>
            </div>
          )}
          <Toggle checked={include} onChange={setInclude} label="Inclure dans le total du portefeuille" />
        </div>
      </Modal>
    </div>
  );
}

function Transactions({ onImport }: { onImport: () => void }) {
  const txs = useStore((s) => s.transactions);
  const remove = useStore((s) => s.removeTransaction);
  const [edit, setEdit] = useState<Transaction | null>(null);
  const [q, setQ] = useState('');
  const list = useMemo(() => [...txs].sort((a, b) => b.date.localeCompare(a.date)).filter((t) => !q || t.symbol.toLowerCase().includes(q.toLowerCase()) || t.name.toLowerCase().includes(q.toLowerCase())), [txs, q]);
  const accounts = useStore((s) => s.accounts);
  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name;
  const typeLabel: Record<Transaction['type'], string> = { buy: 'Achat', sell: 'Vente', deposit: 'Dépôt', withdraw: 'Retrait', reward: 'Récompense', transfer: 'Transfert' };
  if (!txs.length) {
    return (
      <div className="space-y-4">
        <Empty icon={<Landmark className="size-8" />} title="Aucune transaction" action={<Button icon={<FileUp className="size-4" />} onClick={onImport}>Importer l’historique Crypto.com (CSV)</Button>}>Saisis tes achats et ventes, ou importe ton historique : Boussole calcule ton prix moyen, tes plus-values et ta fiscalité.</Empty>
        <RealFeesCard />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <RealFeesCard />
    <Card padded={false} title="Historique" actions={<><Button size="sm" className="shrink-0 whitespace-nowrap" icon={<FileUp className="size-3.5" />} onClick={onImport}>Importer un CSV</Button><Input className="h-8 w-40" placeholder="Filtrer…" value={q} onChange={(e) => setQ(e.target.value)} /></>}>
      <Table head={['Date', 'Type', 'Crypto', 'Compte', 'Quantité', 'Prix', 'Total', 'Frais', '']}>
        {list.map((t) => (
          <tr key={t.id} className="hover:bg-surface-2">
            <Td left className="text-ink-2">{fmtDate(t.date)}</Td>
            <Td><Badge tone={t.type === 'transfer' ? 'neutral' : t.type === 'buy' || t.type === 'deposit' || t.type === 'reward' ? 'up' : 'down'}>{typeLabel[t.type]}{t.type === 'sell' && t.toFiat === false ? ' (crypto)' : ''}</Badge></Td>
            <Td><span className="inline-flex items-center gap-2"><CoinIcon src={t.image} symbol={t.symbol} size={18} />{t.symbol.toUpperCase()}</span></Td>
            <Td className="text-ink-2">{t.type === 'transfer' ? `${accountName(t.accountId) ?? '—'} → ${accountName(t.toAccountId) ?? '—'}` : accountName(t.accountId) ?? '—'}</Td>
            <Td>{fmtQty(t.quantity)}</Td>
            <Td>{fmtPrice(t.price, t.currency)}</Td>
            <Td className="font-medium text-ink">{fmtMoney(t.price * t.quantity, t.currency)}</Td>
            <Td className="text-ink-2">{fmtMoney(t.fee, t.currency)}</Td>
            <Td>
              <span className="inline-flex gap-1">
                <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} aria-label="Modifier" onClick={() => setEdit(t)} />
                <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} aria-label="Supprimer" onClick={() => remove(t.id)} />
              </span>
            </Td>
          </tr>
        ))}
      </Table>
      <TransactionModal open={!!edit} initial={edit} onClose={() => setEdit(null)} />
    </Card>
    </div>
  );
}

function Taxes() {
  const txs = useStore((s) => s.transactions);
  const rateSetting = useStore((s) => s.settings.taxRatePct);
  const currency = useStore((s) => s.settings.currency);
  const pf = usePortfolio();
  const fx = useFx();
  const report = useMemo(() => computeFrenchTax(txs, rateSetting), [txs, rateSetting]);
  const valueEur = currency === 'EUR' ? pf.totals.value : pf.totals.value * fx;
  const [amount, setAmount] = useState<number | ''>(1000);
  const thisYear = new Date().getFullYear();
  const ceded = report.years.find((y) => y.year === thisYear)?.totalCessions ?? 0;
  const sim = amount !== '' && valueEur > 0 ? simulateSale(Number(amount), valueEur, report.acquisitionRemaining, rateSetting, ceded) : null;

  return (
    <div className="space-y-4">
      <Banner tone="info" title="Fiscalité des particuliers en France (article 150 VH bis du CGI)">
        Seules les conversions en monnaie classique (ou les paiements en crypto) sont imposables ; les échanges crypto contre crypto sont neutres. Exonération si le total des ventes de l’année ne dépasse pas {EXEMPTION_THRESHOLD_EUR} €. Taux appliqué : {String(rateSetting).replace('.', ',')} % (flat tax 2026 : 12,8 % d’impôt + 18,6 % de prélèvements sociaux). Estimation pédagogique : en cas de doute, consulte un professionnel.
      </Banner>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Simuler une vente aujourd’hui" subtitle="Combien d’impôt si tu convertis en euros ?">
          <Field label="Montant à convertir en euros (€)"><NumberInput value={amount} onChange={setAmount} /></Field>
          {sim ? (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted">Valeur globale du portefeuille (V)</dt><dd className="tnum font-medium text-ink">{fmtMoney(sim.portfolioValue, 'EUR', 0)}</dd></div>
              <div><dt className="text-xs text-muted">Prix total d’acquisition (A)</dt><dd className="tnum font-medium text-ink">{fmtMoney(sim.acquisition, 'EUR', 0)}</dd></div>
              <div><dt className="text-xs text-muted">Plus-value imposable</dt><dd className={`tnum font-medium ${sim.gain >= 0 ? 'text-ink' : 'text-down'}`}>{fmtMoney(sim.gain, 'EUR', 0)}</dd></div>
              <div><dt className="text-xs text-muted">Impôt estimé</dt><dd className="tnum font-semibold text-ink">{sim.exempt ? 'Exonéré (≤ 305 €/an)' : fmtMoney(sim.tax, 'EUR', 0)}</dd></div>
              <div className="col-span-2 rounded-lg bg-surface-2 p-3"><span className="text-ink-2">Net en poche : </span><span className="font-semibold text-ink">{fmtMoney(sim.net, 'EUR', 0)}</span><span className="text-xs text-muted"> · formule : C − A × C / V</span></div>
            </dl>
          ) : <p className="mt-3 text-sm text-muted">Ajoute des transactions pour simuler.</p>}
        </Card>
        <Card title="Mes années fiscales" subtitle="Calculé à partir des ventes « converties en euros » de ton journal">
          {!report.years.length && <p className="text-sm text-muted">Aucune vente imposable enregistrée.</p>}
          <ul className="space-y-3">
            {report.years.map((y) => (
              <li key={y.year} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex items-center justify-between"><span className="font-medium text-ink">{y.year}</span>{y.exempt ? <Badge tone="up">Exonéré</Badge> : <Badge tone="warn">Imposable</Badge>}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-muted">Total des cessions</div><div className="tnum text-ink">{fmtMoney(y.totalCessions, 'EUR', 0)}</div></div>
                  <div><div className="text-muted">Plus-value nette</div><div className="tnum text-ink">{fmtMoney(y.netGain, 'EUR', 0)}</div></div>
                  <div><div className="text-muted">Impôt estimé</div><div className="tnum font-medium text-ink">{fmtMoney(y.tax, 'EUR', 0)}</div></div>
                </div>
                {y.incomplete && <p className="mt-2 text-xs text-down">Certaines ventes n’ont pas la « valeur globale du portefeuille » : modifie-les pour un calcul exact.</p>}
              </li>
            ))}
          </ul>
          <div className="mt-4 text-xs text-ink-2">
            <p className="font-medium text-ink">À déclarer chaque printemps</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Formulaire 2086 : détail des cessions imposables, report sur la 2042-C.</li>
              <li>Formulaire 3916-bis : chaque compte ouvert sur une plateforme étrangère (Binance, Kraken, Coinbase…), même inactif.</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
