// Lecture de fichiers CSV (guillemets, virgules dans les champs, fins de ligne Windows, BOM, séparateur , ; ou tabulation).

export interface CsvTable {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

function detectDelimiter(firstLine: string): string {
  const counts: [string, number][] = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** Découpe le texte en lignes de champs en respectant les guillemets. */
export function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const all = parseCsvRows(text, delimiter);
  if (!all.length) return { headers: [], rows: [], delimiter };
  const headers = all[0].map((h) => h.trim());
  const rows = all.slice(1).map((cells) => {
    const r: Record<string, string> = {};
    headers.forEach((h, i) => { r[h] = (cells[i] ?? '').trim(); });
    return r;
  });
  return { headers, rows, delimiter };
}

/** Nombre tolérant : « 1 234,56 », « 1,234.56 », « -0.5 », « 1e-7 ». NaN si illisible. */
export function parseNumber(s: string | undefined): number {
  if (s == null) return NaN;
  let t = s.trim().replace(/[\s  ]/g, '').replace(/[€$£]/g, '');
  if (!t) return NaN;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Le dernier séparateur est le séparateur décimal.
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // « 1,234 » (3 chiffres après la virgule et rien d'autre) reste ambigu : on suit le format de l'export (virgule décimale).
    t = t.replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
