import { describe, expect, it } from 'vitest';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { deriveAddress, isExtendedKey, isExtendedPrivateKey, parseExtendedKey, scriptForPrefix } from './xpub';
import { parseCsv, parseNumber } from './csv';
import { buildCryptoComTransactions, parseCryptoComCsv, resolveSymbols } from './importers/cryptocom';
import { coveredAccountIds, journalByAccount, journalQty, reconcile } from './accounts';
import { buildPositions } from './portfolio';
import { rulesOf } from './profile';
import type { Account, Transaction } from '../types';

describe('clé publique étendue (vecteurs officiels BIP44/49/84/86)', () => {
  const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const ZPUB = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
  const root = HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC));
  const xpubOf = (path: string) => root.derive(path).publicExtendedKey;

  it('zpub (BIP84) : adresses de réception et de monnaie rendue', () => {
    const hd = parseExtendedKey(ZPUB);
    expect(deriveAddress(hd, 'p2wpkh', 0, 0)).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(deriveAddress(hd, 'p2wpkh', 0, 1)).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
    expect(deriveAddress(hd, 'p2wpkh', 1, 0)).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
  });

  it('xpub : les quatre formats (Legacy, SegWit, Native SegWit, Taproot)', () => {
    expect(deriveAddress(parseExtendedKey(xpubOf("m/44'/0'/0'")), 'p2pkh', 0, 0)).toBe('1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA');
    expect(deriveAddress(parseExtendedKey(xpubOf("m/49'/0'/0'")), 'p2sh-p2wpkh', 0, 0)).toBe('37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf');
    expect(deriveAddress(parseExtendedKey(xpubOf("m/84'/0'/0'")), 'p2wpkh', 0, 0)).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(deriveAddress(parseExtendedKey(xpubOf("m/86'/0'/0'")), 'p2tr', 0, 0)).toBe('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
  });

  it('reconnaît les clés publiques et refuse les clés privées', () => {
    expect(isExtendedKey(ZPUB)).toBe(true);
    expect(isExtendedKey('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')).toBe(false);
    expect(scriptForPrefix(ZPUB)).toBe('p2wpkh');
    expect(scriptForPrefix(xpubOf("m/84'/0'/0'"))).toBeNull();
    const xprv = root.derive("m/84'/0'/0'").privateExtendedKey;
    expect(isExtendedPrivateKey(xprv)).toBe(true);
    expect(isExtendedKey(xprv)).toBe(false);
    expect(() => parseExtendedKey(xprv)).toThrow();
  });
});

describe('lecture CSV', () => {
  it('gère guillemets, virgules, CRLF et BOM', () => {
    const t = parseCsv('﻿a,b,c\r\n1,"x, y",3\r\n"he said ""hi""",5,\r\n');
    expect(t.headers).toEqual(['a', 'b', 'c']);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]).toEqual({ a: '1', b: 'x, y', c: '3' });
    expect(t.rows[1].a).toBe('he said "hi"');
    expect(t.rows[1].c).toBe('');
  });

  it('détecte le point-virgule', () => {
    const t = parseCsv('date;montant\n2025-01-01;12,5\n');
    expect(t.delimiter).toBe(';');
    expect(parseNumber(t.rows[0].montant)).toBeCloseTo(12.5);
  });

  it('parseNumber : formats français, anglais et scientifiques', () => {
    expect(parseNumber('1 234,56')).toBeCloseTo(1234.56);
    expect(parseNumber('1,234.56')).toBeCloseTo(1234.56);
    expect(parseNumber('-0.5')).toBe(-0.5);
    expect(parseNumber('1e-7')).toBeCloseTo(1e-7);
    expect(parseNumber('12,50 €')).toBeCloseTo(12.5);
    expect(parseNumber('')).toBeNaN();
    expect(parseNumber('abc')).toBeNaN();
  });
});

const HEAD = 'Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind,Transaction Hash';
const CSV = [
  HEAD,
  '2025-01-10 09:15:00,Buy BTC,BTC,0.001,,,EUR,90.50,94.10,crypto_purchase,',
  '2025-01-10 09:20:00,EUR -> USDC,USDC,100,,,EUR,92.00,95.68,viban_purchase,',
  '2025-01-12 18:30:12,USDC -> SUI,USDC,-25,SUI,10,EUR,23.10,24.00,crypto_exchange,',
  '2025-01-12 18:30:12,USDC -> SUI,USDC,-25,SUI,10,EUR,23.10,24.00,crypto_exchange,',
  '2025-01-15 10:00:00,Withdraw BTC,BTC,-0.0006,,,EUR,54.00,56.00,crypto_withdrawal,0xabc',
  '2025-01-16 11:00:00,Earn interest,CRO,3,,,EUR,0.30,0.31,crypto_earn_interest_paid,',
  '2025-01-17 12:00:00,Deposit EUR,EUR,200,,,EUR,200,208,viban_deposit,',
  '2025-01-18 12:00:00,Mystery,SUI,1.5,,,EUR,3.00,3.10,weird_kind,',
].join('\n');

