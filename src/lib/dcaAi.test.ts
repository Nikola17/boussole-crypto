// DCA × IA : l'IA affine l'ordre des règles sans jamais en sortir.
import { describe, expect, it } from 'vitest';
import { applyDcaAiAdvice, dcaAiPayload, parseDcaAiReply, type PoolCoin } from './dcaAi';
import type { PlannedOrder } from './basket';

const order = (id: string, sym: string, kind: PlannedOrder['kind'], usd: number): PlannedOrder => ({ coinId: id, symbol: sym, name: id, usd, kind, reason: 'règle' });
const pool = (id: string, sym: string, side: PoolCoin['side'], score = 10): PoolCoin => ({ coinId: id, symbol: sym, name: id, side, score, rank: 5, change7d: 2 });

const ORDERS = [order('solana', 'sol', 'core', 8), order('chainlink', 'link', 'core', 8), order('rune', 'rune', 'discovery', 9)];
const POOL = [pool('avalanche-2', 'avax', 'core'), pool('near', 'near', 'core'), pool('gem-x', 'gemx', 'discovery'), ...ORDERS.map((o) => pool(o.coinId, o.symbol, o.kind))];

describe('parseDcaAiReply', () => {
  it('lit décisions, remplaçante, confiance bornée, synthèse et risque', () => {
    const a = parseDcaAiReply({ ordres: [{ jeton: 'sol', decision: 'Remplacer', par: 'avax', confiance: 9, raison: 'mise à jour réseau' }, { jeton: 'LINK', decision: 'garder' }], synthese: 'ok', risque_principal: 'volatilité' })!;
    expect(a.decisions[0]).toEqual({ symbol: 'SOL', decision: 'remplacer', by: 'AVAX', confidence: 5, reason: 'mise à jour réseau' });
    expect(a.decisions[1].decision).toBe('garder');
    expect(a.summary).toBe('ok');
    expect(a.mainRisk).toBe('volatilité');
  });
  it('« remplacer » sans remplaçante vaut « garder » ; réponse vide : null', () => {
    expect(parseDcaAiReply({ ordres: [{ jeton: 'SOL', decision: 'remplacer' }] })!.decisions[0].decision).toBe('garder');
    expect(parseDcaAiReply(null)).toBeNull();
    expect(parseDcaAiReply({ ordres: 'x' })).toBeNull();
  });
});

describe('applyDcaAiAdvice', () => {
  it('remplace par une candidate autorisée du même côté, montant inchangé', () => {
    const r = applyDcaAiAdvice(ORDERS, { decisions: [{ symbol: 'SOL', decision: 'remplacer', by: 'AVAX', confidence: 4, reason: 'catalyseur' }], summary: '', mainRisk: '' }, POOL);
    expect(r.orders[0]).toMatchObject({ coinId: 'avalanche-2', usd: 8, kind: 'core' });
    expect(r.changes).toEqual([{ from: 'SOL', to: 'AVAX', reason: 'catalyseur', confidence: 4 }]);
    expect(r.rejected).toEqual([]);
  });
  it('refuse une crypto hors liste, un autre côté, un doublon ou une confiance trop faible', () => {
    const r = applyDcaAiAdvice(ORDERS, {
      decisions: [
        { symbol: 'SOL', decision: 'remplacer', by: 'PEPE', confidence: 5, reason: '' },
        { symbol: 'LINK', decision: 'remplacer', by: 'GEMX', confidence: 5, reason: '' },
        { symbol: 'RUNE', decision: 'remplacer', by: 'RUNE', confidence: 5, reason: '' },
        { symbol: 'SOL', decision: 'remplacer', by: 'NEAR', confidence: 2, reason: '' },
      ],
      summary: '', mainRisk: '',
    }, POOL);
    expect(r.orders.map((o) => o.coinId)).toEqual(['solana', 'chainlink', 'rune']);
    expect(r.rejected).toHaveLength(4);
    expect(r.rejected.join(' ')).toMatch(/hors de la liste/);
    expect(r.rejected.join(' ')).toMatch(/même côté/);
    expect(r.rejected.join(' ')).toMatch(/déjà dans l’ordre/);
    expect(r.rejected.join(' ')).toMatch(/confiance trop faible/);
  });
  it('le total investi ne bouge jamais', () => {
    const r = applyDcaAiAdvice(ORDERS, { decisions: [{ symbol: 'SOL', decision: 'remplacer', by: 'NEAR', confidence: 3, reason: '' }, { symbol: 'RUNE', decision: 'remplacer', by: 'GEMX', confidence: 5, reason: '' }], summary: '', mainRisk: '' }, POOL);
    expect(r.orders.reduce((s, o) => s + o.usd, 0)).toBe(25);
    expect(r.changes).toHaveLength(2);
  });
});

describe('dcaAiPayload', () => {
  it('donne l’ordre, les alternatives autorisées et le marché', () => {
    const p = dcaAiPayload({ orders: ORDERS, pool: POOL, temperature: 41.6, fearGreed: 30, notes: ['n'] }) as { ordre: unknown[]; alternativesAutorisees: { jeton: string; cote: string }[]; marche: { temperature: number } };
    expect(p.ordre).toHaveLength(3);
    expect(p.alternativesAutorisees.find((a) => a.jeton === 'GEMX')?.cote).toBe('decouverte');
    expect(p.marche.temperature).toBe(42);
  });
});
