// Walk-Forward Optimization & Evaluation (WFO) : découpe l'historique en fenêtres glissantes
// [Train 540 j] → [Embargo 14 j] → [Test OOS 180 j] pour mesurer la robustesse hors-échantillon (WFE).

import { addDays } from '../../src/lib/lab/clock';
import { annualize, calmarRatio, closedTrades, maxDrawdownPct, sharpeRatio, sortinoRatio, tradeStatsOf, twr } from '../../src/lib/lab/metrics';
import { runMonteCarlo, type MonteCarloResult } from '../../src/lib/lab/montecarlo';
import { simulate, type SimData } from '../../src/lib/lab/sim';
import { COSTS, type ParamValue, type Strategy } from '../../src/lib/lab/types';

export interface WfoFold {
  fold: number;
  trainFrom: string;
  trainTo: string;
  testFrom: string;
  testTo: string;
  trainAnnPct: number;
  testAnnPct: number;
  testMaxDdPct: number;
  testSharpe: number | null;
  testTrades: number;
}

export interface WfoReport {
  strategyId: string;
  folds: WfoFold[];
  /** Walk-Forward Efficiency = rendement annualisé OOS moyen / rendement annualisé Train moyen. */
  wfe: number | null;
  avgOosAnnPct: number;
  avgOosSharpe: number | null;
  avgOosCalmar: number | null;
  monteCarlo: MonteCarloResult | null;
}

export function runWalkForward(
  s: Strategy<Record<string, ParamValue>>,
  data: SimData,
  from: string,
  to: string,
  opts: { trainDays?: number; embargoDays?: number; testDays?: number } = {},
): WfoReport {
  const trainDays = opts.trainDays ?? 540;
  const embargoDays = opts.embargoDays ?? 14;
  const testDays = opts.testDays ?? 180;
  const startCash = s.kind === 'trades' ? 1000 : 0;

  const folds: WfoFold[] = [];
  const allOosFills = [];
  const calmars: number[] = [];
  let cursor = from;
  let fold = 1;

  while (true) {
    const trainFrom = cursor;
    const trainTo = addDays(trainFrom, trainDays);
    const testFrom = addDays(trainTo, embargoDays);
    const testTo = addDays(testFrom, testDays);
    if (testFrom >= to) break;
    const boundedTestTo = testTo > to ? to : testTo;

    const tr = simulate(s, s.defaults, data, { startCashUsd: startCash, costs: COSTS.exchange, fill: 'nextOpen', from: trainFrom, to: trainTo, minOrderUsd: 5 });
    const te = simulate(s, s.defaults, data, { startCashUsd: startCash, costs: COSTS.exchange, fill: 'nextOpen', from: testFrom, to: boundedTestTo, minOrderUsd: 5 });
    const trSeries = tr.series.filter((p, i) => i > 0 || p.valueUsd > 0);
    const teSeries = te.series.filter((p, i) => i > 0 || p.valueUsd > 0);
    const trainAnnPct = trSeries.length > 5 ? annualize(twr(trSeries), trSeries.length) * 100 : 0;
    const testAnnPct = teSeries.length > 5 ? annualize(twr(teSeries), teSeries.length) * 100 : 0;
    const testMaxDdPct = teSeries.length > 1 ? maxDrawdownPct(teSeries) : 0;
    const testSharpe = sharpeRatio(teSeries);
    const cal = calmarRatio(teSeries);
    if (cal != null) calmars.push(cal);
    allOosFills.push(...te.fills);

    folds.push({
      fold, trainFrom, trainTo, testFrom, testTo: boundedTestTo,
      trainAnnPct, testAnnPct, testMaxDdPct, testSharpe,
      testTrades: tradeStatsOf(closedTrades(te.fills)).n,
    });

    cursor = addDays(cursor, testDays);
    fold++;
  }

  const avgTrain = folds.length ? folds.reduce((sum, f) => sum + f.trainAnnPct, 0) / folds.length : 0;
  const avgOosAnnPct = folds.length ? folds.reduce((sum, f) => sum + f.testAnnPct, 0) / folds.length : 0;
  const sharpes = folds.map((f) => f.testSharpe).filter((x): x is number => x != null);
  const wfe = Math.abs(avgTrain) > 1 ? avgOosAnnPct / avgTrain : null;
  const monteCarlo = runMonteCarlo(closedTrades(allOosFills), { seed: `wfo:${s.id}` });

  return {
    strategyId: s.id,
    folds,
    wfe,
    avgOosAnnPct,
    avgOosSharpe: sharpes.length ? sharpes.reduce((a, b) => a + b, 0) / sharpes.length : null,
    avgOosCalmar: calmars.length ? calmars.reduce((a, b) => a + b, 0) / calmars.length : null,
    monteCarlo,
  };
}

export function formatWfoMarkdown(r: WfoReport): string {
  const f1 = (x: number | null) => (x != null && Number.isFinite(x) ? x.toFixed(1).replace('.', ',') : '—');
  const f2 = (x: number | null) => (x != null && Number.isFinite(x) ? x.toFixed(2).replace('.', ',') : '—');
  const lines = [
    `# Walk-Forward Optimization — ${r.strategyId}`,
    '',
    `- **Fenêtres OOS** : ${r.folds.length}`,
    `- **Rendement annualisé OOS moyen** : ${f1(r.avgOosAnnPct)} %`,
    `- **Walk-Forward Efficiency (WFE)** : ${f2(r.wfe)}`,
    `- **Sharpe OOS moyen** : ${f2(r.avgOosSharpe)} · **Calmar OOS moyen** : ${f2(r.avgOosCalmar)}`,
  ];
  if (r.monteCarlo) {
    lines.push(`- **Monte Carlo (${r.monteCarlo.draws} tirages sur ${r.monteCarlo.tradesSample} trades OOS)** : médiane ${f1(r.monteCarlo.p50Pct)} %, P5 ${f1(r.monteCarlo.p5Pct)} %, P95 drawdown ${f1(r.monteCarlo.mddP95Pct)} %, prob. positif ${f1(r.monteCarlo.probPositivePct)} %`);
  }
  lines.push('', '| Fold | Train | Test OOS | Train/an | Test OOS/an | Max DD OOS | Sharpe OOS | Trades |', '|---|---|---|---|---|---|---|---|');
  for (const x of r.folds) {
    lines.push(`| ${x.fold} | ${x.trainFrom} → ${x.trainTo} | ${x.testFrom} → ${x.testTo} | ${f1(x.trainAnnPct)} % | ${f1(x.testAnnPct)} % | ${f1(x.testMaxDdPct)} % | ${f2(x.testSharpe)} | ${x.testTrades} |`);
  }
  return `${lines.join('\n')}\n`;
}

export { sortinoRatio };
