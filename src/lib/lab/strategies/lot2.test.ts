// Tests des 7 nouvelles stratégies actives (Lot 2) et du tick multi-créneaux (Lot 1).
import { describe, expect, it } from 'vitest';
import { STRATEGIES, rulesFingerprint } from './index';
import { meanReversion } from './meanReversion';
import { rotationMomentum } from './rotationMomentum';
import { trendDonchian } from './trendDonchian';
import { swing4h } from './swing4h';
import { gridAuto } from './gridAuto';
import { fundingContrarian } from './fundingContrarian';
import { pairsArb } from './pairsArb';
import { tickAutopilot, type AutopilotSources } from '../autopilot';
import { newAutopilot } from '../autopilotFactory';
import { computeAssetMetrics } from '../features';
import type { Candle } from '../../indicators';
import type { RegimeSnapshot } from '../regime';
import type { Position, StrategyContext, UniverseEntry } from '../types';

const D = 86400;
const H = 3600;
const T0 = Date.UTC(2024, 6, 1) / 1000;

const bullSeries = (n = 250, slope = 0.5, base = 100): Candle[] =>
  Array.from({ length: n }, (_, i) => {
    const close = base + i * slope + Math.sin(i / 4) * 1.5;
    return { time: T0 + i * D, open: close * 0.996, high: close * 1.015, low: close * 0.985, close, volume: 10_000_000 };
  });

const bullRegime: RegimeSnapshot = {
  day: '2025-03-01', regime: 'BULL_TREND', confidence: 0.85, btcTrendScore: 80, adx14: 28, volAnnualizedPct: 45, temperature: 50, daysInRegime: 10,
};
const bearRegime: RegimeSnapshot = {
  day: '2025-03-01', regime: 'BEAR_TREND', confidence: 0.85, btcTrendScore: -75, adx14: 30, volAnnualizedPct: 60, temperature: 35, daysInRegime: 10,
};

