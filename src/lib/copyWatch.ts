// Watchlist copy trading : drapeaux de risque sur les stats publiques d'un trader (ROI 30 j, max drawdown 30 j).
// Fonction pure, testée. Boussole ne copie jamais automatiquement : c'est un radar, pas un ordre.

export interface TraderStats {
  roi30dPct: number | null;
  maxDrawdown30dPct: number | null; // négatif ou nul (ex : -35 = −35 %)
  followers?: number;
}

export type CopyRisk = 'ok' | 'warn' | 'danger';

/** Drapeau de risque : drawdown > 30 % ou ROI 30 j < −20 % → danger ; drawdown > 15 % ou ROI < 0 → warn. */
export function copyRiskFlag(s: TraderStats): CopyRisk {
  const dd = s.maxDrawdown30dPct;
  const roi = s.roi30dPct;
  if ((dd != null && dd <= -30) || (roi != null && roi < -20)) return 'danger';
  if ((dd != null && dd <= -15) || (roi != null && roi < 0)) return 'warn';
  return 'ok';
}

export const COPY_RISK_LABEL: Record<CopyRisk, string> = {
  ok: 'Stable',
  warn: 'À surveiller',
  danger: 'En difficulté',
};

/** Ligne d'alerte pour Telegram quand un trader suivi dévisse. */
export function copyAlertText(name: string, s: TraderStats): string {
  const roi = s.roi30dPct != null ? `${s.roi30dPct >= 0 ? '+' : ''}${s.roi30dPct.toFixed(1)} %` : '—';
  const dd = s.maxDrawdown30dPct != null ? `${s.maxDrawdown30dPct.toFixed(1)} %` : '—';
  return `Copy trading — ${name} : ROI 30 j ${roi}, drawdown max 30 j ${dd}. Stats publiques uniquement : Boussole ne copie personne automatiquement. Vérifie toi-même avant toute décision.`;
}
