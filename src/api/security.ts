// Scan de sécurité des tokens : GoPlus (EVM & Solana) et RugCheck (Solana).
// Objectif : repérer honeypots, taxes cachées, mint illimité, liquidité non verrouillée...

import { getJson } from './http';

export interface SecurityFlag {
  label: string;
  severity: 'ok' | 'warn' | 'danger';
  detail?: string;
}

export interface SecurityReport {
  score: number; // 0-100, 100 = aucun signal d'alerte détecté
  verdict: 'Plutôt sain' | 'Prudence' | 'Danger';
  flags: SecurityFlag[];
  top10HoldersPct: number | null;
  holders: number | null;
  sources: string[];
}

type Bit = '0' | '1' | undefined | null | string;
const on = (v: Bit) => v === '1';

interface GoPlusEvm {
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

function finalize(flags: SecurityFlag[], top10: number | null, holders: number | null, sources: string[]): SecurityReport {
  let score = 100;
  for (const f of flags) score -= f.severity === 'danger' ? 35 : f.severity === 'warn' ? 12 : 0;
  score = Math.max(0, score);
  const hasDanger = flags.some((f) => f.severity === 'danger');
  return {
    score,
    verdict: hasDanger || score < 40 ? 'Danger' : score < 75 ? 'Prudence' : 'Plutôt sain',
    flags,
    top10HoldersPct: top10,
    holders,
    sources,
  };
}

export async function scanEvm(chainId: string, address: string): Promise<SecurityReport> {
  const addr = address.toLowerCase();
  const r = await getJson<{ code: number; result: Record<string, GoPlusEvm> }>(
    `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${addr}`,
  );
  const d = r.result?.[addr];
  if (!d) throw new Error('GoPlus ne connaît pas encore ce token (trop récent ?).');
  const flags: SecurityFlag[] = [];
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
    if (lockedPct < 50) flags.push({ label: `Liquidité verrouillée/brûlée : ${lockedPct.toFixed(0)} % seulement`, severity: 'warn' });
    else flags.push({ label: `Liquidité verrouillée/brûlée : ${lockedPct.toFixed(0)} %`, severity: 'ok' });
  }
  if (!flags.some((f) => f.severity !== 'ok')) flags.push({ label: 'Aucun piège classique détecté', severity: 'ok' });
  return finalize(flags, holders.length ? top10 : null, d.holder_count ? Number(d.holder_count) : null, ['GoPlus Security']);
}

interface GoPlusSol {
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

interface RugSummary {
  score?: number;
  score_normalised?: number;
  risks?: { name: string; description: string; level: string; value?: string }[];
  lpLockedPct?: number;
}

export async function scanSolana(mint: string): Promise<SecurityReport> {
  const flags: SecurityFlag[] = [];
  const sources: string[] = [];
  let top10: number | null = null;
  let gotSomething = false;

  try {
    const r = await getJson<{ result: Record<string, GoPlusSol> }>(`https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${mint}`, { retries: 1 });
    const d = r.result?.[mint] ?? Object.values(r.result ?? {})[0];
    if (d) {
      gotSomething = true;
      sources.push('GoPlus Security');
      if (on(d.mintable?.status)) flags.push({ label: 'Autorité de mint active : offre illimitée possible', severity: 'danger' });
      if (on(d.freezable?.status)) flags.push({ label: 'Autorité de gel active : tes tokens peuvent être bloqués', severity: 'danger' });
      if (on(d.balance_mutable_authority?.status)) flags.push({ label: 'Les soldes peuvent être modifiés', severity: 'danger' });
      if (on(d.closable?.status)) flags.push({ label: 'Le compte du token peut être fermé', severity: 'warn' });
      if (on(d.metadata_mutable?.status)) flags.push({ label: 'Métadonnées modifiables', severity: 'warn' });
      if (on(d.non_transferable as Bit)) flags.push({ label: 'Token non transférable', severity: 'danger' });
      const holders = d.holders ?? [];
      if (holders.length) {
        top10 = holders.slice(0, 10).filter((h) => !h.is_locked).reduce((s, h) => s + Number(h.percent || 0) * 100, 0);
        if (top10 > 50) flags.push({ label: `Top 10 détenteurs : ${top10.toFixed(0)} %`, severity: 'danger' });
        else if (top10 > 30) flags.push({ label: `Top 10 détenteurs : ${top10.toFixed(0)} %`, severity: 'warn' });
      }
    }
  } catch {
    /* on tente RugCheck */
  }

  try {
    const r = await getJson<RugSummary>(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, { retries: 1 });
    gotSomething = true;
    sources.push('RugCheck');
    for (const risk of r.risks ?? []) {
      const sev: SecurityFlag['severity'] = risk.level === 'danger' ? 'danger' : 'warn';
      if (!flags.some((f) => f.label.toLowerCase().includes(risk.name.toLowerCase().slice(0, 8)))) {
        flags.push({ label: risk.name, severity: sev, detail: risk.description });
      }
    }
    if (r.lpLockedPct != null) {
      flags.push({
        label: `Liquidité verrouillée : ${r.lpLockedPct.toFixed(0)} %`,
        severity: r.lpLockedPct >= 80 ? 'ok' : r.lpLockedPct >= 30 ? 'warn' : 'warn',
      });
    }
  } catch {
    /* ignore */
  }
  if (!gotSomething) throw new Error('Scan indisponible pour ce token pour le moment.');
  if (!flags.some((f) => f.severity !== 'ok')) flags.push({ label: 'Aucun piège classique détecté', severity: 'ok' });
  return finalize(flags, top10, null, sources);
}
