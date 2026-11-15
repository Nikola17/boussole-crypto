// Rapports du banc d'essai (Markdown) et fichiers embarqués dans l'application (JSON).
// Arrondis et tris fixes : à données identiques, deux exécutions écrivent les mêmes fichiers.

import type { KeyStats, PeriodStats } from '../../src/lib/lab/events';
import type { ReliabilityEntry, ReliabilityTable } from '../../src/lib/lab/reliability';

export const r4 = (x: number | null | undefined): number | null => (x != null && Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null);
const f1 = (x: number | null | undefined, signed = false) => (x != null && Number.isFinite(x) ? `${signed && x > 0 ? '+' : ''}${x.toFixed(1).replace('.', ',')}` : '—');
const f2 = (x: number | null | undefined) => (x != null && Number.isFinite(x) ? `${x > 0 ? '+' : ''}${x.toFixed(2).replace('.', ',')}` : '—');
const VERDICT_ORDER = ['validé', 'prometteur', 'sans effet', 'inversé', 'trop peu de cas'];

export interface RunInfo { day: string; dataThrough: string; assets: number; from: string; top: number; observations: number; notes: string[] }

export function reliabilityTable(keys: KeyStats[], info: RunInfo, rulesVersion: number): ReliabilityTable {
  const entries: Record<string, ReliabilityEntry> = {};
  for (const k of [...keys].sort((a, b) => a.meta.key.localeCompare(b.meta.key))) {
    const h = k.byHorizon[k.meta.horizon];
    if (!h) continue;
    const a = h.all;
    const n = (x: number) => r4(x) as number;
    entries[k.meta.key] = {
      label: k.meta.label, bias: k.meta.bias, horizon: k.meta.horizon,
      days: a.days, episodes: a.episodes, frequencyPct: n(k.frequencyPct),
      hitPct: n(a.hitPct), hitLow: n(a.hitLow), hitHigh: n(a.hitHigh),
      medianPct: n(a.medianPct), excessMedianPct: n(a.excessMedianPct), worstMedianPct: n(a.worstMedianPct),
      baselineHitPct: n(a.baselineHitPct), baselineMedianPct: n(a.baselineMedianPct),
      control: { episodes: h.control.episodes, hitPct: n(h.control.hitPct), medianPct: n(h.control.medianPct), baselineHitPct: n(h.control.baselineHitPct) },
      verdict: k.verdict,
      ...(a.expectancyR != null ? { expectancyR: n(a.expectancyR) } : {}),
    };
  }
  return { generatedAt: info.day, dataThrough: info.dataThrough, rulesVersion, universe: { assets: info.assets, from: info.from, top: info.top }, entries };
}

function row(k: KeyStats, h: number): string {
  const s = k.byHorizon[h];
  const plan = k.meta.key.startsWith('plan:');
  const cell = (p: PeriodStats) => (plan ? `${f2(p.expectancyR)} R` : `${f1(p.hitPct)} % / ${f1(p.baselineHitPct)} %`);
  return `| ${k.meta.label} | ${h} j | ${f1(k.frequencyPct)} % | ${s.all.episodes} | ${cell(s.all)} | ${f1(s.all.medianPct, true)} % / ${f1(s.all.baselineMedianPct, true)} % | ${f1(s.all.excessMedianPct, true)} | ${f1(s.all.worstMedianPct)} % | ${s.control.episodes} : ${cell(s.control)} | ${k.verdict} |`;
}

export function signalsReport(keys: KeyStats[], info: RunInfo, rulesVersion: number): string {
  const sorted = [...keys].sort((a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict) || a.meta.key.localeCompare(b.meta.key));
  return [
    `# Banc d'essai — signaux v${rulesVersion} (${info.day})`,
    '',
    `Données jusqu'au ${info.dataThrough}. Univers : ${info.assets} actifs Binance (paires retirées comprises), les ${info.top} premiers par volume en dollars chaque jour, à partir du ${info.from}. ${info.observations} observations (jour × crypto).`,
    '',
    '## Conventions',
    '',
    '- Signaux calculés sur les 400 dernières bougies journalières closes, comme dans l’application.',
    '- Entrée à l’ouverture du lendemain du signal ; rendement jusqu’à la clôture de l’horizon. Une paire retirée sort à sa dernière clôture.',
    '- Un épisode (jours consécutifs où le signal reste actif sur une crypto) compte une fois. « Hausse » : part des épisodes en gain.',
    '- Référence : toutes les observations de la même période (Bitcoin seul pour la température). Excès : rendement moins la médiane des cryptos de l’univers ce jour-là.',
    '- Réglage : jusqu’au 31/12/2022. Contrôle : à partir du 01/01/2023. Le verdict se juge sur le contrôle.',
    '- Plans de trade : espérance en R, frais « plateforme d’échange » aller-retour compris (0,3 % du prix).',
    '',
    '## Limites',
    '',
    '- Classement par volume et non par capitalisation (pas d’historique gratuit). Cryptos jamais cotées sur Binance absentes.',
    '- Jours qui se chevauchent : les épisodes réduisent ce biais sans le supprimer. Moyennes tirées par quelques envolées : lire les médianes.',
    '- Température reconstituée sans part des stablecoins ni taux de financement ; seuils choisis en connaissant une partie de cet historique.',
    '',
    '## Résultats (horizon principal)',
    '',
    '| Signal | Horizon | Fréquence | Épisodes | Hausse / réf. | Médiane / réf. | Excès méd. | Pire baisse méd. | Contrôle : épisodes, hausse / réf. | Verdict |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...sorted.map((k) => row(k, k.meta.horizon)),
    '',
    '## Autres horizons',
    '',
    '| Signal | Horizon | Fréquence | Épisodes | Hausse / réf. | Médiane / réf. | Excès méd. | Pire baisse méd. | Contrôle | Verdict (horizon principal) |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...sorted.flatMap((k) => k.meta.horizons.filter((h) => h !== k.meta.horizon && k.byHorizon[h]).map((h) => row(k, h))),
    '',
    '## Notes sur les données',
    '',
    ...(info.notes.length ? info.notes.map((n) => `- ${n}`) : ['- Aucune.']),
    '',
  ].join('\n');
}

