// Banc d'essai en ligne de commande : `npm run bench -- <commande>`.
//   signals                 étude de tous les signaux → docs/bench/<date>-signaux-v<N>.md + src/data/reliability.json
//   strategies              chaque stratégie du registre sur l'historique → rapport + src/data/strategies-bench.json
//   compare <a> <b>         deux stratégies côte à côte (identifiants du registre, paramètres par défaut)
//   dca-variants            bases du panier et tables de température (lot 5) → docs/bench/<date>-dca-variantes.md

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDaily, loadFng, loadMvrv } from './fetch';
import { candidatesReport, reliabilityTable, r4, signalsReport, strategiesReport, type RunInfo, type StrategiesBench, type StrategyRun } from './report';
import { existsSync, readFileSync } from 'node:fs';
import { CANDIDATES, candidateExtractor } from '../../src/lib/lab/candidates';
import { appendJournal, consistencyPct, JOURNAL_HEADER } from '../../src/lib/lab/journal';
import type { Candle } from '../../src/lib/indicators';
import { buildAssets, UNIVERSE_SYMBOLS, type Asset } from '../../src/lib/lab/universe';
import { temperatureSeries } from '../../src/lib/lab/replayTemp';
import { studySignals } from '../../src/lib/lab/events';
import { simulate } from '../../src/lib/lab/sim';
import { annualize, closedTrades, maxDrawdownPct, referenceDcaBtc, referenceHoldBtc, rollingWindows, tradeStatsOf, twr } from '../../src/lib/lab/metrics';
import { STRATEGIES, rulesFingerprint } from '../../src/lib/lab/strategies';
import { COSTS, type ParamValue } from '../../src/lib/lab/types';
import { BASE_MODES, BASE_MODE_LABEL, DEFAULT_ANCHOR_PCT, type BaseMode } from '../../src/lib/autoBasket';
import { TEMP_TABLES, type TempTable } from '../../src/lib/dca';
import { chooseBaseMode, chooseTempTable, type VariantResult } from '../../src/lib/lab/dcaVariants';
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

