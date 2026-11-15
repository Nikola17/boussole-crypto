// Labo : le papier (ordres fictifs aux prix réels), les achats fantômes et le banc d'essai des signaux.
// Tout ce qui se passe ici reste fictif : le vrai portefeuille n'est jamais touché.

import { useMemo } from 'react';
import { PageHeader, Segmented } from '../components/ui';
import { setQuery, useHashPath } from '../router';
import { useMarkets } from '../hooks/useMarket';
import { GhostCard, PaperPanel } from './Paper';
import { BenchTab } from './labo/BenchTab';

type Tab = 'papier' | 'fantomes' | 'banc';

function Ghosts() {
  const markets = useMarkets();
  const prices = useMemo(() => new Map((markets.data ?? []).map((m) => [m.id, m.current_price])), [markets.data]);
  return <GhostCard prices={prices} />;
}

export default function Labo({ initialTab }: { initialTab?: Tab }) {
  const { query } = useHashPath();
  const tab = ((query.get('tab') as Tab | null) ?? initialTab ?? 'papier');
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Labo" subtitle="Teste sans risquer un euro : ordres fictifs aux prix réels, achats que tu n’as pas faits, et ce que valent vraiment les signaux de Boussole sur l’historique." />
      <Segmented value={tab} onChange={(v) => setQuery({ tab: v })} options={[
        { value: 'papier', label: 'Papier' },
        { value: 'fantomes', label: 'Achats fantômes' },
        { value: 'banc', label: 'Banc d’essai' },
      ]} />
      {tab === 'papier' && <PaperPanel />}
      {tab === 'fantomes' && <Ghosts />}
      {tab === 'banc' && <BenchTab />}
    </div>
  );
}
