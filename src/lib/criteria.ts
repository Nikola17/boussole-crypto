// Fiche « 12 critères » : les questions de ton prompt Grok, calculées sur des données réelles et sourcées.
// Une donnée absente reste « non vérifié » : Boussole n'invente jamais un chiffre.

export type CriterionStatus = 'ok' | 'warn' | 'bad' | 'unknown';

export interface Criterion {
  key: string;
  n: number;
  label: string;
  value: string;
  status: CriterionStatus;
  detail: string;
  source: string;
}

export interface CriteriaInput {
  symbol: string;
  rank: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  fdvUsd: number | null;
  changes: { d1: number | null; d7: number | null; d30: number | null; d200: number | null; y1: number | null };
  /** Montant (USD) qu'il faut pour déplacer le prix de 2 % dans le carnet d'ordres, et où on l'a mesuré. */
  depth2pctUsd: number | null;
  depthWhere: string | null;
  /** Grandes plateformes où la crypto est cotée ; null si la liste n'a pas été chargée. */
  majorListings: string[] | null;
  protocol: { tvlUsd: number | null; fees30dUsd: number | null; revenue30dUsd: number | null } | null;
  /** Poids des 10 plus gros détenteurs (%), pour les jetons à contrat ; null sinon. */
  top10HoldersPct: number | null;
  nativeCoin: boolean;
  dev: { commits4w: number | null; stars: number | null } | null;
}

