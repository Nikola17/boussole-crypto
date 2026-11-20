// « Arbitrage Statistique Paires (Z-Score) » : suit 4 couples corrélés majeurs (ETH/BTC, SOL/ETH, LINK/ETH, BNB/BTC).
// Calcule chaque jour le Z-score 30 j du ratio de prix A/B : quand A est anormalement décoté face à B (Z < −1,8,
// avec corrélation ≥ 0,65), achète la jambe A ; sort dès retour à la moyenne (Z ≥ 0), sur rupture structurelle
// (Z < −3,5) ou après 20 jours. Actif même en marché neutre ou baissier !

import { rollingCorrelation, zScore } from '../../indicators';
import type { Intent, Strategy } from '../types';

export type PairsArbParams = {
  zEntry: number;
  zExit: number;
  zStop: number;
  minCorr: number;
  allocPerPairPct: number;
  maxHoldDays: number;
};

interface PairDef {
  a: { coinId: string; symbol: string; name: string };
  b: { coinId: string; symbol: string; name: string };
}

const PAIRS: PairDef[] = [
  { a: { coinId: 'ethereum', symbol: 'eth', name: 'Ethereum' }, b: { coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin' } },
  { a: { coinId: 'solana', symbol: 'sol', name: 'Solana' }, b: { coinId: 'ethereum', symbol: 'eth', name: 'Ethereum' } },
  { a: { coinId: 'chainlink', symbol: 'link', name: 'Chainlink' }, b: { coinId: 'ethereum', symbol: 'eth', name: 'Ethereum' } },
  { a: { coinId: 'binancecoin', symbol: 'bnb', name: 'BNB' }, b: { coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin' } },
];

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

function ratioStats(aCloses: number[], bCloses: number[]): { z: number; corr: number } | null {
  const n = Math.min(aCloses.length, bCloses.length);
  if (n < 65) return null;
  const a = aCloses.slice(-n);
  const b = bCloses.slice(-n);
  const ratios: number[] = [];
  for (let i = 0; i < n; i++) {
    if (a[i] > 0 && b[i] > 0) ratios.push(a[i] / b[i]);
  }
  if (ratios.length < 35) return null;
  const z = zScore(ratios, 30);
  const corr = rollingCorrelation(a, b, 60);
  if (!Number.isFinite(z) || !Number.isFinite(corr)) return null;
  return { z, corr };
}

export const pairsArb: Strategy<PairsArbParams> = {
  id: 'pairs-arb-stat',
  version: 1,
  label: 'Arbitrage Statistique (Z-Score)',
  describe: 'Surveille les ratios ETH/BTC, SOL/ETH, LINK/ETH et BNB/BTC (Z-score 30 j) : achète la crypto statistiquement décotée face à son pair (Z < −1,8) et prend profit au retour à l’équilibre (Z ≥ 0).',
  defaults: { zEntry: -1.8, zExit: 0, zStop: -3.5, minCorr: 0.65, allocPerPairPct: 24, maxHoldDays: 20 },
  uses: [],
  replayable: true,
  universeTop: 30,
  riskOverlay: { maxHeatPct: 6, maxHighCorrPositions: 4, drawdownScaling: true },
  kind: 'trades',
  deposit: () => 0,
  decide: (ctx, p) => {
    const out: Intent[] = [];
    const pf = ctx.portfolio;
    const held = new Map(pf.positions.map((x) => [x.coinId, x]));
    let cash = pf.cashUsd;

    const candlesOf = (coinId: string, sym: string) => {
      const c1 = ctx.candles(coinId);
      if (c1.length) return c1;
      return ctx.candles(sym.toUpperCase());
    };

    for (const pair of PAIRS) {
      const ca = candlesOf(pair.a.coinId, pair.a.symbol);
      const cb = candlesOf(pair.b.coinId, pair.b.symbol);
      const st = ratioStats(ca.map((c) => c.close), cb.map((c) => c.close));
      const posA = held.get(pair.a.coinId);

      // 1. Sortie si retour à la moyenne, rupture de corrélation ou durée max
      if (posA) {
        if (st && st.z >= p.zExit) {
          out.push({ coinId: posA.coinId, symbol: posA.symbol, name: posA.name, side: 'sell', fraction: 1, tag: 'pair-revert', reason: `Ratio ${pair.a.symbol.toUpperCase()}/${pair.b.symbol.toUpperCase()} revenu à l’équilibre (Z = ${st.z.toFixed(2).replace('.', ',')})` });
          continue;
        }
        if (st && st.z <= p.zStop) {
          out.push({ coinId: posA.coinId, symbol: posA.symbol, name: posA.name, side: 'sell', fraction: 1, tag: 'stop', reason: `Divergence extrême ${pair.a.symbol.toUpperCase()}/${pair.b.symbol.toUpperCase()} (Z = ${st.z.toFixed(2).replace('.', ',')}) : stop` });
          continue;
        }
        if (daysBetween(posA.openedOn, ctx.execDay) >= p.maxHoldDays) {
          out.push({ coinId: posA.coinId, symbol: posA.symbol, name: posA.name, side: 'sell', fraction: 1, tag: 'time-exit', reason: `Arbitrage paire : durée max atteinte (${p.maxHoldDays} j)` });
        }
        continue;
      }

      // 2. Entrée quand A est statistiquement décoté face à B (et paire toujours corrélée)
      if (!st || st.corr < p.minCorr || st.z > p.zEntry || cash < 10) continue;
      const priceA = ca[ca.length - 1].close;
      const usd = Math.min((pf.equityUsd * p.allocPerPairPct) / 100, cash);
      if (usd < 10) continue;
      out.push({
        coinId: pair.a.coinId, symbol: pair.a.symbol, name: pair.a.name, side: 'buy',
        sizing: { usd },
        stop: priceA * 0.9,
        stopOnClose: true,
        tag: `pair:${pair.a.symbol}-${pair.b.symbol}`,
        reason: `${pair.a.symbol.toUpperCase()}/${pair.b.symbol.toUpperCase()} décoté (Z = ${st.z.toFixed(2).replace('.', ',')}, corr ${st.corr.toFixed(2).replace('.', ',')})`,
      });
      cash -= usd;
    }

    return out;
  },
};
