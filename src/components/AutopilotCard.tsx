// Cockpit : les autopilotes, leurs derniers ordres et leur verdict de confiance (masquée s'il n'y en a aucun).

import { Bot } from 'lucide-react';
import { Card } from './ui';
import { Link } from '../router';
import { AutopilotSummary, useActiveAutopilots } from '../pages/labo/Autopilots';

export function AutopilotCard() {
  const autos = useActiveAutopilots();
  if (!autos.length) return null;
  return (
    <Card title={<span className="inline-flex items-center gap-2"><Bot className="size-4 text-accent" />Autopilotes (papier)</span>} subtitle="Ce que Boussole aurait fait seule, et si elle mérite ta confiance" actions={<Link to="/labo" className="text-xs font-medium text-accent hover:underline">Ouvrir le Labo</Link>}>
      <ul className="divide-y divide-line">{autos.map((p) => <AutopilotSummary key={p.id} p={p} />)}</ul>
    </Card>
  );
}
