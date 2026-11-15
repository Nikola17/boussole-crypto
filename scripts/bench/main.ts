// Banc d'essai en ligne de commande : `npm run bench -- <commande>`.
//   signals                 étude de tous les signaux → docs/bench/<date>-signaux-v<N>.md + src/data/reliability.json
//   strategies              chaque stratégie du registre sur l'historique → rapport + src/data/strategies-bench.json
//   compare <a> <b>         deux stratégies côte à côte (identifiants du registre, paramètres par défaut)

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDaily, loadFng, loadMvrv } from './fetch';
import { reliabilityTable, r4, signalsReport, strategiesReport, type RunInfo, type StrategiesBench, type StrategyRun } from './report';
import type { Candle } from '../../src/lib/indicators';
import { buildAssets, UNIVERSE_SYMBOLS, type Asset } from '../../src/lib/lab/universe';
import { temperatureSeries } from '../../src/lib/lab/replayTemp';
import { studySignals } from '../../src/lib/lab/events';
import { simulate } from '../../src/lib/lab/sim';
import { annualize, closedTrades, maxDrawdownPct, referenceDcaBtc, referenceHoldBtc, rollingWindows, tradeStatsOf, twr } from '../../src/lib/lab/metrics';
import { STRATEGIES, rulesFingerprint } from '../../src/lib/lab/strategies';
import { COSTS } from '../../src/lib/lab/types';
import { SIGNALS_VERSION } from '../../src/lib/signals';

const FROM = '2019-01-01';
const today = new Date().toISOString().slice(0, 10);
const log = (m: string) => process.stderr.write(`${m}\n`);

async function loadData(): Promise<{ assets: Asset[]; btc: Asset; temperature: Map<string, number>; notes: string[]; dataThrough: string }> {
  const raw = new Map<string, Candle[]>();
  const notes: string[] = [];
  for (const s of UNIVERSE_SYMBOLS) {
    const c = await loadDaily(s);
    if (c?.length) raw.set(s, c); else notes.push(`${s} : pas de paire USDT, ignorée.`);
  }
  log(`${raw.size} séries chargées.`);
  const { assets, notes: n2 } = buildAssets(raw);
  const btc = assets.find((a) => a.id === 'BTC');
  if (!btc) throw new Error('Bitcoin introuvable dans les données.');
  const temperature = temperatureSeries(btc.candles, await loadFng(), await loadMvrv());
  const dataThrough = new Date(btc.candles[btc.candles.length - 1].time * 1000).toISOString().slice(0, 10);
  return { assets, btc, temperature, notes: [...notes, ...n2], dataThrough };
}

async function cmdSignals(): Promise<void> {
  const d = await loadData();
  const t0 = Date.now();
  const study = studySignals({ assets: d.assets, btc: d.btc, temperature: d.temperature, top: 50, from: FROM, onProgress: (k, n) => { if (k % 250 === 0) log(`  ${k}/${n} jours`); } });
  log(`Étude terminée en ${Math.round((Date.now() - t0) / 1000)} s.`);
  const info: RunInfo = { day: today, dataThrough: study.dataThrough, assets: d.assets.length, from: FROM, top: 50, observations: study.observations, notes: d.notes };
  const file = join('docs', 'bench', `${today}-signaux-v${SIGNALS_VERSION}.md`);
  writeFileSync(file, signalsReport(study.keys, info, SIGNALS_VERSION));
  writeFileSync(join('src', 'data', 'reliability.json'), `${JSON.stringify(reliabilityTable(study.keys, info, SIGNALS_VERSION), null, 2)}\n`);
  log(`Écrit : ${file} et src/data/reliability.json`);
}

function runStrategy(id: string, d: Awaited<ReturnType<typeof loadData>>): { rules: string; runs: StrategyRun[] } {
  const s = STRATEGIES[id];
  const runs: StrategyRun[] = [];
  for (const fill of ['nextOpen', 'nextClose'] as const) {
    for (const costs of ['exchange', 'app'] as const) {
      const start = s.kind === 'trades' ? 1000 : 0;
      const r = simulate(s, s.defaults, { assets: d.assets, temperature: d.temperature, btcId: 'BTC' }, { startCashUsd: start, costs: COSTS[costs], fill, from: FROM, to: d.dataThrough, minOrderUsd: 5 });
      const series = r.series.filter((p, i) => i > 0 || p.valueUsd > 0);
      const flows = r.series.filter((p) => p.flowUsd > 0).map((p) => ({ day: p.day, usd: p.flowUsd }));
      const ref = s.kind === 'trades' ? referenceHoldBtc(start, FROM, d.dataThrough, d.btc.candles, COSTS[costs]) : referenceDcaBtc(flows, d.btc.candles, COSTS[costs]);
      const total = twr(series);
      const st = tradeStatsOf(closedTrades(r.fills));
      const windows: StrategyRun['windows'] = {};
      for (const L of [30, 60, 90, 180, 365] as const) {
        const w = rollingWindows(series, L);
        if (w) windows[String(L) as '30'] = { p10: r4(w.p10)!, p50: r4(w.p50)!, p90: r4(w.p90)! };
      }
      runs.push({
        fill, costs, twrPct: r4(total * 100)!, twrPerYearPct: r4(annualize(total, series.length) * 100)!, maxDrawdownPct: r4(maxDrawdownPct(series))!,
        referenceTwrPct: r4(twr(ref) * 100)!, trades: st.n, expectancyR: r4(st.expectancyR), windows,
      });
    }
  }
  return { rules: rulesFingerprint(s), runs };
}

async function cmdStrategies(ids: string[]): Promise<void> {
  const d = await loadData();
  const bench: StrategiesBench = { generatedAt: today, dataThrough: d.dataThrough, entries: {} };
  for (const id of ids) {
    log(`Simulation : ${id}…`);
    bench.entries[id] = runStrategy(id, d);
  }
  const info: RunInfo = { day: today, dataThrough: d.dataThrough, assets: d.assets.length, from: FROM, top: 20, observations: 0, notes: d.notes };
  const labels = Object.fromEntries(Object.values(STRATEGIES).map((s) => [s.id, s.label]));
  const report = strategiesReport(bench, info, labels);
  if (ids.length === Object.keys(STRATEGIES).length) {
    writeFileSync(join('docs', 'bench', `${today}-strategies.md`), report);
    writeFileSync(join('src', 'data', 'strategies-bench.json'), `${JSON.stringify(bench, null, 2)}\n`);
    log('Écrit : rapport des stratégies et src/data/strategies-bench.json');
  } else process.stdout.write(report);
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'signals') return cmdSignals();
  if (cmd === 'strategies') return cmdStrategies(Object.keys(STRATEGIES));
  if (cmd === 'compare') {
    const unknown = args.filter((a) => !STRATEGIES[a]);
    if (args.length !== 2 || unknown.length) throw new Error(`Usage : compare <a> <b> parmi ${Object.keys(STRATEGIES).join(', ')}`);
    return cmdStrategies(args);
  }
  throw new Error('Commandes : signals, strategies, compare <a> <b>');
}

main().catch((e) => { log(`Erreur : ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
