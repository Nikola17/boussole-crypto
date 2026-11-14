// Détection de nouvelle version : le dépôt de sync contient « latestVersion.json », écrit à chaque
// publication (scripts/release.mjs). L'application le relit tranquillement (toutes les 6 h) avec ses
// identifiants de synchronisation déjà configurés — rien de nouveau à saisir, aucune clé ajoutée.

import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { fetchRaw } from '../lib/sync/github';

/** a est-il plus récent que b au sens « x.y.z » ? (retourne faux en cas de version illisible) */
export function isNewerVersion(a: string | null | undefined, b: string): boolean {
  const parse = (v: string): number[] => v.split('.').map((x) => Number(x) || 0);
  if (!a || !a.trim()) return false;
  const va = parse(a.trim().replace(/^v/, ''));
  const vb = parse(b.trim().replace(/^v/, ''));
  for (let i = 0; i < 3; i++) {
    if ((va[i] ?? 0) > (vb[i] ?? 0)) return true;
    if ((va[i] ?? 0) < (vb[i] ?? 0)) return false;
  }
  return false;
}

/** La dernière version publiée, si elle est plus récente que celle qui tourne (null sinon). */
export function useLatestVersion(): string | null {
  const { syncEnabled, syncRepo, syncToken } = useStore((s) => s.settings);
  const q = useQuery({
    queryKey: ['latest-version'],
    queryFn: async () => {
      const raw = await fetchRaw(syncRepo, 'latestVersion.json', syncToken);
      return raw ? (JSON.parse(raw) as { version?: string }) : null;
    },
    enabled: syncEnabled && !!syncRepo.trim() && !!syncToken.trim(),
    staleTime: 6 * 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
    retry: 0,
  });
  return q.data?.version && isNewerVersion(q.data.version, __APP_VERSION__) ? q.data.version : null;
}
