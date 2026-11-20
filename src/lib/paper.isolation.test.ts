// Le papier ne se mélange jamais au réel : seuls le Labo, le stockage, la synchronisation et le serveur lisent ses données.
// Un écran ou un calcul du vrai portefeuille (Wallet, Cockpit, conseils, fiscalité) qui y toucherait fait échouer ce test.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(__dirname, '..');
const ALLOWED = new Set([
  'hooks/useAutopilot.ts', 'hooks/usePaperSettle.ts', 'lib/backup.ts', 'lib/lab/compact.ts', 'lib/sync/merge.ts', 'pages/Paper.tsx',
  'pages/labo/ArenaTab.tsx', 'pages/labo/Autopilots.tsx', 'pages/labo/CopyQueue.tsx', 'pages/labo/OrderTicket.tsx', 'pages/labo/Portfolios.tsx', 'pages/labo/PaperTestButton.tsx',
  'runner/autopilot.ts', 'runner/brief.ts', 'runner/cycle.ts', 'runner/evaluate.ts', 'store/persistence.ts', 'store/useStore.ts',
]);
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

describe('le papier reste à part', () => {
  it('aucun écran ni calcul du vrai portefeuille ne lit les données du papier', () => {
    const readers = files(ROOT)
      .filter((f) => /paperTrades|paperDays|paperPortfolios|paperOrders/.test(readFileSync(f, 'utf-8')))
      .map((f) => relative(ROOT, f).split(sep).join('/'));
    expect(readers.filter((f) => !ALLOWED.has(f))).toEqual([]);
    for (const f of ['lib/holdings.ts', 'lib/portfolio.ts', 'lib/tax.ts', 'hooks/useGuidance.ts', 'hooks/usePortfolio.ts']) expect(readers).not.toContain(f);
  });
});
