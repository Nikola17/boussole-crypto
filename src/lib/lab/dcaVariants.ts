// Règles de décision du lot 5 (fiche 12.1) : quelle base du panier, quelle table de température.
// Jugées sur la période de contrôle (2023 et après), qui n'a servi à régler aucun seuil.

export interface VariantResult { id: string; twrPct: number; twrPerYearPct: number; maxDrawdownPct: number }

export const MAX_EXTRA_DRAWDOWN_PTS = 2;
export const MIN_TABLE_GAIN_PTS = 2;

/** Meilleur TWR parmi les variantes dont la pire baisse ne dépasse pas celle du DCA Bitcoin de plus de 2 points. */
export function chooseBaseMode(variants: VariantResult[], dcaBtc: VariantResult): { chosen: string | null; beatsBtc: boolean } {
  const ok = variants.filter((x) => x.maxDrawdownPct >= dcaBtc.maxDrawdownPct - MAX_EXTRA_DRAWDOWN_PTS).sort((a, b) => b.twrPct - a.twrPct);
  const best = ok[0] ?? null;
  return { chosen: best?.id ?? null, beatsBtc: !!best && best.twrPct > dcaBtc.twrPct };
}

/** La table ne change que pour plus de 2 points de TWR annualisé sans pire baisse plus forte. */
export function chooseTempTable(tables: VariantResult[], current: string): string {
  const cur = tables.find((x) => x.id === current);
  if (!cur) return current;
  const better = tables
    .filter((x) => x.id !== current && x.twrPerYearPct > cur.twrPerYearPct + MIN_TABLE_GAIN_PTS && x.maxDrawdownPct >= cur.maxDrawdownPct)
    .sort((a, b) => b.twrPerYearPct - a.twrPerYearPct);
  return better[0]?.id ?? current;
}
