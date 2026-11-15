// « Tester sur papier » : le plan de trade (entrée au marché, stop, objectif 3 R) passé dans le portefeuille
// papier manuel, avec stop et objectif attachés. Rien ne touche au vrai portefeuille.

import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { paperTestOrder } from '../../lib/lab/tradeCheck';
import { Button } from '../../components/ui';
import type { CoinRef } from '../../types';

export function PaperTestButton({ coin, plan, usd, marketUsd }: { coin: CoinRef; plan: { entry: number; stop: number; tp2: number } | null; usd: number; marketUsd: number | null }) {
  const portfolios = useStore((s) => s.paperPortfolios);
  const trades = useStore((s) => s.paperTrades);
  const addTrade = useStore((s) => s.upsertPaperTrade);
  const upsertOrder = useStore((s) => s.upsertPaperOrder);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const manuel = portfolios.find((p) => p.id === 'manuel') ?? portfolios.find((p) => p.kind === 'manual' && !p.archived);
  if (!plan || !manuel || !marketUsd) return null;
  const go = () => {
    const r = paperTestOrder(manuel, trades, coin, plan, Math.round(usd * 100) / 100, marketUsd, new Date().toISOString());
    if (!r.trade) { setMsg({ ok: false, text: r.error ?? 'Ordre impossible.' }); return; }
    addTrade(r.trade);
    for (const o of r.orders) upsertOrder(o);
    setMsg({ ok: true, text: `Acheté sur « ${manuel.name} » avec stop et objectif attachés : suis-le dans Labo → Papier.` });
  };
  return (
    <span className="inline-flex flex-col gap-1">
      <Button size="sm" icon={<FlaskConical className="size-3.5" />} onClick={go}>Tester sur papier ({Math.round(usd)} USDC)</Button>
      {msg && <span className={`text-xs ${msg.ok ? 'text-good' : 'text-critical'}`}>{msg.text}</span>}
    </span>
  );
}
