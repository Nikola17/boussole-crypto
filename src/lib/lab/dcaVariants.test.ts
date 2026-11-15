import { describe, expect, it } from 'vitest';
import { chooseBaseMode, chooseTempTable, type VariantResult } from './dcaVariants';

const v = (id: string, twrPct: number, maxDrawdownPct: number, twrPerYearPct = twrPct / 4): VariantResult => ({ id, twrPct, twrPerYearPct, maxDrawdownPct });

describe('choix des variantes du DCA', () => {
  it('meilleur TWR en contrôle parmi celles dont la baisse ne dépasse pas celle du DCA Bitcoin de plus de 2 points', () => {
    const ref = v('dca-btc', 80, -30);
    const r = chooseBaseMode([v('top3', 60, -35), v('cap', 90, -33), v('btc', 82, -30), v('equal', 120, -45)], ref);
    expect(r).toEqual({ chosen: 'btc', beatsBtc: true }); // « cap » : −33 < −32 ; « equal » : trop risquée
  });
  it('aucune ne bat le DCA Bitcoin : la meilleure admissible est retenue, et on le dit', () => {
    const r = chooseBaseMode([v('top3', 60, -31), v('anchor', 70, -30)], v('dca-btc', 80, -30));
    expect(r).toEqual({ chosen: 'anchor', beatsBtc: false });
  });
  it('table de température changée seulement pour plus de 2 points par an, sans baisse plus forte', () => {
    const cur = v('actuelle', 0, -40, 20);
    expect(chooseTempTable([cur, v('plate', 0, -35, 21.5), v('pentue', 0, -42, 30)], 'actuelle')).toBe('actuelle');
    expect(chooseTempTable([cur, v('plate', 0, -39, 22.5), v('pentue', 0, -40, 23)], 'actuelle')).toBe('pentue');
  });
});