function makeCtx(series: Record<string, Candle[]>, over: {
  regime?: RegimeSnapshot | null;
  execDay?: string;
  positions?: Position[];
  funding?: Record<string, number>;
  candles4h?: Record<string, Candle[]>;
} = {}): StrategyContext {
  const execDay = over.execDay ?? '2025-03-03'; // lundi
  const dow = ((new Date(`${execDay}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const btc = series.bitcoin ?? bullSeries();
  const uni: UniverseEntry[] = Object.keys(series).map((id, i) => ({ coinId: id, symbol: id.slice(0, 4), name: id, rank: i + 1, available: true }));
  return {
    decidedOn: '2025-03-02', execDay, scheduled: (days) => days.includes(dow), universe: uni,
    candles: (id) => series[id] ?? [],
    candles4h: over.candles4h ? (id) => over.candles4h![id] ?? [] : undefined,
    fundingAt: over.funding ? (id) => over.funding![id] ?? null : undefined,
    temperature: 50, btcAboveSma200: true,
    regime: over.regime === undefined ? bullRegime : over.regime,
    metrics: (id) => computeAssetMetrics(series[id] ?? [], btc, over.funding?.[id] ?? null),
    portfolio: {
      cashUsd: 1000, equityUsd: 1000, peakEquityUsd: 1000, minSincePeakUsd: 1000,
      positions: over.positions ?? [], lastFillOn: () => null,
    },
  };
}

describe('registre & stratégies Lot 2', () => {
  it('toutes les 14 stratégies sont enregistrées avec une empreinte unique', () => {
    const ids = Object.keys(STRATEGIES);
    expect(ids).toHaveLength(14);
    const fps = new Set(Object.values(STRATEGIES).map((s) => rulesFingerprint(s)));
    expect(fps.size).toBe(14);
  });

  it('mean-reversion-daily : entre par ordre limite maker sur un repli brutal en tendance haussière, bloqué en bear', () => {
    const sol = bullSeries(240, 0.6);
    // 3 bougies rouges violentes en fin de série (toujours > MM200) → RSI(2) très bas
    const n = sol.length;
    sol[n - 3] = { ...sol[n - 3], close: sol[n - 4].close * 0.96, low: sol[n - 4].close * 0.95 };
    sol[n - 2] = { ...sol[n - 2], close: sol[n - 3].close * 0.96, low: sol[n - 3].close * 0.95 };
    sol[n - 1] = { ...sol[n - 1], close: sol[n - 2].close * 0.95, low: sol[n - 2].close * 0.94 };
    const orders = meanReversion.decide(makeCtx({ bitcoin: bullSeries(240, 0.4), solana: sol }), meanReversion.defaults);
    expect(orders.some((o) => o.coinId === 'solana' && o.side === 'buy' && o.orderType === 'limit')).toBe(true);
    // En BEAR_TREND : aucun achat
    const bearOrders = meanReversion.decide(makeCtx({ bitcoin: bullSeries(240, 0.4), solana: sol }, { regime: bearRegime }), meanReversion.defaults);
    expect(bearOrders.filter((o) => o.side === 'buy')).toHaveLength(0);
  });

  it('rotation-momentum : achète les leaders le lundi et passe 100 % USDC en BEAR_TREND', () => {
    const realistic = (slope: number) => Array.from({ length: 150 }, (_, i): Candle => {
      const close = 100 + i * slope + Math.sin(i / 2) * 8;
      return { time: T0 + i * D, open: close * 0.995, high: close * 1.02, low: close * 0.98, close, volume: 10_000_000 };
    });
    const series = { bitcoin: realistic(0.3), solana: realistic(1.0), avalanche: realistic(0.7) };
    const orders = rotationMomentum.decide(makeCtx(series, { execDay: '2025-03-03' }), rotationMomentum.defaults);
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => o.side === 'buy')).toBe(true);
    const held: Position[] = [{ coinId: 'solana', symbol: 'sol', name: 'Solana', quantity: 2, costUsd: 500, openedOn: '2025-02-01' }];
    const exits = rotationMomentum.decide(makeCtx(series, { regime: bearRegime, positions: held, execDay: '2025-03-04' }), rotationMomentum.defaults);
    expect(exits).toEqual([expect.objectContaining({ coinId: 'solana', side: 'sell', fraction: 1, tag: 'bear-cash' })]);
  });

  it('trend-donchian-vol : entre sur cassure 20 j avec ADX fort, TP1 partiel et trailing stop ATR', () => {
    const s = bullSeries(120, 0.8);
    const last = s[s.length - 1];
    s[s.length - 1] = { ...last, close: last.close * 1.12, high: last.close * 1.13, volume: 30_000_000 };
    const orders = trendDonchian.decide(makeCtx({ bitcoin: bullSeries(120, 0.4), solana: s }), trendDonchian.defaults);
    const buy = orders.find((o) => o.coinId === 'solana' && o.side === 'buy');
    expect(buy).toBeDefined();
    expect(buy?.tpLegs?.[0]).toMatchObject({ rMultiple: 2, fraction: 0.3, moveStopToBe: true });
    expect(buy?.trailing?.mode).toBe('atr');
  });

  it('swing-4h-multi : entre sur cassure 4H avec TP1 + trailing et tourne sur 4 créneaux/jour', async () => {
    const b4h = Array.from({ length: 100 }, (_, i): Candle => {
      const c = 100 + i * 0.5;
      return { time: T0 + i * 4 * H, open: c * 0.996, high: c * 1.01, low: c * 0.99, close: c, volume: 1_000_000 };
    });
    b4h[b4h.length - 1] = { ...b4h[b4h.length - 1], close: b4h[b4h.length - 1].close * 1.07, high: b4h[b4h.length - 1].close * 1.08, volume: 3_000_000 };
    const orders = swing4h.decide(makeCtx({ bitcoin: bullSeries(120, 0.4), solana: bullSeries(120, 0.6) }, { candles4h: { bitcoin: b4h.slice(0, 99), solana: b4h } }), swing4h.defaults);
    expect(orders.some((o) => o.coinId === 'solana' && o.side === 'buy' && o.tpLegs?.length === 1 && !!o.trailing)).toBe(true);

    // Vérifie le multi-créneaux dans tickAutopilot (8 h, 12 h, 16 h, 20 h)
    const p = newAutopilot({ strategyId: 'swing-4h-multi', name: 'Swing 4H', startingUsd: 1000, params: swing4h.defaults, costs: { preset: 'exchange', feePct: 0.1, spreadPct: 0.05 } }, Date.parse('2025-03-01T10:00:00Z'));
    expect(p.executionHours).toEqual([8, 12, 16, 20]);
    const src: AutopilotSources = {
      daily: async () => bullSeries(120, 0.4),
      hourly: async (_id, fromMs, toMs) => {
        const out: Candle[] = [];
        for (let t = Math.floor(fromMs / 3600_000) * 3600; t * 1000 < toMs; t += 3600) out.push({ time: t, open: 150, high: 151, low: 149, close: 150, volume: 100 });
        return out;
      },
      candles4h: async () => b4h,
      temperatureAt: () => 50,
      universe: async () => [{ coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', rank: 1, available: true }],
      live: async () => null,
    };
    const r = await tickAutopilot(p, [], Date.parse('2025-03-02T17:30:00Z'), src, 'test');
    // À 17h30 UTC = 18h30 Paris : créneaux 8h, 12h et 16h traités, 20h pas encore !
    expect(r.portfolio.cursorSlot).toBe('2025-03-02@16');
  });

  it('grid-auto : achète sur repli vers le bas de bande et vend sur rebond vers le haut', () => {
    const cs = bullSeries(50, 0, 100);
    // Prix recule nettement sous la MM20 → achat limite
    const lowCs = [...cs.slice(0, -1), { ...cs[cs.length - 1], close: 94, low: 93 }];
    const buyOrders = gridAuto.decide(makeCtx({ bitcoin: lowCs }), { ...gridAuto.defaults, coins: ['bitcoin'] });
    expect(buyOrders.some((o) => o.side === 'buy' && o.orderType === 'limit' && o.tag === 'grid-buy')).toBe(true);
    // Prix remonte au-dessus de la MM20 avec position ouverte → vente partielle
    const highCs = [...cs.slice(0, -1), { ...cs[cs.length - 1], close: 106, high: 107 }];
    const sellOrders = gridAuto.decide(makeCtx({ bitcoin: highCs }, { positions: [{ coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', quantity: 2.5, costUsd: 250, openedOn: '2025-02-20' }] }), { ...gridAuto.defaults, coins: ['bitcoin'] });
    expect(sellOrders.some((o) => o.side === 'sell' && o.tag === 'grid-sell')).toBe(true);
  });

  it('funding-contrarian : entre sur funding très négatif + bougie verte et sort sur surchauffe funding', () => {
    const s = bullSeries(60, -1.2, 200);
    const n = s.length;
    s[n - 1] = { ...s[n - 1], open: s[n - 2].close * 0.99, close: s[n - 2].close * 1.02 }; // bougie verte de rebond
    const entries = fundingContrarian.decide(makeCtx({ bitcoin: bullSeries(60, 0.2), solana: s }, { funding: { solana: -0.0003 } }), fundingContrarian.defaults);
    expect(entries.some((o) => o.coinId === 'solana' && o.side === 'buy' && o.tag === 'funding-entry')).toBe(true);
    const exits = fundingContrarian.decide(makeCtx({ bitcoin: bullSeries(60, 0.2), solana: s }, {
      funding: { solana: 0.0004 },
      positions: [{ coinId: 'solana', symbol: 'sol', name: 'Solana', quantity: 1, costUsd: 100, openedOn: '2025-02-25' }],
    }), fundingContrarian.defaults);
    expect(exits).toEqual([expect.objectContaining({ coinId: 'solana', side: 'sell', tag: 'funding-hot' })]);
  });

  it('pairs-arb-stat : achète ETH quand le ratio ETH/BTC plonge (Z < −1,8) avec forte corrélation', () => {
    const btc = Array.from({ length: 80 }, (_, i): Candle => {
      const c = 100 + Math.sin(i / 2) * 8 + i * 0.2;
      return { time: T0 + i * D, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1e7 };
    });
    const eth = btc.map((b, i) => {
      const factor = i === btc.length - 1 ? 0.044 : 0.05; // chute brutale du ratio le dernier jour
      const c = b.close * factor;
      return { ...b, open: c, high: c * 1.01, low: c * 0.99, close: c };
    });
    const orders = pairsArb.decide(makeCtx({ bitcoin: btc, ethereum: eth }), pairsArb.defaults);
    expect(orders.some((o) => o.coinId === 'ethereum' && o.side === 'buy' && o.tag === 'pair:eth-btc')).toBe(true);
  });
});
