// Statistiques du Labo : médiane, quantile, intervalle de confiance d'une proportion (Wilson),
// tirages aléatoires reproductibles (graine fixe) et rendement annualisé pondéré par l'argent (XIRR).
// Fonctions pures : aucun appel à Math.random ni à l'horloge.

export function median(xs: number[]): number {
  return quantile(xs, 0.5);
}

/** Quantile par interpolation linéaire (q entre 0 et 1) ; NaN pour une liste vide. */
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = Math.min(1, Math.max(0, q)) * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Intervalle de Wilson d'une proportion k/n (fractions 0-1) ; z = 1,645 → 90 %. */
export function wilson(k: number, n: number, z = 1.645): { low: number; high: number } {
  if (!(n > 0)) return { low: 0, high: 1 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

/** Empreinte FNV-1a 32 bits d'un texte : sert de graine (identifiant d'un portefeuille). */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Générateur pseudo-aléatoire à graine fixe (mulberry32) : valeurs dans [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Moyennes de `draws` rééchantillonnages avec remise, triées : la marge d'erreur d'une moyenne. */
export function bootstrapMeans(xs: number[], draws: number, seed: number): number[] {
  if (!xs.length) return [];
  const rnd = mulberry32(seed);
  const out: number[] = [];
  for (let d = 0; d < draws; d++) {
    let sum = 0;
    for (let i = 0; i < xs.length; i++) sum += xs[Math.floor(rnd() * xs.length)];
    out.push(sum / xs.length);
  }
  return out.sort((a, b) => a - b);
}

/** Taux annuel qui annule la valeur actuelle des flux (apports < 0, valeur finale > 0) ; null sans solution. */
export function xirr(flows: { t: number; amount: number }[]): number | null {
  if (flows.length < 2 || !flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const t0 = Math.min(...flows.map((f) => f.t));
  const npv = (r: number) => flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, (f.t - t0) / (365 * 86400_000)), 0);
  let lo = -0.99;
  let hi = 10;
  let flo = npv(lo);
  if (flo * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-9) return mid;
    if (fm * flo < 0) hi = mid;
    else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}
