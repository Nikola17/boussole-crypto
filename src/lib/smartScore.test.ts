import { describe, expect, it } from 'vitest';
import { addMoves, judgeMoves, movesFromEvents, scoreLine, scoreWallet, SMART_MOVES_MAX } from './smartScore';
import type { SmartEvent } from './smartmoney';
import type { SmartMove } from '../types';

const mv = (i: number, side: 'buy' | 'sell' = 'buy', priceUsd = 100): SmartMove => ({
  id: `m${i}`, walletId: 'w1', coinId: 'pepe', symbol: 'pepe', side, priceUsd, at: new Date(Date.UTC(2026, 0, 1) + i * 3600_000).toISOString(),
});

describe('wallets suivis notés', () => {
  it('300 mouvements au plus, les plus anciens retirés, sans doublon', () => {
    const existing = Array.from({ length: 299 }, (_, i) => mv(i));
    const out = addMoves(existing, [mv(5), mv(299), mv(300)]);
    expect(SMART_MOVES_MAX).toBe(300);
    expect(out).toHaveLength(300);
    expect(new Set(out.map((m) => m.id)).size).toBe(300);
    expect(out.some((m) => m.id === 'm0')).toBe(false); // le plus ancien est sorti
    expect(out.some((m) => m.id === 'm300')).toBe(true);
    expect(addMoves([], [mv(1), mv(2)], 1).map((m) => m.id)).toEqual(['m2']);
  });
  it('achat gagnant si hausse, vente gagnante si baisse évitée, prix inconnu non jugé', () => {
    const moves = [mv(1, 'buy', 100), mv(2, 'sell', 100), mv(3, 'buy', 100)];
    const later: Record<string, Record<number, number | null>> = {
      m1: { 7: 110, 30: 90 },  // achat : gagnant à 7 j, perdant à 30 j
      m2: { 7: 105, 30: 80 },  // vente : perdante à 7 j, gagnante à 30 j
      m3: { 7: null, 30: null }, // prix inconnu
    };
    const s = scoreWallet(moves, (m, d) => later[m.id][d] ?? null);
    expect(s).toEqual({ followed: 3, wins7: 1, wins30: 1, judged30: 2, unfavorable: false });
    expect(scoreLine(s)).toBe('3 mouvements suivis, 1 gagnant à 30 jours');
  });
  it('historique défavorable : 3 gagnants sur 10 jugés', () => {
    const moves = Array.from({ length: 10 }, (_, i) => mv(i));
    const s = scoreWallet(moves, (m, d) => (d === 30 ? (Number(m.id.slice(1)) < 3 ? 120 : 80) : null));
    expect(s.judged30).toBe(10);
    expect(s.wins30).toBe(3);
    expect(s.unfavorable).toBe(true);
    expect(scoreLine(s)).toBe('10 mouvements suivis, 3 gagnants à 30 jours · historique défavorable');
    // 9 jugés seulement : pas encore de mention
    expect(scoreWallet(moves.slice(0, 9), (_m, d) => (d === 30 ? 80 : null)).unfavorable).toBe(false);
  });
  it('les mouvements d’un token au prix connu entrent dans le suivi', () => {
    const e = (mint: string, side: 'buy' | 'sell'): SmartEvent => ({ walletId: 'w1', walletLabel: 'W', chain: 'solana', side, mint, symbol: 'X', name: null, uiAmount: 1, txHash: `tx-${mint}`, atMs: Date.UTC(2026, 10, 1) });
    const out = movesFromEvents([e('AbC', 'buy'), e('zzz', 'sell')], new Map([['abc', 0.5]]));
    expect(out).toEqual([{ id: 'sm:w1:tx-AbC:AbC', walletId: 'w1', chain: 'solana', mint: 'AbC', symbol: 'X', side: 'buy', priceUsd: 0.5, at: '2026-11-01T00:00:00.000Z' }]);
  });
  it('rejugé à 7 puis 30 jours avec le prix du moment ; prix introuvable après 2 jours de plus : non jugé', () => {
    const at = Date.UTC(2026, 10, 1);
    const base = { ...mv(1, 'buy', 1), at: new Date(at).toISOString(), mint: 'abc', chain: 'solana' };
    const d = (n: number) => at + n * 86400_000;
    expect(judgeMoves([base], d(6), () => 2).changed).toBe(0);
    const j7 = judgeMoves([base], d(7), () => 2);
    expect(j7.moves[0].p7).toBe(2);
    expect(j7.moves[0].p30).toBeUndefined();
    const j30 = judgeMoves(j7.moves, d(31), () => 3);
    expect(j30.moves[0]).toMatchObject({ p7: 2, p30: 3 });
    expect(judgeMoves([base], d(8), () => null).changed).toBe(0); // on réessaie
    expect(judgeMoves([base], d(10), () => null).moves[0].p7).toBe(0); // abandon : 0 = non jugé
    expect(judgeMoves([base], d(40), () => 5).moves[0]).toMatchObject({ p7: 0, p30: 0 }); // relevé trop tardif
    expect(scoreWallet(j30.moves, (m, n) => (n === 7 ? m.p7 ?? null : m.p30 ?? null)).wins30).toBe(1);
  });
});
