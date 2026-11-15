import { describe, expect, it } from 'vitest';
import { summarizeAnalysis } from './context';
import { analyze } from '../lib/signals';

describe('ce qui part vers l’IA', () => {
  it('chaque signal arrive avec sa fiabilité mesurée', () => {
    const cs = Array.from({ length: 300 }, (_, i) => { const close = 100 + Math.sin(i / 5) * 3; /* sans tendance : ni excès ni euphorie */ return { time: 1_700_000_000 + i * 86400, open: close, high: close * 1.01, low: close * 0.99, close, volume: 1000 }; });
    const s = summarizeAnalysis(analyze(cs, { temperature: 30 }, { closedOnly: true }))!;
    expect(s.signalInvestisseur.libelle).toBe('Accumuler');
    expect(s.signalInvestisseur.fiabilite).toMatch(/^Depuis 20\d\d : vu \d+ fois|Pas assez|Fiabilité non mesurée/);
    expect(s.signalTrader.fiabilite).toBeTruthy();
  });
});
