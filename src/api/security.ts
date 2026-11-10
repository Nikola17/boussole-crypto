// Scan de sécurité des tokens : GoPlus (EVM & Solana) et RugCheck (Solana).
// Objectif : repérer honeypots, taxes cachées, mint illimité, liquidité non verrouillée...
// Règle d'or : l'absence de données n'est JAMAIS une bonne nouvelle. Un scan qui n'a presque rien reçu dit « Données insuffisantes »,
// jamais « Plutôt sain », et un seul avertissement suffit à retirer le feu vert.

import { getJson } from './http';

export interface SecurityFlag {
  label: string;
  severity: 'ok' | 'warn' | 'danger';
  detail?: string;
}

export type SecurityVerdict = 'Plutôt sain' | 'Prudence' | 'Danger' | 'Données insuffisantes';

export interface SecurityReport {
  score: number; // 0-100, 100 = aucun signal d'alerte détecté
  verdict: SecurityVerdict;
  flags: SecurityFlag[];
  top10HoldersPct: number | null;
  holders: number | null;
  sources: string[];
}

type Bit = '0' | '1' | undefined | null | string;
const on = (v: Bit) => v === '1';

export interface GoPlusEvm {
  is_honeypot?: Bit;
  buy_tax?: string;
  sell_tax?: string;
  is_mintable?: Bit;
  owner_change_balance?: Bit;
  hidden_owner?: Bit;
  can_take_back_ownership?: Bit;
  is_proxy?: Bit;
  is_open_source?: Bit;
  cannot_sell_all?: Bit;
  transfer_pausable?: Bit;
  is_blacklisted?: Bit;
  slippage_modifiable?: Bit;
  trading_cooldown?: Bit;
  holder_count?: string;
  holders?: { percent: string; is_locked?: number; is_contract?: number; tag?: string }[];
  lp_holders?: { percent: string; is_locked?: number; tag?: string }[];
  is_in_dex?: Bit;
}

/** Liquidité verrouillée ou brûlée : sous ce seuil, le créateur peut retirer la liquidité d'un coup (« rug pull »). */
export const LP_LOCKED_DANGER_PCT = 30;
export const LP_LOCKED_OK_PCT = 80;

interface FinalizeOpts {
  /** Trop peu de données reçues pour juger : jamais « Plutôt sain ». */
  insufficient?: boolean;
  /** Une seule source a répondu : l'analyse est incomplète, au mieux « Prudence ». */
  partial?: boolean;
}

export function finalize(flags: SecurityFlag[], top10: number | null, holders: number | null, sources: string[], opts: FinalizeOpts = {}): SecurityReport {
  let score = 100;
  for (const f of flags) score -= f.severity === 'danger' ? 35 : f.severity === 'warn' ? 12 : 0;
  score = Math.max(0, score);
  const hasDanger = flags.some((f) => f.severity === 'danger');
  const hasWarn = flags.some((f) => f.severity === 'warn');
  let verdict: SecurityVerdict;
  if (hasDanger || score < 40) verdict = 'Danger';
  else if (opts.insufficient) verdict = 'Données insuffisantes';
  else if (hasWarn || opts.partial || score < 75) verdict = 'Prudence';
  else verdict = 'Plutôt sain';
  return { score, verdict, flags, top10HoldersPct: top10, holders, sources };
}

/** Champs que GoPlus doit renseigner pour qu'on puisse juger un contrat EVM. */
const EVM_KEY_FIELDS: (keyof GoPlusEvm)[] = ['is_honeypot', 'is_open_source', 'buy_tax', 'sell_tax', 'is_mintable', 'owner_change_balance', 'hidden_owner', 'cannot_sell_all'];
const known = (v: unknown) => v !== undefined && v !== null && v !== '';