const CONTROL_FROM = '2023-01-01';
const fr1 = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1).replace('.', ',')}`;

/** Une stratégie sous un jeu de paramètres, période complète et contrôle, dans un mode d'exécution. */
function variantRun(id: string, params: Record<string, ParamValue>, fill: 'nextOpen' | 'nextClose', d: Awaited<ReturnType<typeof loadData>>): { full: VariantResult; control: VariantResult } {
  const s = STRATEGIES[id];
  const r = simulate(s, { ...s.defaults, ...params }, { assets: d.assets, temperature: d.temperature, btcId: 'BTC' }, { startCashUsd: 0, costs: COSTS.exchange, fill, from: FROM, to: d.dataThrough, minOrderUsd: 5 });
  const series = r.series.filter((p, i) => i > 0 || p.valueUsd > 0);
  const ctl = series.filter((p) => p.day >= CONTROL_FROM);
  const res = (xs: typeof series, label: string): VariantResult => ({ id: label, twrPct: twr(xs) * 100, twrPerYearPct: annualize(twr(xs), xs.length) * 100, maxDrawdownPct: maxDrawdownPct(xs) });
  return { full: res(series, id), control: res(ctl, id) };
}

async function cmdDcaVariants(): Promise<void> {
  const d = await loadData();
  const lines: string[] = [];
  const decisions: Record<string, { base: ReturnType<typeof chooseBaseMode>; table: string; chosenTwr: number; refTwr: number; top3Twr: number; controlTwr: Record<string, number> }> = {};
  const row = (label: string, x: { full: VariantResult; control: VariantResult }) =>
    `| ${label} | ${fr1(x.control.twrPct)} % | ${fr1(x.control.twrPerYearPct)} % | ${fr1(x.control.maxDrawdownPct)} % | ${fr1(x.full.twrPct)} % | ${fr1(x.full.maxDrawdownPct)} % |`;
  const head = '| Variante | TWR contrôle | par an | Pire baisse contrôle | TWR 2019-… | Pire baisse 2019-… |\n|---|---|---|---|---|---|';
  for (const fill of ['nextOpen', 'nextClose'] as const) {
    log(`Mode ${fill} : DCA Bitcoin simple…`);
    const ref = variantRun('dca-btc', {}, fill, d);
    const bases: { mode: BaseMode; run: ReturnType<typeof variantRun> }[] = [];
    for (const mode of BASE_MODES) {
      log(`  base « ${mode} »…`);
      bases.push({ mode, run: variantRun('dca-boussole', { baseMode: mode, anchorPct: DEFAULT_ANCHOR_PCT }, fill, d) });
    }
    const tables: { t: TempTable; run: ReturnType<typeof variantRun> }[] = [];
    for (const t of Object.keys(TEMP_TABLES) as TempTable[]) {
      log(`  table « ${t} »…`);
      tables.push({ t, run: variantRun('investisseur', { multTable: t }, fill, d) });
    }
    const base = chooseBaseMode(bases.map((b) => ({ ...b.run.control, id: b.mode })), ref.control);
    const table = chooseTempTable(tables.map((x) => ({ ...x.run.control, id: x.t })), 'actuelle');
    const twrOf = (m: string | null) => bases.find((b) => b.mode === m)?.run.control.twrPct ?? NaN;
    decisions[fill] = { base, table, chosenTwr: twrOf(base.chosen), refTwr: ref.control.twrPct, top3Twr: twrOf('top3'), controlTwr: Object.fromEntries(bases.map((b) => [b.mode, r4(b.run.control.twrPct)!])) };
    lines.push(`## Exécution ${fill === 'nextOpen' ? 'à l’ouverture suivante' : 'à la clôture suivante'}`, '', '### Base du panier (DCA Boussole, base seule, 25 $ mardi et vendredi, température et réserve)', '', head,
      row('DCA Bitcoin simple (référence)', ref), ...bases.map((b) => row(`${BASE_MODE_LABEL[b.mode]} (\`${b.mode}\`)`, b.run)), '',
      `Retenue : **${base.chosen ? BASE_MODE_LABEL[base.chosen as BaseMode] : 'aucune'}**${base.beatsBtc ? ' (bat le DCA Bitcoin simple)' : ' (ne bat pas le DCA Bitcoin simple)'}.`, '',
      '### Multiplicateurs de température (Investisseur : Bitcoin et Ethereum 75/25, réserve)', '', head,
      ...tables.map((x) => row(`${x.t} [${TEMP_TABLES[x.t].join(' ; ')}]`, x.run)), '', `Retenue : **${table}**.`, '');
  }
  const o = decisions.nextOpen;
  const c = decisions.nextClose;
  const agree = o.base.chosen === c.base.chosen;
  const chosen = o.base.chosen as BaseMode | null;
  const conclusion = [
    `# Variantes du DCA (${today})`, '',
    'Fiche de conception, 12.1. Simulations du banc d’essai de 2019 à ' + d.dataThrough + ', frais d’une plateforme d’échange (0,10 % + 0,05 % d’écart). Décision sur la période de contrôle (à partir du 01/01/2023) : meilleur TWR sans pire baisse supérieure de plus de 2 points à celle du DCA Bitcoin simple ; table de température changée seulement pour plus de 2 points de TWR annualisé sans pire baisse plus forte.', '',
    '## Conclusion', '',
    `- **Base du panier retenue : ${chosen ? `${BASE_MODE_LABEL[chosen]} (\`${chosen}\`)` : 'aucune'}**${agree ? ', dans les deux modes d’exécution' : ` à l’ouverture suivante (le mode des autopilotes) ; à la clôture suivante : ${c.base.chosen ?? 'aucune'}`}.`,
    `- ${o.base.beatsBtc ? `Elle bat le DCA Bitcoin simple en contrôle : ${fr1(o.chosenTwr)} % contre ${fr1(o.refTwr)} %${Math.abs(o.chosenTwr - o.refTwr) < 1 ? ', un écart négligeable : elle fait jeu égal' : ''}.` : 'Aucune variante ne bat le DCA Bitcoin simple en contrôle : l’éditeur du panier le dit, et l’option « Ancre Bitcoin et Ethereum » (70 % de la base) est activée par défaut pour les nouveaux paniers.'}`,
    `- La règle actuelle des paniers existants (trois meilleurs scores) fait ${fr1(o.top3Twr)} % en contrôle : les paniers existants ne changent pas d’office, une bannière propose la règle retenue.`,
    `- **Table de température : ${o.table === 'actuelle' && c.table === 'actuelle' ? 'inchangée' : `« ${o.table} » à l’ouverture, « ${c.table} » à la clôture`}**.`,
    '- Limite : la règle « capitalisation » est pondérée par le volume médian sur 30 jours (pas de capitalisation historique gratuite) ; l’application en direct utilise la vraie capitalisation.', '',
  ];
  const file = join('docs', 'bench', `${today}-dca-variantes.md`);
  writeFileSync(file, [...conclusion, ...lines].join('\n'));
  // Données embarquées : règle par défaut des nouveaux paniers et bannière des paniers existants (TWR en contrôle, ouverture suivante).
  const data = { generatedAt: today, dataThrough: d.dataThrough, controlFrom: CONTROL_FROM, chosen, beatsBtc: o.base.beatsBtc, table: o.table, controlTwrPct: o.controlTwr, dcaBtcTwrPct: r4(o.refTwr) };
  writeFileSync(join('src', 'data', 'dca-variants.json'), `${JSON.stringify(data, null, 2)}\n`);
  log(`Écrit : ${file} et src/data/dca-variants.json`);
}

async function cmdCandidates(control: boolean, only: string[] | null, period = 'contrôle', range: { from?: string; to?: string } = {}): Promise<void> {
  const d = await loadData();
  const metas = only ? CANDIDATES.filter((c) => only.includes(c.key)) : CANDIDATES;
  if (only && metas.length !== only.length) throw new Error(`Candidats inconnus : ${only.filter((k) => !CANDIDATES.some((c) => c.key === k)).join(', ')}`);
  const study = studySignals({ assets: d.assets, btc: d.btc, temperature: d.temperature, top: 50, from: range.from ?? FROM, to: range.to, extractors: [candidateExtractor], metas, onProgress: (k, n) => { if (k % 500 === 0) log(`  ${k}/${n} jours`); } });
  const info: RunInfo = { day: today, dataThrough: study.dataThrough, assets: d.assets.length, from: FROM, top: 50, observations: study.observations, notes: d.notes };
  const bias = new Map(CANDIDATES.map((c) => [c.key, c.bias]));
  const consistency = (key: string) => consistencyPct(study.byAsset[key] ?? [], bias.get(key) ?? 'neutral');
  const file = join('docs', 'bench', `${today}-candidats-${control ? 'controle' : 'reglage'}${only ? '-retenus' : ''}${range.from ? `-${range.from.slice(0, 4)}` : ''}.md`);
  writeFileSync(file, candidatesReport(study.keys, study.byAsset, consistency, info, control));
  if (control) {
    const jf = join('docs', 'bench', 'journal.md');
    const text = existsSync(jf) ? readFileSync(jf, 'utf-8') : JOURNAL_HEADER;
    const entries = study.keys.map((k) => {
      const c = k.byHorizon[k.meta.horizon]?.control;
      const cons = consistency(k.meta.key);
      const res = !c ? 'aucune observation' : k.meta.key.startsWith('plan:') ? `${k.verdict} (espérance ${(c.expectancyR ?? NaN).toFixed(2)} R)` : `${k.verdict} (contrôle ${c.hitPct.toFixed(1)} % / ${c.baselineHitPct.toFixed(1)} %, cohérence ${cons == null ? '—' : `${cons.toFixed(0)} %`})`;
      return { day: today, key: k.meta.key, period, result: res };
    });
    writeFileSync(jf, appendJournal(text, entries));
  }
  log(`Écrit : ${file}${control ? ' et une ligne par candidat dans docs/bench/journal.md' : ''}`);
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'signals') return cmdSignals();
  if (cmd === 'strategies') return cmdStrategies(Object.keys(STRATEGIES));
  if (cmd === 'dca-variants') return cmdDcaVariants();
  if (cmd === 'candidates') return cmdCandidates(args.includes('--control'), args.find((a) => a.startsWith('--keys='))?.slice('--keys='.length).split(',') ?? null, args.find((a) => a.startsWith('--period='))?.slice('--period='.length), { from: args.find((a) => a.startsWith('--from='))?.slice(7), to: args.find((a) => a.startsWith('--to='))?.slice(5) });
  if (cmd === 'compare') {
    const unknown = args.filter((a) => !STRATEGIES[a]);
    if (args.length !== 2 || unknown.length) throw new Error(`Usage : compare <a> <b> parmi ${Object.keys(STRATEGIES).join(', ')}`);
    return cmdStrategies(args);
  }
  throw new Error('Commandes : signals, strategies, compare <a> <b>, candidates [--control], dca-variants');
}

main().catch((e) => { log(`Erreur : ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
