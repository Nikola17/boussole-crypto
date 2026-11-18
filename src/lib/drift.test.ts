import { describe, expect, it } from 'vitest';
import { driftNotices } from './drift';
import type { ProfileRules } from '../types';

const rules: ProfileRules = { maxPerGemPct: 3, maxPerAltPct: 5, cashReservePct: 5, riskPerTradePct: 1, maxLines: 12, minLinePct: 1, maxDiscoveryLines: 5 };
const target = { btc: 65, eth: 20, large: 6, mid: 4, small: 5, stable: 0 };

describe('driftNotices', () => {
  it('ne dit rien quand tout est proche de la cible', () => {
    const alloc = { btc: 650, eth: 200, large: 60, mid: 40, small: 50, stable: 0 };
    const n = driftNotices({ alloc, target, lines: [{ symbol: 'BTC', bucket: 'btc', value: 650 }], rules, euphoria: false });
    expect(n).toEqual([]);
  });

  it('signale un excès de cœur comme « orienter le DCA » hors euphorie, pas comme une vente', () => {
    const alloc = { btc: 900, eth: 0, large: 0, mid: 0, small: 100, stable: 0 };
    const n = driftNotices({ alloc, target, lines: [], rules, euphoria: false });
    const btc = n.find((x) => x.key === 'b:btc');
    expect(btc).toBeDefined();
    expect(btc!.tone).toBe('neutral');
    expect(btc!.detail).toContain('DCA');
  });

  it('autorise l’allègement du cœur en euphorie', () => {
    const alloc = { btc: 900, eth: 0, large: 0, mid: 0, small: 100, stable: 0 };
    const n = driftNotices({ alloc, target, lines: [], rules, euphoria: true });
    expect(n.find((x) => x.key === 'b:btc')!.tone).toBe('down');
  });

  it('signale une ligne au-dessus de la limite et les poussières à regrouper', () => {
    const alloc = { btc: 600, eth: 200, large: 100, mid: 0, small: 100, stable: 0 };
    const lines = [
      { symbol: 'BTC', bucket: 'btc' as const, value: 600 },
      { symbol: 'ETH', bucket: 'eth' as const, value: 200 },
      { symbol: 'SOL', bucket: 'large' as const, value: 100 },
      { symbol: 'PEPE', bucket: 'small' as const, value: 100 },
      { symbol: 'DUST1', bucket: 'small' as const, value: 2 },
      { symbol: 'DUST2', bucket: 'mid' as const, value: 1 },
    ];
    const n = driftNotices({ alloc, target, lines, rules, euphoria: false });
    const pepe = n.find((x) => x.key === 'l:PEPE');
    expect(pepe).toBeDefined();
    expect(pepe!.tone).toBe('warn');
    const dust = n.find((x) => x.key === 'dust');
    expect(dust).toBeDefined();
    expect(dust!.title).toContain('2 lignes');
    expect(dust!.detail).toContain('DUST1');
  });

  it('retourne [] sans portefeuille', () => {
    expect(driftNotices({ alloc: { btc: 0, eth: 0, large: 0, mid: 0, small: 0, stable: 0 }, target, lines: [], rules, euphoria: false })).toEqual([]);
  });
});
