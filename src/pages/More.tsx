// « Plus » : les rubriques sorties du menu principal (rendement et DeFi, guide et profil, réglages),
// et un rappel de l'endroit où vivent désormais Smart money et Airdrops.

import { ChevronRight, Coins, Gift, GraduationCap, Settings, Users } from 'lucide-react';
import { Link } from '../router';
import { PageHeader } from '../components/ui';
import { MonthlyReportCard } from '../components/MonthlyReportCard';
import { EventsWatch } from '../components/EventsWatch';

const ITEMS = [
  { to: '/defi', label: 'Rendement & DeFi', hint: 'Staking, prêts, pools : ce que rapporte ton portefeuille, et à quel risque', icon: Coins },
  { to: '/guide', label: 'Guide & profil', hint: 'Ton profil d’investisseur, tes règles et le guide de Boussole', icon: GraduationCap },
  { to: '/reglages', label: 'Réglages', hint: 'Clés, synchronisation, notifications, sauvegardes', icon: Settings },
  { to: '/pepites?tab=smart', label: 'Smart money', hint: 'Dans Pépites : les wallets suivis et leur note', icon: Users },
  { to: '/pepites?tab=airdrops', label: 'Airdrops', hint: 'Dans Pépites : protocoles à farmer et tâches', icon: Gift },
];

export default function More() {
  return (
    <div className="space-y-4">
      <PageHeader title="Plus" subtitle="Les autres rubriques de Boussole" />
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {ITEMS.map((x) => (
          <li key={x.to}>
            <Link to={x.to} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
              <x.icon className="size-5 shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{x.label}</span>
                <span className="block text-xs text-muted">{x.hint}</span>
              </span>
              <ChevronRight className="size-4 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <EventsWatch />
      <MonthlyReportCard />
    </div>
  );
}