/** Construit le rapport d'un contrat EVM à partir de la réponse GoPlus (fonction pure : testée sans réseau). */
export function evmReportFrom(response: { code?: number; result?: Record<string, GoPlusEvm> } | null | undefined, address: string): SecurityReport {
  const addr = address.toLowerCase();
  const d = response?.result?.[addr];
  if (!d) throw new Error('GoPlus ne connaît pas encore ce token (trop récent ?).');
  const flags: SecurityFlag[] = [];
  // GoPlus répond « code 1 » quand l'analyse est complète. Un champ absent ne veut pas dire « pas de risque ».
  const knownFields = EVM_KEY_FIELDS.filter((k) => known(d[k])).length;
  const insufficient = response?.code !== 1 || !known(d.is_honeypot) || !known(d.is_open_source) || knownFields < 6;
  if (insufficient) flags.push({ label: `Analyse incomplète : ${knownFields} contrôles sur ${EVM_KEY_FIELDS.length} ont pu être faits`, severity: 'warn', detail: 'GoPlus n’a pas renvoyé assez d’informations sur ce contrat. N’en déduis rien de rassurant.' });

  if (on(d.is_honeypot)) flags.push({ label: 'Honeypot : impossible de revendre', severity: 'danger' });
  if (on(d.cannot_sell_all)) flags.push({ label: 'Impossible de tout revendre', severity: 'danger' });
  const buyTax = Number(d.buy_tax ?? 0) * 100;
  const sellTax = Number(d.sell_tax ?? 0) * 100;
  if (sellTax > 10 || buyTax > 10) flags.push({ label: `Taxes élevées (achat ${buyTax.toFixed(0)} %, vente ${sellTax.toFixed(0)} %)`, severity: sellTax > 25 ? 'danger' : 'warn' });
  else if (sellTax > 0 || buyTax > 0) flags.push({ label: `Taxes : achat ${buyTax.toFixed(1)} %, vente ${sellTax.toFixed(1)} %`, severity: 'warn' });
  if (on(d.is_mintable)) flags.push({ label: 'Le créateur peut créer de nouveaux tokens', severity: 'warn' });
  if (on(d.owner_change_balance)) flags.push({ label: 'Le propriétaire peut modifier les soldes', severity: 'danger' });
  if (on(d.hidden_owner)) flags.push({ label: 'Propriétaire caché', severity: 'danger' });
  if (on(d.can_take_back_ownership)) flags.push({ label: 'Le contrôle du contrat peut être repris', severity: 'warn' });
  if (on(d.transfer_pausable)) flags.push({ label: 'Les transferts peuvent être suspendus', severity: 'warn' });
  if (on(d.is_blacklisted)) flags.push({ label: 'Liste noire d’adresses possible', severity: 'warn' });
  if (on(d.slippage_modifiable)) flags.push({ label: 'Taxes modifiables par le propriétaire', severity: 'warn' });
  if (on(d.trading_cooldown)) flags.push({ label: 'Délai imposé entre deux transactions', severity: 'warn' });
  if (on(d.is_proxy)) flags.push({ label: 'Contrat proxy (code modifiable)', severity: 'warn' });
  if (d.is_open_source === '0') flags.push({ label: 'Code source non vérifié', severity: 'danger' });

  const holders = d.holders ?? [];
  const top10 = holders.slice(0, 10).filter((h) => !h.is_locked && !(h.tag ?? '').toLowerCase().includes('burn'))
    .reduce((s, h) => s + Number(h.percent || 0) * 100, 0);
  if (top10 > 50) flags.push({ label: `Top 10 détenteurs : ${top10.toFixed(0)} % de l’offre`, severity: 'danger' });
  else if (top10 > 30) flags.push({ label: `Top 10 détenteurs : ${top10.toFixed(0)} % de l’offre`, severity: 'warn' });

  const lp = d.lp_holders ?? [];
  if (lp.length) {
    const lockedPct = lp.filter((h) => h.is_locked || /burn|dead|null/i.test(h.tag ?? '')).reduce((s, h) => s + Number(h.percent || 0) * 100, 0);
    if (lockedPct < LP_LOCKED_DANGER_PCT) flags.push({ label: `Liquidité verrouillée/brûlée : ${lockedPct.toFixed(0)} % seulement`, severity: 'danger', detail: 'Le créateur peut retirer presque toute la liquidité d’un coup.' });
    else if (lockedPct < 50) flags.push({ label: `Liquidité verrouillée/brûlée : ${lockedPct.toFixed(0)} % seulement`, severity: 'warn' });
    else flags.push({ label: `Liquidité verrouillée/brûlée : ${lockedPct.toFixed(0)} %`, severity: 'ok' });
  }
  if (!insufficient && !flags.some((f) => f.severity !== 'ok')) flags.push({ label: 'Aucun piège classique détecté', severity: 'ok' });
  return finalize(flags, holders.length ? top10 : null, d.holder_count ? Number(d.holder_count) : null, ['GoPlus Security'], { insufficient });
}

export async function scanEvm(chainId: string, address: string): Promise<SecurityReport> {
  const addr = address.toLowerCase();
  const r = await getJson<{ code?: number; result?: Record<string, GoPlusEvm> }>(
    `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${addr}`,
  );
  return evmReportFrom(r, addr);
}

