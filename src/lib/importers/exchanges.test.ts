import { describe, expect, it } from 'vitest';
import { buildExchangeTransactions, detectExchangeCsv, parseExchangeCsv } from './exchanges';

describe('importeurs CSV multi-plateformes (Binance, Kraken, Coinbase)', () => {
  it('détecte et parse un export Binance Spot', () => {
    const csv = [
      'Date(UTC),Pair,Side,Price,Executed,Amount,Fee',
      '2026-10-05 08:12:00,SOLUSDC,BUY,200.5,2.5,501.25,0.5',
      '2026-10-12 16:00:00,BTCEUR,SELL,82000,0.01,820,0.82',
    ].join('\n');
    expect(detectExchangeCsv(csv)).toBe('binance');
    const p = parseExchangeCsv(csv);
    expect(p.ok).toBe(true);
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0]).toMatchObject({ symbol: 'SOL', type: 'buy', quantity: 2.5, unitPrice: 200.5, currency: 'USD' });
    expect(p.rows[1]).toMatchObject({ symbol: 'BTC', type: 'sell', currency: 'EUR', toFiat: true });
    const txs = buildExchangeTransactions(p, { accountId: 'acc1', symbols: {}, fxEurPerUsd: 0.92 });
    expect(txs[0].coinId).toBe('solana');
    expect(txs[1].coinId).toBe('bitcoin');
  });

  it('détecte et parse un export Kraken Ledger', () => {
    const csv = [
      'txid,refid,time,type,subtype,aclass,asset,amount,fee,balance',
      'TX1,R1,2026-09-01 10:00:00,trade,,currency,XXBT,0.05,0.0001,0.05',
      'TX2,R2,2026-09-02 10:00:00,staking,,currency,XETH.S,0.01,0,0.01',
    ].join('\n');
    expect(detectExchangeCsv(csv)).toBe('kraken');
    const p = parseExchangeCsv(csv);
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0]).toMatchObject({ symbol: 'BTC', type: 'buy', quantity: 0.05 });
    expect(p.rows[1]).toMatchObject({ symbol: 'ETH', type: 'reward', quantity: 0.01 });
  });

  it('détecte et parse un export Coinbase avec lignes de préambule', () => {
    const csv = [
      'Transactions',
      'User,Nico',
      'Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total,Fees and/or Spread,Notes',
      '2026-11-01T09:00:00Z,Buy,ETH,0.5,EUR,2900,1450,1460,10,Achat',
    ].join('\n');
    expect(detectExchangeCsv(csv)).toBe('coinbase');
    const p = parseExchangeCsv(csv);
    expect(p.ok).toBe(true);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ symbol: 'ETH', type: 'buy', quantity: 0.5, unitPrice: 2900, currency: 'EUR', fee: 10 });
  });

  it('détecte et parse Bybit, OKX, Bitpanda, Bitvavo, KuCoin et le lecteur CSV universel', () => {
    const bybit = [
      'Spot Pairs,Direction,Filled Price,Filled Quantity,Timestamp',
      'BTC/USDT,Buy,92000,0.02,2026-11-10 12:00:00',
    ].join('\n');
    expect(detectExchangeCsv(bybit)).toBe('bybit');
    expect(parseExchangeCsv(bybit).rows[0]).toMatchObject({ symbol: 'BTC', type: 'buy', quantity: 0.02, unitPrice: 92000 });

    const okx = [
      'InstId,Side,Filled Price,Filled Amount,Time',
      'SOL-USDT,sell,210,5,2026-11-11 10:00:00',
    ].join('\n');
    expect(detectExchangeCsv(okx)).toBe('okx');
    expect(parseExchangeCsv(okx).rows[0]).toMatchObject({ symbol: 'SOL', type: 'sell', quantity: 5, unitPrice: 210 });

    const bitpanda = [
      'Transaction ID,Timestamp,Transaction Type,In/Out,Amount Fiat,Fiat,Amount Asset,Asset,Asset market price,Fee',
      'BP1,2026-11-05T14:00:00Z,buy,incoming,500,EUR,0.005,BTC,100000,7.5',
    ].join('\n');
    expect(detectExchangeCsv(bitpanda)).toBe('bitpanda');
    expect(parseExchangeCsv(bitpanda).rows[0]).toMatchObject({ symbol: 'BTC', type: 'buy', quantity: 0.005, currency: 'EUR', fee: 7.5 });

    const bitvavo = [
      'Timezone,Date,Time,Type,Currency,Amount,Quote Currency,Quote Price,Received / Paid Currency,Received / Paid Amount,Fee currency,Fee amount',
      'Europe/Amsterdam,2026-11-06,09:30:00,buy,ETH,1.2,EUR,3000,EUR,-3600,EUR,9',
    ].join('\n');
    expect(detectExchangeCsv(bitvavo)).toBe('bitvavo');
    expect(parseExchangeCsv(bitvavo).rows[0]).toMatchObject({ symbol: 'ETH', type: 'buy', quantity: 1.2, currency: 'EUR', fee: 9 });

    const generic = [
      'Date,Side,Pair,Quantity,Price,Fee',
      '2026-11-15,buy,HYPE/USDC,10,25,0.25',
    ].join('\n');
    expect(detectExchangeCsv(generic)).toBe('generic');
    expect(parseExchangeCsv(generic).rows[0]).toMatchObject({ symbol: 'HYPE', type: 'buy', quantity: 10, unitPrice: 25, fee: 0.25 });

    // Ne doit jamais capturer un export Crypto.com natif
    const cdc = 'Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind\n';
    expect(detectExchangeCsv(cdc)).toBeNull();
  });
});
