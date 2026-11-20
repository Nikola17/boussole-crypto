// Garde-fou Zustand v5 + React 19 : un sélecteur useStore() qui renvoie un nouveau tableau/objet
// à chaque appel (.filter, .map, .slice, .sort…) provoque une boucle infinie (React error #185).

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const UNSTABLE_SELECTOR = /useStore\([^)]*=>[^\n]*(\.filter\(|\.map\(|\.sort\(|\.slice\(|\?\?\s*\[|\?\?\s*\{)/;

describe('Zustand v5 selector stability', () => {
  it('interdit les sélecteurs useStore() qui allouent un nouveau tableau/objet à chaque rendu', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const bad: string[] = [];
    for (const file of walk(srcDir)) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (UNSTABLE_SELECTOR.test(line)) {
          bad.push(`${path.relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});