export interface GoPlusSol {
  mintable?: { status?: Bit };
  freezable?: { status?: Bit };
  closable?: { status?: Bit };
  balance_mutable_authority?: { status?: Bit };
  metadata_mutable?: { status?: Bit };
  non_transferable?: Bit;
  transfer_fee?: { current_fee_rate?: { fee_rate?: string } } | Record<string, never>;
  holders?: { percent: string; is_locked?: number; tag?: string }[];
  trusted_token?: Bit | number;
}

export interface RugSummary {
  score?: number;
  score_normalised?: number;
  risks?: { name: string; description: string; level: string; value?: string }[];
  lpLockedPct?: number;
}

/** Rapport d'un token Solana à partir de ce que GoPlus et RugCheck ont renvoyé (null = la source n'a pas répondu). */
export function solanaReportFrom(gp: GoPlusSol | null | undefined, rug: RugSummary | null | undefined): SecurityReport {
  const flags: SecurityFlag[] = [];
  const sources: string[] = [];
  let top10: number | null = null;

  if (gp) {
    sources.push('GoPlus Security');
    if (on(gp.mintable?.status)) flags.push({ label: 'Autorité de mint active : offre illimitée possible', severity: 'danger' });
    if (on(gp.freezable?.status)) flags.push({ label: 'Autorité de gel active : tes tokens peuvent être bloqués', severity: 'danger' });
    if (on(gp.balance_mutable_authority?.status)) flags.push({ label: 'Les soldes peuvent être modifiés', severity: 'danger' });
    if (on(gp.closable?.status)) flags.push({ label: 'Le compte du token peut être fermé', severity: 'warn' });
    if (on(gp.metadata_mutable?.status)) flags.push({ label: 'Métadonnées modifiables', severity: 'warn' });
    if (on(gp.non_transferable as Bit)) flags.push({ label: 'Token non transférable', severity: 'danger' });
    const holders = gp.holders ?? [];
    if (holders.length) {
      top10 = holders.slice(0, 10).filter((h) => !h.is_locked).reduce((s, h) => s + Number(h.percent || 0) * 100, 0);
      if (top10 > 50) flags.push({ label: `Top 10 détenteurs : ${top10.toFixed(0)} %`, severity: 'danger' });
      else if (top10 > 30) flags.push({ label: `Top 10 détenteurs : ${top10.toFixed(0)} %`, severity: 'warn' });
    }
  }

  if (rug) {
    sources.push('RugCheck');
    for (const risk of rug.risks ?? []) {
      const sev: SecurityFlag['severity'] = risk.level === 'danger' ? 'danger' : 'warn';
      if (!flags.some((f) => f.label.toLowerCase().includes(risk.name.toLowerCase().slice(0, 8)))) {
        flags.push({ label: risk.name, severity: sev, detail: risk.description });
      }
    }
    if (rug.lpLockedPct != null) {
      const p = rug.lpLockedPct;
      flags.push({
        label: `Liquidité verrouillée : ${p.toFixed(0)} %`,
        severity: p >= LP_LOCKED_OK_PCT ? 'ok' : p >= LP_LOCKED_DANGER_PCT ? 'warn' : 'danger',
        detail: p < LP_LOCKED_DANGER_PCT ? 'Le créateur peut retirer presque toute la liquidité d’un coup.' : undefined,
      });
    }
  }
  if (!sources.length) throw new Error('Scan indisponible pour ce token pour le moment.');

  // Une source seule ne voit pas tout : GoPlus ne donne pas la liquidité verrouillée, RugCheck ne voit pas toutes les autorités.
  const partial = sources.length < 2;
  if (partial) flags.push({ label: `Une seule source a répondu (${sources[0]}) : analyse incomplète`, severity: 'warn' });
  if (!partial && !flags.some((f) => f.severity !== 'ok')) flags.push({ label: 'Aucun piège classique détecté', severity: 'ok' });
  return finalize(flags, top10, null, sources, { partial });
}

export async function scanSolana(mint: string): Promise<SecurityReport> {
  let gp: GoPlusSol | null = null;
  let rug: RugSummary | null = null;
  try {
    const r = await getJson<{ result?: Record<string, GoPlusSol> }>(`https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${mint}`, { retries: 1 });
    gp = r.result?.[mint] ?? Object.values(r.result ?? {})[0] ?? null;
  } catch {
    /* on tente RugCheck */
  }
  try {
    rug = await getJson<RugSummary>(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, { retries: 1 });
  } catch {
    /* la source manquante est signalée dans le rapport */
  }
  return solanaReportFrom(gp, rug);
}