export interface StrategyRun {
  fill: 'nextOpen' | 'nextClose'; costs: 'exchange' | 'app';
  twrPct: number; twrPerYearPct: number; maxDrawdownPct: number; referenceTwrPct: number;
  trades: number; expectancyR: number | null;
  windows: Partial<Record<'30' | '60' | '90' | '180' | '365', { p10: number; p50: number; p90: number }>>;
}
export interface StrategiesBench { generatedAt: string; dataThrough: string; entries: Record<string, { rules: string; runs: StrategyRun[] }> }

export function strategiesReport(b: StrategiesBench, info: RunInfo, labels: Record<string, string>): string {
  const lines = [
    `# Banc d'essai — stratégies (${info.day})`,
    '',
    `Données jusqu'au ${info.dataThrough}, simulation du ${info.from} à la veille. Exécution le lendemain de la décision, à l’ouverture (nextOpen) ou à la clôture (nextClose, variante pessimiste). Frais « plateforme d’échange » (0,10 % + 0,05 % d’écart par côté) ou « application » (1,5 % d’écart par côté). Référence : les mêmes apports en Bitcoin (stratégies à échéances), ou le capital en Bitcoin gardé (stratégies à trades).`,
    '',
    '| Stratégie | Règles | Exécution | Frais | Performance | Par an | Pire baisse | Référence | Trades | Espérance | Fenêtres 90 j (10ᵉ / 50ᵉ / 90ᵉ) |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const [id, e] of Object.entries(b.entries).sort()) {
    for (const r of e.runs) {
      const w = r.windows['90'];
      lines.push(`| ${labels[id] ?? id} | ${e.rules} | ${r.fill} | ${r.costs} | ${f1(r.twrPct, true)} % | ${f1(r.twrPerYearPct, true)} % | ${f1(r.maxDrawdownPct)} % | ${f1(r.referenceTwrPct, true)} % | ${r.trades} | ${r.expectancyR == null ? '—' : `${f2(r.expectancyR)} R`} | ${w ? `${f1(w.p10, true)} / ${f1(w.p50, true)} / ${f1(w.p90, true)} %` : '—'} |`);
    }
  }
  lines.push('', 'Une simulation flatte toujours un peu : seuls les résultats en direct comptent pour la confiance.', '');
  return lines.join('\n');
}

/** Rapport des candidats : période de réglage seule, ou réglage et contrôle (ce dernier cas s'inscrit au journal). */
export function candidatesReport(keys: KeyStats[], byAsset: Record<string, { asset: string; episodes: number; medianPct: number; baselineMedianPct: number }[]>, consistency: (key: string) => number | null, info: RunInfo, control: boolean): string {
  const lines = [
    `# Banc d'essai — candidats du lot 3 (${info.day}, ${control ? 'réglage et contrôle' : 'réglage seul'})`,
    '',
    `Données jusqu'au ${info.dataThrough}. Univers : les ${info.top} premiers par volume chaque jour depuis le ${info.from}. Conventions identiques au rapport des signaux.`,
    control ? 'Ce passage regarde la période de contrôle : il est inscrit au journal des essais.' : 'Ce passage ne regarde que la période de réglage (jusqu’au 31/12/2022) : il sert à choisir les paramètres.',
    '',
    `| Candidat | Horizon | Épisodes (réglage) | Hausse / réf. (réglage) | Médiane / réf. (réglage) | Cohérence entre cryptos |${control ? ' Contrôle : épisodes, hausse / réf. | Médiane / réf. (contrôle) | Verdict |' : ''}`,
    `|---|---|---|---|---|---|${control ? '---|---|---|' : ''}`,
  ];
  for (const k of [...keys].sort((a, b) => a.meta.key.localeCompare(b.meta.key))) {
    const s = k.byHorizon[k.meta.horizon];
    if (!s) continue;
    const plan = k.meta.key.startsWith('plan:');
    const hit = (p: PeriodStats) => (plan ? `${f2(p.expectancyR)} R` : `${f1(p.hitPct)} % / ${f1(p.baselineHitPct)} %`);
    const med = (p: PeriodStats) => (plan ? '—' : `${f1(p.medianPct, true)} % / ${f1(p.baselineMedianPct, true)} %`);
    const c = consistency(k.meta.key);
    lines.push(`| ${k.meta.label} | ${k.meta.horizon} j | ${s.tuning.episodes} | ${hit(s.tuning)} | ${med(s.tuning)} | ${c == null ? '—' : `${f1(c)} %`} (${(byAsset[k.meta.key] ?? []).filter((x) => x.episodes >= 5).length} cryptos) |${control ? ` ${s.control.episodes} : ${hit(s.control)} | ${med(s.control)} | ${k.verdict} |` : ''}`);
  }
  lines.push('');
  return lines.join('\n');
}
