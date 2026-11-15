// Paliers de vente personnalisés par crypto (×multiple → % de la position de départ). Ils venaient des « thèses »,
// retirées en données v5 : la migration et l'import d'une ancienne sauvegarde les reportent ici, rien n'est perdu.

export interface ExitStep { multiple: number; pct: number }
export type ExitSteps = Record<string, ExitStep[]>;

/** Paliers des anciennes thèses (celles qui en avaient), par crypto. */
export function exitStepsFromTheses(theses: unknown): ExitSteps {
  const out: ExitSteps = {};
  if (!Array.isArray(theses)) return out;
  for (const t of theses as { coinId?: unknown; sellPlan?: unknown }[]) {
    if (!t || typeof t.coinId !== 'string' || !Array.isArray(t.sellPlan)) continue;
    const steps = (t.sellPlan as ExitStep[]).filter((s) => s && typeof s.multiple === 'number' && typeof s.pct === 'number');
    if (steps.length) out[t.coinId] = steps;
  }
  return out;
}
