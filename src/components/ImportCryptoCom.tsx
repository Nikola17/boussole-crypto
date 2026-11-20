// Import de l'historique Crypto.com (CSV) : aperçu, classement des natures inconnues, puis ajout au journal.

import { FileUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { newId, useStore } from '../store/useStore';
import { useFx, useMarkets } from '../hooks/useMarket';
import { searchCoins } from '../api/coingecko';
import {
  buildCryptoComTransactions, CLASS_LABEL, parseCryptoComCsv, resolveSymbols, type ImportClass, type ParsedCryptoCom,
} from '../lib/importers/cryptocom';
import { buildExchangeTransactions, detectExchangeCsv, EXCHANGE_LABELS, parseExchangeCsv, type ParsedExchangeCsv } from '../lib/importers/exchanges';
import { CEX_PLATFORMS, DEX_PLATFORMS, findPlatform } from '../lib/platforms';
import { fmtDate, fmtQty } from '../lib/format';
import { dayBeforeFirst, matchManualEntries, missingStock } from '../lib/stock';
import type { CoinRef, Transaction } from '../types';
import { CoinPicker } from './CoinPicker';
import { Badge, Banner, Button, Field, Modal, NumberInput, Select, Toggle } from './ui';

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
  const [parsedExchange, setParsedExchange] = useState<ParsedExchangeCsv | null>(null);
  const [account, setAccount] = useState(NEW_ACCOUNT);
  const [genericPlatformId, setGenericPlatformId] = useState('binance');
  const [classes, setClasses] = useState<Record<string, ImportClass>>({});
  const [depositFrom, setDepositFrom] = useState('external');
  const [withdrawTo, setWithdrawTo] = useState('external');
  const [manual, setManual] = useState<Record<string, CoinRef | null>>({});
  const [found, setFound] = useState<Record<string, CoinRef | null>>({});
  const [result, setResult] = useState<{ added: number; skipped: number; replaced: number; extra: number } | null>(null);
  const [replaceManual, setReplaceManual] = useState(true);
  /** Solde d'ouverture saisi par crypto : quantité détenue avant le premier mouvement du fichier, et son prix d'achat unitaire (€, facultatif). */
  const [opening, setOpening] = useState<Record<string, { on: boolean; qty: number | ''; price: number | '' }>>({});

  useEffect(() => {
    if (open) return;
    setParsed(null); setParsedExchange(null); setFileName(''); setResult(null); setManual({}); setFound({}); setClasses({}); setOpening({}); setReplaceManual(true);
  }, [open]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setFileName(f.name);
    setResult(null);
    setManual({});
    setFound({});
    setParsed(null);
    setParsedExchange(null);
    const text = await f.text();
    const other = detectExchangeCsv(text);
    if (other) {
      const pe = parseExchangeCsv(text);
      setParsedExchange(pe);
      if (pe.ok) setAccount(accounts.find((a) => new RegExp(other, 'i').test(a.name))?.id ?? NEW_ACCOUNT);
      return;
    }
    const p = parseCryptoComCsv(text);
    setParsed(p);
    if (!p.ok) return;
    setClasses(Object.fromEntries(p.kinds.map((k) => [k.kind, k.defaultClass])));
    setAccount(accounts.find((a) => /crypto\.?com/i.test(a.name))?.id ?? NEW_ACCOUNT);
    setWithdrawTo(accounts.find((a) => a.kind === 'hardware')?.id ?? 'external');
    setDepositFrom('external');
  }

  const activeSymbols = parsed?.ok ? parsed.symbols : parsedExchange?.ok ? parsedExchange.symbols : [];
  const base = useMemo(() => (activeSymbols.length ? resolveSymbols(activeSymbols, markets.data ?? []) : null), [activeSymbols, markets.data]);

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

  const preview = useMemo(() => {
    if (parsed?.ok) return buildCryptoComTransactions(parsed, { accountId: account === NEW_ACCOUNT ? 'new' : account, classByKind: classes, symbols, depositFrom, withdrawTo, fxEurPerUsd: fx });
    if (parsedExchange?.ok) return { txs: buildExchangeTransactions(parsedExchange, { accountId: account === NEW_ACCOUNT ? 'new' : account, symbols, fxEurPerUsd: fx }), skipped: parsedExchange.skipped ? [{ reason: 'lignes ignorées ou non prises en charge', count: parsedExchange.skipped }] : [] };
    return null;
  }, [parsed, parsedExchange, account, classes, symbols, depositFrom, withdrawTo, fx]);
  const known = useMemo(() => new Set(existing.map((t) => t.id)), [existing]);
  const dupes = preview ? preview.txs.filter((t) => known.has(t.id)).length : 0;
  const fresh = useMemo(() => (preview ? preview.txs.filter((t) => !known.has(t.id)) : []), [preview, known]);

  // Tes saisies à la main (« J'ai passé ces ordres », DCA…) qui sont aussi dans le fichier : sans remplacement, elles seraient comptées deux fois.
  const matches = useMemo(() => matchManualEntries(existing, fresh.map((t) => (t.accountId === 'new' ? { ...t, accountId: undefined } : t))), [existing, fresh]);
  const replaceIds = useMemo(() => (replaceManual ? matches.map((m) => m.existingId) : []), [replaceManual, matches]);

  // Ventes ou retraits que le journal ne couvre pas : il manque ce que tu détenais avant le premier mouvement.
  const afterTxs = useMemo(() => [...existing.filter((t) => !replaceIds.includes(t.id)), ...fresh], [existing, fresh, replaceIds]);
  const stock = useMemo(() => missingStock(afterTxs), [afterTxs]);
  const openingRow = (coinId: string, missing: number) => opening[coinId] ?? { on: true, qty: Math.ceil(missing * 1e8) / 1e8, price: '' as number | '' };

  function doImport() {
    if (!parsed?.ok && !parsedExchange?.ok) return;
    let id = account;
    const isGeneric = parsedExchange?.exchange === 'generic';
    const pickedPlatform = isGeneric ? findPlatform(genericPlatformId) : parsedExchange?.exchange ? findPlatform(parsedExchange.exchange) : findPlatform('cryptocom');
    const exchangeLabel = pickedPlatform?.name ?? (parsedExchange?.exchange ? EXCHANGE_LABELS[parsedExchange.exchange] : 'Crypto.com');
    if (account === NEW_ACCOUNT) {
      id = newId();
      upsertAccount({
        id,
        name: exchangeLabel,
        kind: pickedPlatform?.accountKind ?? 'exchange',
        ...(pickedPlatform ? { platformId: pickedPlatform.id } : {}),
        walletIds: [],
        createdAt: new Date().toISOString(),
      });
    }
    const out = parsed?.ok
      ? buildCryptoComTransactions(parsed, { accountId: id, classByKind: classes, symbols, depositFrom, withdrawTo, fxEurPerUsd: fx })
      : { txs: buildExchangeTransactions(parsedExchange!, { accountId: id, symbols, fxEurPerUsd: fx }) };
    // Soldes d'ouverture : un dépôt la veille du premier mouvement de la crypto, à ton prix d'achat (0 si tu ne le connais pas).
    const extra: Transaction[] = [];
    for (const m of stock) {
      const row = openingRow(m.coinId, m.missing);
      if (!row.on || row.qty === '' || row.qty <= 0) continue;
      const date = dayBeforeFirst(afterTxs.filter((t) => t.coinId === m.coinId));
      extra.push({
        id: `open-${m.coinId}-${date}`, coinId: m.coinId, symbol: m.symbol, name: m.name, image: m.image, date, type: 'deposit', quantity: Number(row.qty),
        price: row.price === '' ? 0 : Number(row.price), currency: 'EUR', fee: 0, fxEurPerUsd: fx, fromFiat: false, source: 'manual', accountId: id,
        note: 'Solde d’ouverture : ce que tu détenais avant le début du fichier importé',
      });
    }
    setResult(importTransactions(out.txs, { replaceIds, extra }));
  }

  const otherAccounts = accounts.filter((a) => a.id !== account);
  const anyOk = !!(parsed?.ok || parsedExchange?.ok);
  const newAccountLabel = parsedExchange?.exchange === 'generic'
    ? (findPlatform(genericPlatformId)?.name ?? 'Plateforme')
    : parsedExchange?.exchange
      ? EXCHANGE_LABELS[parsedExchange.exchange]
      : 'Crypto.com';
  const footer = result ? (
    <Button variant="primary" onClick={onClose}>Fermer</Button>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      {anyOk && <Button variant="primary" disabled={!preview || preview.txs.length === dupes} onClick={doImport}>{preview && preview.txs.length - dupes > 0 ? `Importer ${preview.txs.length - dupes} transactions` : 'Rien de nouveau à importer'}</Button>}
    </>
  );

  return (
    <Modal open={open} onClose={onClose} wide title="Importer un historique CSV (50 plateformes & DEX)" footer={footer}>
      {result ? (
        <Banner tone="success" title={`${result.added} transaction${result.added > 1 ? 's' : ''} ajoutée${result.added > 1 ? 's' : ''}`}>
          {result.skipped > 0 ? `${result.skipped} déjà présente${result.skipped > 1 ? 's' : ''} (ignorée${result.skipped > 1 ? 's' : ''}, aucun doublon). ` : ''}
          {result.replaced > 0 ? `${result.replaced} de tes saisies manuelles ont été remplacées par les lignes du fichier. ` : ''}
          {result.extra > 0 ? `${result.extra} solde${result.extra > 1 ? 's' : ''} d’ouverture ajouté${result.extra > 1 ? 's' : ''}. ` : ''}
          Ouvre l’onglet « Comptes » pour rapprocher ton journal de la blockchain, puis « Transactions » pour contrôler les lignes importées.
        </Banner>
      ) : !anyOk ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">Détection native pour <b className="text-ink">Crypto.com, Binance, Coinbase, Kraken, Bybit, OKX, Bitget, KuCoin, MEXC, Gate, Bitpanda, Bitvavo, HTX, Bitfinex, Bitstamp, Gemini, BingX, Pionex, WhiteBIT</b> + lecteur <b className="text-ink">CSV universel</b> pour les 50 plateformes centralisées et DEX. Le fichier reste 100 % sur ton appareil.</p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button variant="primary" icon={<FileUp className="size-4" />} onClick={() => fileRef.current?.click()}>Choisir le fichier CSV</Button>
          {fileName && <p className="text-xs text-muted">{fileName}</p>}
          {((parsed && !parsed.ok) || (parsedExchange && !parsedExchange.ok)) && <Banner tone="warn" title="Fichier non reconnu">{parsed?.error ?? parsedExchange?.error}</Banner>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-surface-2 p-3 text-sm text-ink-2">
            <b className="text-ink">{fileName}</b>{parsedExchange?.exchange ? ` · format ${EXCHANGE_LABELS[parsedExchange.exchange]} détecté` : ''} · {parsed ? parsed.rows.length : parsedExchange?.rows.length ?? 0} lignes{parsed?.range ? ` · du ${fmtDate(parsed.range.from)} au ${fmtDate(parsed.range.to)}` : ''} · {activeSymbols.length} cryptos
            {parsed && parsed.invalidRows > 0 && <span className="text-down"> · {parsed.invalidRows} ligne{parsed.invalidRows > 1 ? 's' : ''} illisible{parsed.invalidRows > 1 ? 's' : ''}</span>}
          </div>
          {parsedExchange?.exchange === 'generic' && account === NEW_ACCOUNT && (
            <Field label="Plateforme source (CSV universel)" hint="Choisis la plateforme correspondante pour créer le bon compte.">
              <Select value={genericPlatformId} onChange={(e) => setGenericPlatformId(e.target.value)}>
                <optgroup label="Plateformes centralisées (50)">
                  {CEX_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
                <optgroup label="Plateformes décentralisées (50)">
                  {DEX_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              </Select>
            </Field>
          )}
          <Field label="Compte qui reçoit ces opérations">
            <Select value={account} onChange={(e) => setAccount(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value={NEW_ACCOUNT}>Nouveau compte « {newAccountLabel} »</option>
            </Select>
          </Field>
          {parsed?.ok && (
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
          )}
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
          {matches.length > 0 && (
            <Banner tone="warn" title={`${matches.length} opération${matches.length > 1 ? 's' : ''} que tu avais notée${matches.length > 1 ? 's' : ''} à la main figure${matches.length > 1 ? 'nt' : ''} aussi dans le fichier`}>
              Ce sont les achats ou échanges du panier, du DCA ou de ta saisie (même crypto, même compte, date à un jour près, quantité à 1 % près). Sans remplacement, ils seraient comptés deux fois.
              <div className="mt-2"><Toggle checked={replaceManual} onChange={setReplaceManual} label="Remplacer mes saisies par les lignes du fichier (recommandé)" /></div>
            </Banner>
          )}
          {stock.length > 0 && (
            <div className="rounded-lg border border-line p-3">
              <p className="text-sm font-medium text-ink">{stock.reduce((s, m) => s + m.count, 0)} vente(s) ou retrait(s) sans stock : il manque ce que tu détenais avant ce fichier</p>
              <p className="mt-1 text-xs text-ink-2">Le fichier ne remonte pas assez loin : il vend des cryptos que ton journal ne contient pas encore. Indique ce que tu avais avant (solde d’ouverture), sinon tes quantités, tes coûts d’achat et tes plus-values seront faux. Sans prix d’achat, ces unités comptent pour un coût nul : tes plus-values seront surestimées.</p>
              <ul className="mt-2 divide-y divide-line text-sm">
                {stock.map((m) => {
                  const row = openingRow(m.coinId, m.missing);
                  const set = (patch: Partial<typeof row>) => setOpening({ ...opening, [m.coinId]: { ...row, ...patch } });
                  return (
                    <li key={m.coinId} className="grid items-center gap-2 py-2 sm:grid-cols-[1fr_9rem_9rem_auto]">
                      <span className="text-ink">{m.symbol.toUpperCase()} <span className="text-xs text-muted">manque au moins {fmtQty(m.missing)} ({m.count} vente(s))</span></span>
                      <NumberInput value={row.qty} onChange={(v) => set({ qty: v })} placeholder="Quantité" />
                      <NumberInput value={row.price} onChange={(v) => set({ price: v })} placeholder="Prix d’achat € (facultatif)" />
                      <Toggle checked={row.on} onChange={(v) => set({ on: v })} label="Ajouter" />
                    </li>
                  );
                })}
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
