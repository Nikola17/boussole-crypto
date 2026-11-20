import { describe, expect, it } from 'vitest';
import { buildRegimeSeries, detectRegime } from './regime';
import type { Candle } from '../indicators';

const D = 86400;
const T0 = Date.UTC(2024, 0, 1) / 1000;

function series(fn: (i: number) => number, n = 260): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = Math.max(1, fn(i));
    return { time: T0 + i * D, open: c * 0.995, high: c * 1.012, low: c * 0.988, close: c, volume: 1000 };
  });
}

describe('détecteur de régime de marché', () => {
  it('identifie BULL_TREND sur une tendance haussière régulière', () => {
    const bull = series((i) => 100 + i * 0.8);
    const r = detectRegime(bull, 50);
    expect(r?.regime).toBe('BULL_TREND');
    expect(r!.btcTrendScore).toBeGreaterThan(50);
  });

  it('identifie BEAR_TREND sur une tendance baissière soutenue', () => {
    const bear = series((i) => 400 - i * 1.1);
    const r = detectRegime(bear, 45);
    expect(r?.regime).toBe('BEAR_TREND');
    expect(r!.btcTrendScore).toBeLessThan(-40);
  });

  it('identifie RANGE_CHOP sur un marché plat oscillant', () => {
    const flat = series((i) => 100 + Math.sin(i / 4) * 2);
    const r = detectRegime(flat, 50);
    expect(r?.regime).toBe('RANGE_CHOP');
  });

  it('bascule immédiatement en EXTREME_STRESS en euphorie/capitulation extrême', () => {
    const bull = series((i) => 100 + i * 0.8);
    const prev = detectRegime(bull, 50)!;
    expect(detectRegime(bull, 88, prev)?.regime).toBe('EXTREME_STRESS');
    expect(detectRegime(bull, 12, prev)?.regime).toBe('EXTREME_STRESS');
  });

  it('applique l’hystérésis 3 jours avant de changer de tendance vers range', () => {
    const bull = series((i) => 100 + i * 0.8);
    const flat = series((i) => 100 + Math.sin(i / 4) * 2);
    const p0 = detectRegime(bull, 50)!;
    const p1 = detectRegime(flat, 50, p0)!;
    expect(p1.regime).toBe('BULL_TREND');
    expect(p1.pendingCount).toBe(1);
    const p2 = detectRegime(flat, 50, p1)!;
    expect(p2.regime).toBe('BULL_TREND');
    expect(p2.pendingCount).toBe(2);
    const p3 = detectRegime(flat, 50, p2)!;
    expect(p3.regime).toBe('RANGE_CHOP');
  });

  it('buildRegimeSeries est causale et produit un instantané par jour après chauffe', () => {
    const bull = series((i) => 100 + i * 0.8, 250);
    const m = buildRegimeSeries(bull, () => 50);
    expect(m.size).toBeGreaterThan(180);
    const lastDay = new Date(bull[bull.length - 1].time * 1000).toISOString().slice(0, 10);
    expect(m.get(lastDay)?.regime).toBe('BULL_TREND');
  });
});
