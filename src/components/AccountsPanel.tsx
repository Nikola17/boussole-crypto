// Onglet « Comptes » : où sont rangées tes cryptos (plateforme, Ledger, Phantom…), sans double comptage.

import { FileUp, Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { newId, useStore } from '../store/useStore';
import { usePortfolio } from '../hooks/usePortfolio';
import { journalQty, reconcile } from '../lib/accounts';
import { fmtMoney, fmtQty } from '../lib/format';
import type { Account, AccountKind } from '../types';
import { Badge, Banner, Button, Card, Empty, Field, Input, Modal, Select } from './ui';

const KIND_LABEL: Record<AccountKind, string> = { exchange: 'Plateforme (Crypto.com…)', hardware: 'Portefeuille matériel (Ledger…)', hot: 'Portefeuille mobile (Phantom, MetaMask…)' };
const PRESETS: { name: string; kind: AccountKind }[] = [
  { name: 'Ledger', kind: 'hardware' },
  { name: 'Crypto.com', kind: 'exchange' },
  { name: 'Phantom', kind: 'hot' },
];

export function AccountsPanel({ onImport }: { onImport: () => void }) {
  const pf = usePortfolio();
  const upsert = useStore((s) => s.upsertAccount);
  const remove = useStore((s) => s.removeAccount);
  const [edit, setEdit] = useState<Account | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('exchange');
  const [walletIds, setWalletIds] = useState<string[]>([]);

  const priceById = useMemo(() => new Map(pf.holdings.filter((h) => h.coinId && h.priceUsd != null).map((h) => [h.coinId as string, h.priceUsd as number])), [pf.holdings]);
  const symbolById = useMemo(() => new Map(pf.holdings.filter((h) => h.coinId).map((h) => [h.coinId as string, h.symbol])), [pf.holdings]);

  function open(a: Account | null, preset?: { name: string; kind: AccountKind }) {
    setEdit(a ?? { id: '', name: '', kind: 'exchange', walletIds: [], createdAt: '' });
    setName(a?.name ?? preset?.name ?? '');
    setKind(a?.kind ?? preset?.kind ?? 'exchange');
    setWalletIds(a?.walletIds ?? []);
  }

  function save() {
    if (!edit || !name.trim()) return;
    const id = edit.id || newId();
    // Un wallet ne peut appartenir qu'à un seul compte.
    for (const other of pf.accounts) if (other.id !== id && other.walletIds.some((w) => walletIds.includes(w))) upsert({ ...other, walletIds: other.walletIds.filter((w) => !walletIds.includes(w)) });
    upsert({ id, name: name.trim(), kind, walletIds, createdAt: edit.createdAt || new Date().toISOString() });
    setEdit(null);
  }

  /** Valeur (devise d'affichage) et quantités d'un compte : blockchain si un wallet est lié et lu, sinon journal. */
  function summary(a: Account) {
    const covered = pf.covered.includes(a.id);
    const qty = new Map<string, number>();
    if (covered) {
      for (const wid of a.walletIds) {
        const i = pf.wallets.findIndex((w) => w.id === wid);
        for (const h of pf.walletData[i]?.holdings ?? []) if (h.coingeckoId) qty.set(h.coingeckoId, (qty.get(h.coingeckoId) ?? 0) + h.quantity);
      }
    } else {
      for (const coinId of pf.journal.get(a.id)?.keys() ?? []) { const q = journalQty(pf.journal, a.id, coinId); if (q > 1e-12) qty.set(coinId, q); }
    }
    const lines = [...qty.entries()].map(([coinId, q]) => ({ coinId, q, value: q * (priceById.get(coinId) ?? 0) * pf.rate })).sort((x, y) => y.value - x.value);
    return { covered, qty, lines, value: lines.reduce((s, l) => s + l.value, 0) };
  }

  const total = pf.accounts.reduce((s, a) => s + summary(a).value, 0);

  return (
    <div className="space-y-4">
      <Banner tone="info" title="Un compte = un endroit où sont rangées tes cryptos">
        Relie un compte à ses wallets suivis (onglet Wallets) : la <b>blockchain fait alors foi</b> pour ses quantités et ton journal ne sert plus qu’à connaître ton prix d’achat. Rien n’est compté deux fois. Un retrait de ta plateforme vers ton Ledger doit être enregistré comme un <b>transfert</b> : le prix d’achat suit tes cryptos.
      </Banner>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => open(null)}>Ajouter un compte</Button>
        <Button icon={<FileUp className="size-4" />} onClick={onImport}>Importer l’historique Crypto.com (CSV)</Button>
      </div>

      {!pf.accounts.length && (
        <Empty icon={<Landmark className="size-8" />} title="Aucun compte">
          <p>Crée tes comptes pour voir où est rangé chaque euro. Choisis un modèle :</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {PRESETS.map((p) => <Button key={p.name} size="sm" onClick={() => open(null, p)}>{p.name}</Button>)}
          </div>
        </Empty>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {pf.accounts.map((a) => {
          const s = summary(a);
          const onchain = s.covered ? s.qty : null;
          const recon = onchain ? reconcile(onchain, pf.journal.get(a.id) ?? new Map(), symbolById).filter((l) => l.onchain > 1e-12 || l.journal > 1e-12) : [];
          return (
            <Card
              key={a.id}
              title={a.name}
              subtitle={`${KIND_LABEL[a.kind]} · ${s.covered ? 'quantités lues sur la blockchain' : a.walletIds.length ? 'wallet en cours de lecture : journal affiché' : 'quantités du journal'}`}
              actions={<><Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} aria-label="Modifier" onClick={() => open(a)} /><Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} aria-label="Supprimer" onClick={() => remove(a.id)} /></>}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-semibold text-ink">{fmtMoney(s.value, pf.currency, 0)}</span>
                <span className="text-xs text-muted">{total > 0 ? `${Math.round((s.value / total) * 100)} % du total` : ''}</span>
              </div>
              {s.lines.length > 0 ? (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {s.lines.slice(0, 6).map((l) => (
                    <li key={l.coinId} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="font-medium text-ink">{symbolById.get(l.coinId) ?? l.coinId}</span>
                      <span className="tnum text-ink-2">{fmtQty(l.q)} · <span className="text-ink">{fmtMoney(l.value, pf.currency, 0)}</span></span>
                    </li>
                  ))}
                  {s.lines.length > 6 && <li className="py-1.5 text-xs text-muted">+ {s.lines.length - 6} autres lignes</li>}
                </ul>
              ) : <p className="mt-2 text-sm text-muted">Aucune quantité enregistrée pour ce compte.</p>}
              {s.covered && (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="mb-1 text-xs font-medium text-ink-2">Rapprochement blockchain / journal</p>
                  {recon.every((l) => l.ok) ? <Badge tone="up">Le journal et la blockchain concordent</Badge> : (
                    <table className="tnum w-full text-xs">
                      <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Crypto</th><th className="py-1 text-right font-medium">Blockchain</th><th className="py-1 text-right font-medium">Journal</th><th className="py-1 text-right font-medium">Écart</th></tr></thead>
                      <tbody>
                        {recon.map((l) => (
                          <tr key={l.coinId} className="border-t border-line">
                            <td className="py-1.5 font-medium text-ink">{l.symbol}</td>
                            <td className="py-1.5 text-right text-ink">{fmtQty(l.onchain)}</td>
                            <td className="py-1.5 text-right text-ink-2">{fmtQty(l.journal)}</td>
                            <td className={`py-1.5 text-right ${l.ok ? 'text-muted' : l.gap > 0 ? 'text-up' : 'text-down'}`}>{l.ok ? 'OK' : `${l.gap > 0 ? '+' : ''}${fmtQty(l.gap)}`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <p className="mt-1 text-xs text-muted">Écart positif : la blockchain montre plus que ton journal (achat ou réception non saisis, donc sans prix d’achat). Négatif : le journal décrit des cryptos qui ne sont plus là. La valeur affichée suit toujours la blockchain.</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Modifier le compte' : 'Nouveau compte'} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Annuler</Button><Button variant="primary" disabled={!name.trim()} onClick={save}>Enregistrer</Button></>}>
        <div className="space-y-3">
          <Field label="Nom"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ledger, Crypto.com, Phantom…" /></Field>
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {(Object.keys(KIND_LABEL) as AccountKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </Select>
          </Field>
          <div>
            <p className="mb-1 text-xs font-medium text-ink-2">Wallets suivis liés à ce compte</p>
            {!pf.wallets.length && <p className="text-xs text-muted">Ajoute d’abord une adresse ou une clé publique étendue (xpub) dans l’onglet Wallets.</p>}
            <div className="space-y-1.5">
              {pf.wallets.map((w) => (
                <label key={w.id} className="flex items-center gap-2 text-sm text-ink-2">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={walletIds.includes(w.id)} onChange={() => setWalletIds(walletIds.includes(w.id) ? walletIds.filter((x) => x !== w.id) : [...walletIds, w.id])} />
                  {w.label} <span className="text-xs text-muted">{w.chain === 'bitcoin' ? 'Bitcoin' : w.chain === 'solana' ? 'Solana' : 'EVM'}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
