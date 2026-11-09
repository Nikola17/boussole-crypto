// Import de l'historique Crypto.com (CSV) : aperçu, classement des natures inconnues, puis ajout au journal.

import { FileUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { newId, useStore } from '../store/useStore';
import { useFx, useMarkets } from '../hooks/useMarket';
import { searchCoins } from '../api/coingecko';
import {
  buildCryptoComTransactions, CLASS_LABEL, parseCryptoComCsv, resolveSymbols, type ImportClass, type ParsedCryptoCom,
} from '../lib/importers/cryptocom';
import { fmtDate } from '../lib/format';
import type { CoinRef } from '../types';
import { CoinPicker } from './CoinPicker';
import { Badge, Banner, Button, Field, Modal, Select } from './ui';

const NEW_ACCOUNT = '__new__';
const CLASSES = Object.keys(CLASS_LABEL) as ImportClass[];

export function ImportCryptoCom({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useStore((s) => s.accounts);
  const existing = useStore((s) => s.transactions);
  const upsertAccount = useStore((s) => s.upsertAccount);
  const importTransactions = useStore((s) => s.importTransactions);
  const markets = useMarkets();
  const fx = useFx();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCryptoCom | null>(null);
  const [account, setAccount] = useState(NEW_ACCOUNT);
  const [classes, setClasses] = useState<Record<string, ImportClass>>({});
  const [depositFrom, setDepositFrom] = useState('external');
  const [withdrawTo, setWithdrawTo] = useState('external');
  const [manual, setManual] = useState<Record<string, CoinRef | null>>({});
  const [found, setFound] = useState<Record<string, CoinRef | null>>({});
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);

  useEffect(() => {
    if (open) return;
    setParsed(null); setFileName(''); setResult(null); setManual({}); setFound({}); setClasses({});
  }, [open]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setFileName(f.name);
    setResult(null);
    setManual({});
    setFound({});
    const p = parseCryptoComCsv(await f.text());
    setParsed(p);
    if (!p.ok) return;
    setClasses(Object.fromEntries(p.kinds.map((k) => [k.kind, k.defaultClass])));
    setAccount(accounts.find((a) => /crypto\.?com/i.test(a.name))?.id ?? NEW_ACCOUNT);
    setWithdrawTo(accounts.find((a) => a.kind === 'hardware')?.id ?? 'external');
    setDepositFrom('external');
  }

  const base = useMemo(() => (parsed?.ok ? resolveSymbols(parsed.symbols, markets.data ?? []) : null), [parsed, markets.data]);

  // Cryptos hors du top 250 : recherche CoinGecko du ticker exact (seuls les tickers sont envoyés).
  useEffect(() => {
    if (!base?.unresolved.length) return;
    let cancelled = false;
    void (async () => {
      for (const s of base.unresolved) {
        try {
          const hits = (await searchCoins(s)).filter((c) => c.symbol.toUpperCase() === s);
          hits.sort((a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9));
          const hit = hits[0];
          if (!cancelled) setFound((f) => ({ ...f, [s]: hit ? { coinId: hit.id, symbol: hit.symbol, name: hit.name, image: hit.large || hit.thumb } : null }));
        } catch {
          if (!cancelled) setFound((f) => ({ ...f, [s]: null }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [base]);

  const symbols = useMemo(() => ({ ...(base?.resolved ?? {}), ...found, ...manual }), [base, found, manual]);
  const used = useMemo(() => new Set((parsed?.kinds ?? []).filter((k) => classes[k.kind] === 'deposit' || classes[k.kind] === 'withdraw').map((k) => classes[k.kind])), [parsed, classes]);

  const preview = useMemo(
    () => (parsed?.ok ? buildCryptoComTransactions(parsed, { accountId: account === NEW_ACCOUNT ? 'new' : account, classByKind: classes, symbols, depositFrom, withdrawTo, fxEurPerUsd: fx }) : null),
    [parsed, account, classes, symbols, depositFrom, withdrawTo, fx],
  );
  const known = useMemo(() => new Set(existing.map((t) => t.id)), [existing]);
  const dupes = preview ? preview.txs.filter((t) => known.has(t.id)).length : 0;

  function doImport() {
    if (!parsed?.ok) return;
    let id = account;
    if (account === NEW_ACCOUNT) {
      id = newId();
      upsertAccount({ id, name: 'Crypto.com', kind: 'exchange', walletIds: [], createdAt: new Date().toISOString() });
    }
    const out = buildCryptoComTransactions(parsed, { accountId: id, classByKind: classes, symbols, depositFrom, withdrawTo, fxEurPerUsd: fx });
    setResult(importTransactions(out.txs));
  }

  const otherAccounts = accounts.filter((a) => a.id !== account);
  const footer = result ? (
    <Button variant="primary" onClick={onClose}>Fermer</Button>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      {parsed?.ok && <Button variant="primary" disabled={!preview || preview.txs.length === dupes} onClick={doImport}>{preview && preview.txs.length - dupes > 0 ? `Importer ${preview.txs.length - dupes} transactions` : 'Rien de nouveau à importer'}</Button>}
    </>
  );

  return (
    <Modal open={open} onClose={onClose} wide title="Importer l’historique Crypto.com (CSV)" footer={footer}>
      {result ? (
        <Banner tone="success" title={`${result.added} transaction${result.added > 1 ? 's' : ''} ajoutée${result.added > 1 ? 's' : ''}`}>
          {result.skipped > 0 ? `${result.skipped} déjà présente${result.skipped > 1 ? 's' : ''} (ignorée${result.skipped > 1 ? 's' : ''}, aucun doublon). ` : ''}
          Ouvre l’onglet « Comptes » pour rapprocher ton journal de la blockchain, puis « Transactions » pour contrôler les lignes importées.
        </Banner>
      ) : !parsed || !parsed.ok ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">Dans l’application Crypto.com : <b className="text-ink">Comptes → Historique → Exporter</b>, format CSV. Le fichier est lu ici, sur cet appareil ; seuls les noms des cryptos peuvent être recherchés en ligne.</p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button variant="primary" icon={<FileUp className="size-4" />} onClick={() => fileRef.current?.click()}>Choisir le fichier CSV</Button>
          {fileName && <p className="text-xs text-muted">{fileName}</p>}
          {parsed && !parsed.ok && <Banner tone="warn" title="Fichier non reconnu">{parsed.error}</Banner>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-surface-2 p-3 text-sm text-ink-2">
            <b className="text-ink">{fileName}</b> · {parsed.rows.length} lignes{parsed.range ? ` · du ${fmtDate(parsed.range.from)} au ${fmtDate(parsed.range.to)}` : ''} · {parsed.symbols.length} cryptos
            {parsed.invalidRows > 0 && <span className="text-down"> · {parsed.invalidRows} ligne{parsed.invalidRows > 1 ? 's' : ''} illisible{parsed.invalidRows > 1 ? 's' : ''}</span>}
          </div>
          <Field label="Compte qui reçoit ces opérations">
            <Select value={account} onChange={(e) => setAccount(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value={NEW_ACCOUNT}>Nouveau compte « Crypto.com »</option>
            </Select>
          </Field>
          <div>
            <p className="mb-1 text-xs font-medium text-ink-2">Natures d’opération trouvées</p>
            {parsed.kinds.some((k) => !k.known) && <Banner tone="warn" title="Natures inconnues">Boussole ne devine rien : choisis ce que fait chacune des natures marquées « inconnue » (« Ignorer » est sans danger).</Banner>}
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line text-sm">
              {parsed.kinds.map((k) => (
                <li key={k.kind} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-xs text-ink">{k.kind || '(vide)'}</span>
                    <span className="ml-2 text-xs text-muted">{k.count} ligne{k.count > 1 ? 's' : ''}</span>
                    {!k.known && <Badge tone="warn" className="ml-2">inconnue</Badge>}
                    {k.sample && <span className="block truncate text-xs text-muted">{k.sample}</span>}
                  </span>
                  <div className="w-full sm:w-80">
                    <Select value={classes[k.kind] ?? k.defaultClass} onChange={(e) => setClasses({ ...classes, [k.kind]: e.target.value as ImportClass })}>
                      {CLASSES.map((c) => <option key={c} value={c}>{CLASS_LABEL[c]}</option>)}
                    </Select>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {(used.has('deposit') || used.has('withdraw')) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {used.has('deposit') && (
                <Field label="Les entrées de crypto viennent de…" hint="Un compte à toi : simple transfert, le coût d’acquisition suit.">
                  <Select value={depositFrom} onChange={(e) => setDepositFrom(e.target.value)}>
                    <option value="external">L’extérieur (dépôt, airdrop)</option>
                    {otherAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                </Field>
              )}
              {used.has('withdraw') && (
                <Field label="Les sorties de crypto vont vers…" hint="Ton Ledger : simple transfert, le coût d’acquisition suit.">
                  <Select value={withdrawTo} onChange={(e) => setWithdrawTo(e.target.value)}>
                    <option value="external">L’extérieur (retrait)</option>
                    {otherAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                </Field>
              )}
            </div>
          )}
          {!!base?.unresolved.length && (
            <div>
              <p className="mb-1 text-xs font-medium text-ink-2">Cryptos à identifier</p>
              <ul className="space-y-2">
                {base.unresolved.map((s) => (
                  <li key={s} className="rounded-lg border border-line p-3 text-sm">
                    <p className="font-medium text-ink">{s} <span className="text-xs font-normal text-muted">{found[s] === undefined ? 'recherche…' : found[s] ? `trouvée : ${found[s]?.name}` : 'introuvable : choisis-la ou elle sera ignorée'}</span></p>
                    <div className="mt-2"><CoinPicker value={manual[s] ?? found[s] ?? null} onChange={(c) => setManual({ ...manual, [s]: c })} /></div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview && (
            <div className="rounded-lg border border-line p-3 text-sm">
              <p className="font-medium text-ink">{preview.txs.length - dupes} transaction{preview.txs.length - dupes > 1 ? 's' : ''} à ajouter{dupes > 0 ? ` · ${dupes} déjà présente${dupes > 1 ? 's' : ''}` : ''}</p>
              {preview.skipped.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-muted">{preview.skipped.map((s) => <li key={s.reason}>{s.count} × {s.reason}</li>)}</ul>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
