// Pastille « disponible sur Crypto.com » (liste publique de l'Exchange, ou confirmation faite dans l'application).

import { Check } from 'lucide-react';
import type { CdcStatus } from '../lib/availability';
import { Badge } from './ui';

export function CdcBadge({ status, ready = true }: { status: CdcStatus; ready?: boolean }) {
  if (!ready) return null;
  if (status === 'app') {
    return <span title="Tu as confirmé la voir dans l'application Crypto.com"><Badge tone="up" icon={<Check className="size-3" aria-hidden />}>Crypto.com</Badge></span>;
  }
  if (status === 'exchange') {
    return <span title="Listée sur Crypto.com Exchange : très probablement achetable dans l'application"><Badge tone="up">Crypto.com</Badge></span>;
  }
  return <span title="Absente de la liste de Crypto.com Exchange : vérifie dans l'application avant d'acheter"><Badge tone="warn">Hors Crypto.com ?</Badge></span>;
}