const COINS = {
  BTC: { coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
  USDC: { coinId: 'usd-coin', symbol: 'usdc', name: 'USDC' },
  SUI: { coinId: 'sui', symbol: 'sui', name: 'Sui' },
  CRO: { coinId: 'crypto-com-chain', symbol: 'cro', name: 'Cronos' },
};

describe('import du CSV Crypto.com', () => {
  const parsed = parseCryptoComCsv(CSV);
  const opts = { accountId: 'cdc', classByKind: {}, symbols: COINS, depositFrom: 'external', withdrawTo: 'external', fxEurPerUsd: 0.9 };

  it('repère les colonnes, la période, les cryptos et les natures inconnues', () => {
    expect(parsed.ok).toBe(true);
    expect(parsed.rows).toHaveLength(8);
    expect(parsed.range).toEqual({ from: '2025-01-10', to: '2025-01-18' });
    expect(parsed.symbols).toEqual(['BTC', 'CRO', 'SUI', 'USDC']);
    const unknown = parsed.kinds.filter((k) => !k.known);
    expect(unknown.map((k) => k.kind)).toEqual(['weird_kind']);
    expect(unknown[0].defaultClass).toBe('ignore');
  });

  it('refuse un fichier dont les colonnes sont absentes, en citant celles qui ont été lues', () => {
    const bad = parseCryptoComCsv('foo,bar\n1,2\n');
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('foo | bar');
  });

  it('achat en euros : prix = montant payé / quantité, payé en monnaie classique', () => {
    const { txs } = buildCryptoComTransactions(parsed, opts);
    const btc = txs.find((t) => t.symbol === 'btc' && t.type === 'buy')!;
    expect(btc.price).toBeCloseTo(90500, 0);
    expect(btc.currency).toBe('EUR');
    expect(btc.fromFiat).toBe(true);
    expect(btc.fxEurPerUsd).toBeCloseTo(90.5 / 94.1, 4);
    expect(btc.accountId).toBe('cdc');
    expect(btc.time).toBe('2025-01-10T09:15:00Z');
    expect(btc.source).toBe('import');
  });

  it('échange crypto → crypto : une vente et un achat au même montant, neutres fiscalement', () => {
    const { txs } = buildCryptoComTransactions(parsed, opts);
    const swaps = txs.filter((t) => t.id.endsWith('-o') || t.id.endsWith('-i'));
    expect(swaps).toHaveLength(4); // deux lignes identiques : deux échanges
    const out = swaps.find((t) => t.id.endsWith('-o'))!;
    const inn = swaps.find((t) => t.id.endsWith('-i'))!;
    expect(out.type).toBe('sell');
    expect(out.toFiat).toBe(false);
    expect(out.price * out.quantity).toBeCloseTo(23.1);
    expect(inn.type).toBe('buy');
    expect(inn.fromFiat).toBe(false);
    expect(inn.price).toBeCloseTo(2.31);
    expect(inn.price * inn.quantity).toBeCloseTo(23.1);
  });
});

describe('import du CSV Crypto.com (suite)', () => {
  const parsed = parseCryptoComCsv(CSV);
  const opts = { accountId: 'cdc', classByKind: {}, symbols: COINS, depositFrom: 'external', withdrawTo: 'external', fxEurPerUsd: 0.9 };

  it("réimporter le même fichier redonne les mêmes identifiants, les lignes identiques restent distinctes", () => {
    const a = buildCryptoComTransactions(parsed, opts).txs.map((t) => t.id);
    const b = buildCryptoComTransactions(parseCryptoComCsv(CSV), opts).txs.map((t) => t.id);
    expect(b).toEqual(a);
    expect(new Set(a).size).toBe(a.length);
  });

  it("nature inconnue : ignorée par défaut, importée si l'utilisateur la classe", () => {
    const base = buildCryptoComTransactions(parsed, opts).txs;
    expect(base.find((t) => t.note?.includes('weird_kind'))).toBeUndefined();
    const withRule = buildCryptoComTransactions(parsed, { ...opts, classByKind: { weird_kind: 'reward' } }).txs;
    const r = withRule.find((t) => t.note?.includes('weird_kind'))!;
    expect(r.type).toBe('reward');
    expect(r.quantity).toBe(1.5);
  });

  it("retrait vers ton Ledger = transfert (le coût d'acquisition suit), sinon retrait", () => {
    const asTransfer = buildCryptoComTransactions(parsed, { ...opts, withdrawTo: 'ledger' }).txs.find((t) => t.symbol === 'btc' && t.type === 'transfer')!;
    expect(asTransfer.accountId).toBe('cdc');
    expect(asTransfer.toAccountId).toBe('ledger');
    expect(buildCryptoComTransactions(parsed, opts).txs.find((t) => t.symbol === 'btc' && t.type === 'withdraw')).toBeDefined();
  });

  it('récompenses et opérations en monnaie classique', () => {
    const { txs, skipped } = buildCryptoComTransactions(parsed, opts);
    expect(txs.find((t) => t.symbol === 'cro')!.type).toBe('reward');
    expect(skipped.some((s) => s.reason.startsWith('Opérations ignorées'))).toBe(true);
  });

  it('signale les cryptos non reconnues sans les importer', () => {
    const { txs, skipped } = buildCryptoComTransactions(parsed, { ...opts, symbols: { ...COINS, SUI: null } });
    expect(txs.some((t) => t.symbol === 'sui')).toBe(false);
    expect(skipped.some((s) => s.reason.includes('SUI'))).toBe(true);
  });

  it("les positions issues de l'import sont cohérentes", () => {
    const pos = buildPositions(buildCryptoComTransactions(parsed, opts).txs);
    expect(pos.get('bitcoin')!.quantity).toBeCloseTo(0.001 - 0.0006, 8);
    expect(pos.get('sui')!.quantity).toBeCloseTo(20, 8); // 2 échanges de 10
    expect(pos.get('usd-coin')!.quantity).toBeCloseTo(100 - 50, 8);
  });

  it('résout les tickers : exceptions connues puis meilleur rang', () => {
    const markets = [
      { id: 'sui', symbol: 'sui', name: 'Sui', market_cap_rank: 40 },
      { id: 'fake-sui', symbol: 'sui', name: 'Fake Sui', market_cap_rank: 900 },
      { id: 'foo', symbol: 'foo', name: 'Foo', market_cap_rank: 120 },
      { id: 'bar', symbol: 'foo', name: 'Bar', market_cap_rank: 80 },
    ];
    const r = resolveSymbols(['SUI', 'FOO', 'ZZZ', 'BTC'], markets);
    expect(r.resolved.SUI.coinId).toBe('sui');
    expect(r.resolved.FOO.coinId).toBe('bar');
    expect(r.resolved.BTC.coinId).toBe('bitcoin'); // table d'exceptions, même hors de la liste
    expect(r.unresolved).toEqual(['ZZZ']);
  });
});

describe('import d\'un fichier qui ne donne que la date (historique reconstitué)', () => {
  const dateOnly = [
    HEAD,
    '2026-08-01,Bought USDC,USDC,150,,,EUR,131.43,150,viban_purchase,pdf-1',
    '2026-08-01,USDC -> BTC,USDC,-150,BTC,0.0023254,EUR,130.06,150,crypto_exchange,pdf-2',
  ].join('\n');
  const opts = { accountId: 'cdc', classByKind: {}, symbols: COINS, depositFrom: 'external', withdrawTo: 'external', fxEurPerUsd: 0.9 };

  it("lit la date sans inventer d'heure, et conserve l'ordre du fichier dans la journée", () => {
    const parsed = parseCryptoComCsv(dateOnly);
    expect(parsed.rows.map((r) => r.hasTime)).toEqual([false, false]);
    const { txs } = buildCryptoComTransactions(parsed, opts);
    expect(txs.every((t) => t.time === undefined && t.date === '2026-08-01')).toBe(true);
    // l'achat d'USDC reste avant l'échange : sans cela, la position USDC passerait sous zéro
    expect(txs.map((t) => t.symbol)).toEqual(['usdc', 'usdc', 'btc']);
    expect(buildPositions(txs).get('usd-coin')?.quantity).toBeCloseTo(0, 6);
  });

  it("un fichier avec les heures les conserve (mesure des écarts de prix)", () => {
    const { txs } = buildCryptoComTransactions(parseCryptoComCsv(CSV), opts);
    expect(txs.some((t) => t.time === '2025-01-10T09:15:00Z')).toBe(true);
  });
});

function tx(p: Partial<Transaction> & { id: string; type: Transaction['type']; coinId: string; quantity: number }): Transaction {
  return { symbol: p.coinId.slice(0, 3), name: p.coinId, date: '2025-01-01', price: 100, currency: 'EUR', fee: 0, fxEurPerUsd: 0.9, ...p };
}

describe('comptes et transferts', () => {
  const txs: Transaction[] = [
    tx({ id: '1', type: 'buy', coinId: 'bitcoin', quantity: 1, price: 100, accountId: 'cdc', date: '2025-01-01', fromFiat: true }),
    tx({ id: '2', type: 'buy', coinId: 'bitcoin', quantity: 1, price: 200, accountId: 'cdc', date: '2025-01-02', fromFiat: true }),
    tx({ id: '3', type: 'transfer', coinId: 'bitcoin', quantity: 1.5, accountId: 'cdc', toAccountId: 'ledger', date: '2025-01-03' }),
    tx({ id: '4', type: 'buy', coinId: 'ethereum', quantity: 2, accountId: 'cdc', date: '2025-01-03' }),
  ];

  it("un transfert ne change ni la quantité ni le coût d'acquisition de la position", () => {
    const p = buildPositions(txs).get('bitcoin')!;
    expect(p.quantity).toBeCloseTo(2);
    expect(p.costEur).toBeCloseTo(300);
    expect(p.realizedEur).toBe(0);
  });

  it("quantités par compte d'après le journal", () => {
    const j = journalByAccount(txs);
    expect(journalQty(j, 'cdc', 'bitcoin')).toBeCloseTo(0.5);
    expect(journalQty(j, 'ledger', 'bitcoin')).toBeCloseTo(1.5);
    expect(journalQty(j, 'ledger', 'ethereum')).toBe(0);
  });

  it("un compte n'est « couvert » par la blockchain que si tous ses wallets sont lus et inclus", () => {
    const accounts: Account[] = [
      { id: 'ledger', name: 'Ledger', kind: 'hardware', walletIds: ['w1', 'w2'], createdAt: '' },
      { id: 'cdc', name: 'Crypto.com', kind: 'exchange', walletIds: [], createdAt: '' },
    ];
    const wallets = [{ id: 'w1', includeInTotal: true }, { id: 'w2', includeInTotal: true }];
    expect(coveredAccountIds(accounts, wallets, [true, true])).toEqual(['ledger']);
    expect(coveredAccountIds(accounts, wallets, [true, false])).toEqual([]); // un wallet n'est pas lu
    expect(coveredAccountIds(accounts, [{ id: 'w1', includeInTotal: true }, { id: 'w2', includeInTotal: false }], [true, true])).toEqual([]);
    expect(coveredAccountIds(accounts, [{ id: 'w1', includeInTotal: true }], [true])).toEqual([]); // wallet supprimé
  });

  it('rapprochement journal / blockchain avec tolérance de 0,5 %', () => {
    const r = reconcile(
      new Map([['bitcoin', 1.5], ['ethereum', 0.4]]),
      new Map([['bitcoin', 1.4999], ['ethereum', 0.3], ['solana', 2]]),
      new Map([['bitcoin', 'BTC'], ['ethereum', 'ETH'], ['solana', 'SOL']]),
    );
    const by = Object.fromEntries(r.map((l) => [l.symbol, l]));
    expect(by.BTC.ok).toBe(true);
    expect(by.ETH.ok).toBe(false);
    expect(by.ETH.gap).toBeCloseTo(0.1);
    expect(by.SOL.gap).toBeCloseTo(-2);
  });
});

describe('règles de profil', () => {
  it("complète les règles manquantes d'un profil enregistré avant leur ajout", () => {
    const old = { archetype: 'Équilibré' as const, rules: { maxPerGemPct: 3, maxPerAltPct: 8, cashReservePct: 10, riskPerTradePct: 1 } } as never;
    const r = rulesOf(old);
    expect(r.maxPerGemPct).toBe(3); // la valeur choisie est conservée
    expect(r.maxLines).toBe(12);
    expect(r.minLinePct).toBe(1);
    expect(r.maxDiscoveryLines).toBe(5);
  });
});