const fr = (x: number, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('fr-FR');
const sgn = (x: number | null) => (x == null ? '—' : `${x > 0 ? '+' : ''}${fr(x, 1)} %`);
function money(x: number | null): string {
  if (x == null) return '—';
  const a = Math.abs(x);
  if (a >= 1e9) return `${fr(x / 1e9, 2)} Md$`;
  if (a >= 1e6) return `${fr(x / 1e6, 1)} M$`;
  if (a >= 1e3) return `${fr(x / 1e3, 0)} k$`;
  return `${fr(x, 0)} $`;
}

export const MAJOR_EXCHANGES = ['Binance', 'Coinbase', 'Kraken', 'OKX', 'Bybit', 'Crypto.com'];

export function evaluateCriteria(i: CriteriaInput): Criterion[] {
  const c = (n: number, key: string, label: string, value: string, status: CriterionStatus, detail: string, source: string): Criterion => ({ n, key, label, value, status, detail, source });
  const out: Criterion[] = [];

  // 1. Variations
  const ch = i.changes;
  let s1: CriterionStatus = Object.values(ch).some((v) => v != null) ? 'ok' : 'unknown';
  let d1 = 'Aucun signal d’excès.';
  if (ch.d7 != null && ch.d7 > 50) { s1 = 'bad'; d1 = `+${Math.round(ch.d7)} % en 7 jours : risque de FOMO, règle de non-achat.`; }
  else if (ch.y1 != null && ch.y1 < -70) { s1 = 'warn'; d1 = 'Baisse de plus de 70 % sur un an : vérifie que la thèse tient toujours.'; }
  out.push(c(1, 'changes', 'Variation du prix', `24 h ${sgn(ch.d1)} · 7 j ${sgn(ch.d7)} · 30 j ${sgn(ch.d30)} · 200 j ${sgn(ch.d200)} · 1 an ${sgn(ch.y1)}`, s1, d1, 'CoinGecko'));

  // 2. Capitalisation, rang, volume
  let s2: CriterionStatus = 'unknown';
  let d2 = 'Rang ou capitalisation indisponible.';
  if (i.rank != null) {
    s2 = i.rank <= 100 ? 'ok' : i.rank <= 300 ? 'warn' : 'bad';
    d2 = i.rank <= 100 ? 'Top 100 : liquide et suivi.' : i.rank <= 300 ? 'Petite capitalisation : plus volatile et plus facile à manipuler.' : 'Micro-capitalisation : risque élevé, tailles de position minuscules.';
  }
  out.push(c(2, 'cap', 'Capitalisation, rang, volume', `#${i.rank ?? '—'} · capi ${money(i.marketCapUsd)} · volume 24 h ${money(i.volume24hUsd)}`, s2, d2, 'CoinGecko'));

  // 3. Volume / capitalisation
  const ratio = i.marketCapUsd && i.volume24hUsd != null ? (i.volume24hUsd / i.marketCapUsd) * 100 : null;
  let s3: CriterionStatus = 'unknown';
  let d3 = 'Données insuffisantes.';
  if (ratio != null) {
    s3 = ratio < 1 ? 'bad' : ratio < 3 ? 'warn' : ratio <= 40 ? 'ok' : 'warn';
    d3 = ratio < 1 ? 'Très peu échangée : difficile de sortir sans casser le prix.' : ratio < 3 ? 'Liquidité modeste.' : ratio <= 40 ? 'Activité saine.' : 'Volume très élevé par rapport à la capitalisation : spéculation intense, ou volume peu fiable.';
  }
  out.push(c(3, 'volcap', 'Volume / capitalisation', ratio != null ? `${fr(ratio, 1)} %` : '—', s3, d3, 'CoinGecko'));

  // 4. Profondeur du carnet
  let s4: CriterionStatus = 'unknown';
  let d4 = 'Carnet d’ordres non chargé.';
  if (i.depth2pctUsd != null) {
    s4 = i.depth2pctUsd >= 100_000 ? 'ok' : i.depth2pctUsd >= 20_000 ? 'warn' : 'bad';
    d4 = s4 === 'ok' ? 'Un ordre de quelques dizaines de dollars ne bouge pas le prix.' : s4 === 'warn' ? 'Carnet moyen : évite les gros ordres.' : 'Carnet mince : le prix peut être déplacé facilement.';
  }
  out.push(c(4, 'depth', 'Profondeur du carnet (±2 %)', i.depth2pctUsd != null ? `${money(i.depth2pctUsd)} pour bouger le prix de 2 %${i.depthWhere ? ` (${i.depthWhere})` : ''}` : '—', s4, d4, 'CoinGecko (tickers)'));

  // 5. FDV / capitalisation
  const fdvRatio = i.marketCapUsd && i.fdvUsd ? i.fdvUsd / i.marketCapUsd : null;
  let s5: CriterionStatus = 'unknown';
  let d5 = 'FDV indisponible (offre maximale inconnue).';
  if (fdvRatio != null) {
    s5 = fdvRatio <= 1.5 ? 'ok' : fdvRatio <= 3 ? 'warn' : 'bad';
    d5 = fdvRatio <= 1.5 ? 'Peu de dilution à venir.' : fdvRatio <= 3 ? 'Dilution importante à venir : de la pression vendeuse future.' : 'FDV très supérieure à la capitalisation : l’essentiel de l’offre n’est pas encore en circulation.';
  }
  out.push(c(5, 'fdv', 'FDV / capitalisation', fdvRatio != null ? `×${fr(fdvRatio, 2)}` : '—', s5, d5, 'CoinGecko'));

  // 6. Déblocages (pas de calendrier gratuit : estimation de la part encore à émettre)
  const locked = i.marketCapUsd && i.fdvUsd && i.fdvUsd >= i.marketCapUsd ? (1 - i.marketCapUsd / i.fdvUsd) * 100 : null;
  let s6: CriterionStatus = 'unknown';
  if (locked != null) s6 = locked <= 10 ? 'ok' : locked <= 40 ? 'warn' : 'bad';
  out.push(c(6, 'unlocks', 'Déblocages de tokens', locked != null ? `≈ ${fr(locked, 0)} % de l’offre pas encore en circulation` : '—', s6,
    'Estimation déduite de la FDV, pas un calendrier : aucune source gratuite fiable ne donne les dates. Vérifie-les (Tokenomist, documentation du projet).', 'Estimation Boussole'));

  // 7. Concentration
  let s7: CriterionStatus = 'unknown';
  let d7 = i.nativeCoin ? 'Monnaie native d’un réseau : pas de contrat à analyser.' : 'Analyse de sécurité non lancée (ou token sans contrat connu).';
  if (i.top10HoldersPct != null) {
    s7 = i.top10HoldersPct <= 30 ? 'ok' : i.top10HoldersPct <= 50 ? 'warn' : 'bad';
    d7 = s7 === 'ok' ? 'Détention répartie.' : s7 === 'warn' ? 'Concentration notable : quelques portefeuilles peuvent faire bouger le prix.' : 'Très concentré : risque de vente massive par quelques portefeuilles.';
  }
  out.push(c(7, 'holders', 'Concentration des gros portefeuilles', i.top10HoldersPct != null ? `Top 10 : ${fr(i.top10HoldersPct, 0)} %` : '—', s7, d7, 'GoPlus / RugCheck'));

  // 8. Développeurs
  let s8: CriterionStatus = 'unknown';
  let d8 = 'Pas de dépôt public suivi par CoinGecko pour cette crypto.';
  if (i.dev && i.dev.commits4w != null) {
    s8 = i.dev.commits4w >= 20 ? 'ok' : i.dev.commits4w >= 5 ? 'warn' : 'bad';
    d8 = s8 === 'ok' ? 'Développement actif.' : s8 === 'warn' ? 'Activité modérée.' : 'Presque aucune activité récente sur le code public.';
  }
  out.push(c(8, 'dev', 'Activité des développeurs', i.dev && i.dev.commits4w != null ? `${i.dev.commits4w} commits en 4 semaines${i.dev.stars != null ? ` · ${fr(i.dev.stars, 0)} étoiles` : ''}` : '—', s8, d8, 'CoinGecko (GitHub)'));

  // 9. Revenus, frais, TVL
  let s9: CriterionStatus = 'unknown';
  let d9 = 'Pas un protocole suivi par DefiLlama (ou données non chargées).';
  if (i.protocol) {
    const f = i.protocol.fees30dUsd;
    s9 = f == null ? 'unknown' : f > 0 ? 'ok' : 'warn';
    d9 = f == null ? 'Frais non disponibles.' : f > 0 ? 'Le protocole génère des frais : une valeur réelle derrière le jeton.' : 'Aucun frais généré : valeur surtout spéculative.';
  }
  out.push(c(9, 'revenue', 'Revenus, frais, TVL', i.protocol ? `TVL ${money(i.protocol.tvlUsd)} · frais 30 j ${money(i.protocol.fees30dUsd)} · revenus 30 j ${money(i.protocol.revenue30dUsd)}` : '—', s9, d9, 'DefiLlama'));

  // 10. Listings
  let s10: CriterionStatus = 'unknown';
  let d10 = 'Liste des plateformes non chargée.';
  if (i.majorListings) {
    s10 = i.majorListings.length >= 3 ? 'ok' : i.majorListings.length >= 1 ? 'warn' : 'bad';
    d10 = s10 === 'ok' ? 'Cotée sur plusieurs grandes plateformes.' : s10 === 'warn' ? 'Peu de grandes plateformes : liquidité fragile.' : 'Aucune grande plateforme : risque élevé.';
  }
  out.push(c(10, 'listings', 'Cotations (grandes plateformes)', i.majorListings ? (i.majorListings.length ? i.majorListings.join(', ') : 'aucune') : '—', s10, d10, 'CoinGecko (tickers)'));

  // 11. Tendance de recherche et activité sur X
  out.push(c(11, 'social', 'Tendance de recherche et activité sur X', 'non vérifié', 'unknown', 'Boussole ne lit pas les réseaux sociaux : c’est le rôle du prompt Grok.', '—'));

  // 12. Synthèse
  const flags = out.filter((x) => x.status === 'bad' || x.status === 'warn');
  const bad = flags.filter((x) => x.status === 'bad').length;
  const s12: CriterionStatus = bad > 0 ? 'bad' : flags.length > 0 ? 'warn' : 'ok';
  out.push(c(12, 'risks', 'Synthèse des risques', flags.length ? flags.map((x) => x.label).join(' · ') : 'aucun signal d’alerte', s12,
    `${bad} critère(s) rouge(s) et ${flags.length - bad} orange(s) sur ${out.filter((x) => x.status !== 'unknown').length} évalués. Les critères « non vérifié » restent à étudier.`, 'Boussole'));
  return out;
}
