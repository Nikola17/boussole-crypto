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
});
