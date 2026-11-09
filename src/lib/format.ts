// Formatage FR (nombres, devises, pourcentages, dates)

export type Currency = 'EUR' | 'USD';

const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat('fr-FR', opts);

/** Nombre de décimales adapté au prix (les tokens à 0,00001 $ ont besoin de plus de précision). */
export function priceDigits(v: number): number {
  const a = Math.abs(v);
  if (a === 0 || !Number.isFinite(a)) return 2;
  if (a >= 1000) return 0;
  if (a >= 1) return 2;
  if (a >= 0.01) return 4;
  if (a >= 0.0001) return 6;
  return 8;
}

export function fmtPrice(v: number | null | undefined, currency: Currency = 'EUR'): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const d = priceDigits(v);
  return nf({ style: 'currency', currency, minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d }).format(v);
}

export function fmtMoney(v: number | null | undefined, currency: Currency = 'EUR', digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return nf({ style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

/** Montant compact : 1,2 k€ · 3,4 M€ · 1,1 Md€ */
export function fmtCompact(v: number | null | undefined, currency?: Currency): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  let n = v;
  let suffix = '';
  if (a >= 1e12) { n = v / 1e12; suffix = ' T'; }
  else if (a >= 1e9) { n = v / 1e9; suffix = ' Md'; }
  else if (a >= 1e6) { n = v / 1e6; suffix = ' M'; }
  else if (a >= 1e4) { n = v / 1e3; suffix = ' k'; }
  const digits = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2;
  const s = nf({ maximumFractionDigits: suffix ? digits : 0 }).format(n);
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '';
  return `${s}${suffix}${sym ? (suffix ? sym : ' ' + sym) : ''}`.replace('  ', ' ');
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return nf({ maximumFractionDigits: digits }).format(v);
}

export function fmtQty(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const d = a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.001 ? 6 : 8;
  return nf({ maximumFractionDigits: d }).format(v);
}

export function fmtPct(v: number | null | undefined, digits = 1, signed = true): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  return `${signed && v > 0 ? '+' : ''}${s} %`;
}

export function fmtDate(d: string | number | Date | null | undefined, withTime = false): string {
  if (d == null) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function fmtRelative(d: string | number | Date): string {
  const date = d instanceof Date ? d : new Date(d);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`;
  if (diff < 86400 * 30) return `il y a ${Math.round(diff / 86400)} j`;
  return fmtDate(date);
}

export function fmtAge(hours: number): string {
  if (!Number.isFinite(hours)) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  if (hours < 24 * 60) return `${Math.round(hours / 24)} j`;
  return `${Math.round(hours / 24 / 30)} mois`;
}

/** Date locale AAAA-MM-JJ (pour les inputs type=date et les clés journalières). */
export function isoDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function shortAddress(a: string): string {
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
