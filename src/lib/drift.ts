// Écarts entre ton portefeuille actuel et ta cible (profil) : ce que Boussole te dit de corriger,
// calculé uniquement par tes règles — jamais par l'IA. Fonction pure, testée.

import type { Bucket, ProfileRules } from '../types';
import { BUCKET_LABEL, rebalance, rebalanceAction } from './portfolio';

export interface DriftLine {
  symbol: string;
  bucket: Bucket;
  value: number; // devise d'affichage
}

export interface DriftNotice {
  key: string;
  tone: 'up' | 'down' | 'warn' | 'neutral';
  title: string;
  detail: string;
  to?: string;
}

const pct = (v: number) => `${Math.round(v * 10) / 10}`;
const money = (v: number) => `${Math.round(v)}`;

/**
 * Avis de dérive : écarts poche par poche (avec l'action : renforcer / alléger / orienter le DCA —
 * le cœur ne se vend pas hors euphorie), limites par ligne, et poussières à regrouper.
 */
export function driftNotices(i: {
  alloc: Record<Bucket, number>;
  target: Record<Bucket, number>;
  lines: DriftLine[];
  rules: ProfileRules;
  /** Température ≥ 80 : l'euphorie autorise à alléger le cœur. */
  euphoria: boolean;
}): DriftNotice[] {
  const total = Object.values(i.alloc).reduce((s, v) => s + v, 0);
  if (total <= 0) return [];
  const out: DriftNotice[] = [];

  for (const l of rebalance(i.alloc, i.target)) {
    const action = rebalanceAction(l, i.euphoria);
    if (action === 'ok') continue;
    const label = BUCKET_LABEL[l.bucket];
    if (action === 'trim') {
      out.push({
        key: `b:${l.bucket}`,
        tone: 'down',
        title: `${label} à ${pct(l.currentPct)} % (cible ${pct(l.targetPct)} %)`,
        detail: `Réduire d’environ ${money(-l.diffValue)} — paliers de sortie, ou simplement ne plus renforcer cette poche.`,
        to: '/portefeuille',
      });
    } else if (action === 'buy') {
      out.push({
        key: `b:${l.bucket}`,
        tone: 'up',
        title: `${label} à ${pct(l.currentPct)} % (cible ${pct(l.targetPct)} %)`,
        detail: `Renforcer d’environ ${money(l.diffValue)} : ton prochain DCA peut viser cette poche.`,
        to: '/dca',
      });
    } else {
      out.push({
        key: `b:${l.bucket}`,
        tone: 'neutral',
        title: `Excès de ${label} (${pct(l.currentPct)} % vs cible ${pct(l.targetPct)} %)`,
        detail: 'Hors euphorie, le cœur ne se vend pas : on corrige en orientant le DCA vers les autres poches.',
        to: '/dca',
      });
    }
  }

  for (const line of i.lines) {
    if (line.value <= 0) continue;
    const p = (line.value / total) * 100;
    const cap = line.bucket === 'small' ? i.rules.maxPerGemPct : line.bucket === 'btc' || line.bucket === 'eth' || line.bucket === 'stable' ? null : i.rules.maxPerAltPct;
    if (cap != null && p > cap) {
      out.push({
        key: `l:${line.symbol}`,
        tone: 'warn',
        title: `${line.symbol} dépasse ta limite par ligne (${pct(p)} % > ${cap} %)`,
        detail: 'Une ligne trop grosse concentre le risque : alléger à tes paliers, et ne plus la renforcer.',
        to: '/portefeuille',
      });
    }
  }

  const dust = i.lines.filter((l) => l.value > 0 && (l.value / total) * 100 < i.rules.minLinePct);
  if (dust.length) {
    out.push({
      key: 'dust',
      tone: 'neutral',
      title: `${dust.length} ligne${dust.length > 1 ? 's' : ''} sous ${i.rules.minLinePct} % du portefeuille`,
      detail: `À regrouper vers Bitcoin (${dust.map((d) => d.symbol).join(', ')}) : chaque ordre paie des frais et du spread.`,
      to: '/portefeuille',
    });
  }

  return out;
}
