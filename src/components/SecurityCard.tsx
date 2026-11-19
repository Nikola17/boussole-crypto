// Carte « Sécurité des wallets » : approvals ERC-20 actifs à risque (illimités vers des contrats
// inconnus) lus sans clé API (Blockscout + RPC publics). Boussole ne signe jamais de révocation.

import { ExternalLink, ShieldAlert } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { getEvmApprovals } from '../api/approvals';
import { shortAddress } from '../lib/format';
import { openExternal } from '../lib/platform';
import { Badge, Banner, Card, Spinner } from './ui';

export function SecurityCard() {
  const wallets = useStore((s) => s.wallets.filter((w) => w.chain === 'evm'));
  const results = useQueries({
    queries: wallets.map((w) => ({
      queryKey: ['approvals', w.id, w.address, (w.evmChains ?? []).join(',')],
      queryFn: () => getEvmApprovals(w.address, w.evmChains?.length ? w.evmChains : ['ethereum', 'base', 'arbitrum']),
      staleTime: 30 * 60_000,
      retry: 1,
    })),
  });

  if (!wallets.length) return null;

  const loading = results.some((r) => r.isLoading);
  const all = results.flatMap((r) => r.data?.approvals ?? []);
  const risky = all.filter((a) => a.risky);
  const errors = results.flatMap((r) => r.data?.errors ?? []);

  return (
    <Card title={<span className="inline-flex items-center gap-2"><ShieldAlert className="size-4 text-accent" />Autorisations de tes wallets (EVM)</span>} subtitle="Approvals détectés sur tes ~150 dernières transactions sortantes (Blockscout + RPC publics), sans clé API">
      <Banner tone="info" title="Boussole ne révoque rien">
        Une révocation est une transaction signée par TON wallet (sur <button type="button" className="text-accent underline" onClick={() => openExternal('https://revoke.cash')}>revoke.cash</button> ou l’interface du protocole). Boussole liste seulement ce qui est actif et dangereux.
      </Banner>
      {loading && <div className="mt-3"><Spinner label="Lecture des approvals (Blockscout + RPC)…" /></div>}
      {!!errors.length && !loading && <p className="mt-3 text-xs text-warn">{errors.join(' · ')}</p>}
      {!loading && risky.length === 0 && <p className="mt-3 text-sm text-muted">Aucune autorisation illimitée (ou très large) vers un contrat inconnu. Tes wallets EVM sont propres.</p>}
      <ul className="mt-3 divide-y divide-line">
        {risky.slice(0, 12).map((a) => (
          <li key={`${a.chain}:${a.token}:${a.spender}`} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <span className="font-medium text-ink">{a.tokenSymbol ?? shortAddress(a.token)}</span>
              <span className="ml-2 text-xs text-muted">{a.chain}</span>
              <div className="text-xs text-ink-2">autorise {shortAddress(a.spender)} à dépenser {a.unlimited ? 'un montant illimité' : `${Math.round((a.human ?? 0)).toLocaleString('fr-FR')} ${a.tokenSymbol ?? ''}`}</div>
            </div>
            <Badge tone="down">À révoquer</Badge>
          </li>
        ))}
      </ul>
      {!loading && all.length > risky.length && <p className="mt-2 text-xs text-muted">{all.length - risky.length} autre(s) autorisation(s) active(s) vers des routeurs connus ou des montants limités.</p>}
      <p className="mt-3 text-xs text-muted">Vérification manuelle : <button type="button" className="inline-flex items-center gap-1 text-accent hover:underline" onClick={() => openExternal('https://revoke.cash')}>revoke.cash <ExternalLink className="size-3" /></button></p>
    </Card>
  );
}
