// Pont avec Grok : prépare le prompt, relit la réponse et contrôle chaque ordre avec les règles du panier.

import { Copy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { useFearGreed, useMarkets } from '../hooks/useMarket';
import type { useBasket } from '../hooks/useBasket';
import { buildGrokPrompt, checkGrokOrders, parseGrokReply, type CheckStatus, type GrokCheck, type GrokReply } from '../lib/grok';
import type { PlannedOrder } from '../lib/basket';
import { fmtNum, isoDay } from '../lib/format';
import { runGrokExtract } from '../ai/tasks';
import { useAiConfig } from './AiBlocks';
import { Badge, Banner, Button, Modal, Segmented, Textarea } from './ui';

const TONE: Record<CheckStatus, 'up' | 'warn' | 'down'> = { ok: 'up', warn: 'warn', fix: 'down' };
const LABEL: Record<CheckStatus, string> = { ok: 'OK', warn: 'Avertissement', fix: 'À corriger' };

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function GrokBridge({ open, onClose, b, onUseOrders }: { open: boolean; onClose: () => void; b: ReturnType<typeof useBasket>; onUseOrders: (orders: PlannedOrder[]) => void }) {
  const cfg = useAiConfig();
  const setBasket = useStore((s) => s.setBasket);
  const fng = useFearGreed(2);
  const markets = useMarkets();
  const [tab, setTab] = useState<'prompt' | 'reply'>('prompt');
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  const [reply, setReply] = useState<GrokReply | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bk = b.basket;
  const resultRef = useRef<HTMLDivElement>(null);

  const prompt = useMemo(() => {
    if (!bk) return '';
    const total = b.holdings.reduce((s, h) => s + h.valueUsd, 0);
    const bySymbol = new Map<string, number>();
    for (const h of b.holdings) bySymbol.set(h.symbol, (bySymbol.get(h.symbol) ?? 0) + h.valueUsd);
    const btc = markets.data?.find((m) => m.id === 'bitcoin');
    return buildGrokPrompt({
      date: isoDay(),
      temperature: b.temperature,
      zone: b.cycle?.zone.label.toLowerCase() ?? 'inconnue',
      fng: fng.data?.[fng.data.length - 1]?.value ?? null,
      btcPriceUsd: btc?.current_price ?? null,
      btcBelowAthPct: btc?.ath_change_percentage ?? null,
      budgetUsd: bk.amountUsd,
      discoveryMaxPct: b.plan ? Math.round(b.plan.discoveryShare * 100) : bk.discoveryMaxPct,
      reserveUsd: bk.reserveUsd,
      positions: [...bySymbol.entries()].sort((x, y) => y[1] - x[1]).slice(0, 30).map(([symbol, valueUsd]) => ({ symbol, valueUsd, pct: total > 0 ? (valueUsd / total) * 100 : 0 })),
      core: bk.core.map((c) => ({ symbol: c.symbol.toUpperCase(), weight: c.weight })),
      discovery: bk.discovery.map((c) => c.symbol.toUpperCase()),
      minLinePct: b.ctx?.rules.minLinePct ?? 1,
      maxPerGemPct: b.ctx?.rules.maxPerGemPct ?? 3,
      minOrderUsd: bk.minOrderUsd,
    });
  }, [bk, b.holdings, b.temperature, b.cycle, b.plan, b.ctx, fng.data, markets.data]);

  const check: GrokCheck | null = useMemo(() => (reply && bk && b.ctx ? checkGrokOrders(reply, bk, b.ctx, b.known) : null), [reply, bk, b.ctx, b.known]);

  const hasCheck = !!reply && !!bk && !!b.ctx;
  useEffect(() => {
    if (hasCheck) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hasCheck, reply]);

  function analyse(raw = text) {
    setError('');
    const r = parseGrokReply(raw);
    if (!r) setError('Aucun bloc JSON exploitable dans cette réponse. Tu peux demander à l’IA de Boussole d’en extraire les ordres.');
    setReply(r);
  }

  async function extract() {
    if (!cfg) return;
    setBusy(true);
    setError('');
    try {
      analyse(await runGrokExtract(cfg, text));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction impossible.');
    } finally {
      setBusy(false);
    }
  }

  function useGrokOrders() {
    if (!check) return;
    const orders: PlannedOrder[] = [];
    for (const l of check.lines) {
      if (!l.coin) continue;
      orders.push({ coinId: l.coin.coinId, symbol: l.coin.symbol, name: l.coin.name, image: l.coin.image, usd: l.order.usd, kind: l.order.kind === 'discovery' ? 'discovery' : 'core', reason: l.order.reason || 'Proposé par Grok' });
    }
    onUseOrders(orders);
    onClose();
  }

  function applyList() {
    if (!bk || !reply) return;
    const coins = reply.discoveryList.map((s) => b.known[s]).filter((c): c is NonNullable<typeof c> => !!c).slice(0, 5);
    setBasket({ ...bk, discovery: coins.map((c) => ({ coinId: c.coinId, symbol: c.symbol, name: c.name, image: c.image })) });
  }

  const mine = new Set((b.plan?.orders ?? []).map((o) => o.symbol.toUpperCase()));
  const theirs = new Set((reply?.orders ?? []).map((o) => o.symbol.toUpperCase()));
  const onlyMine = [...mine].filter((s) => !theirs.has(s));
  const onlyTheirs = [...theirs].filter((s) => !mine.has(s));
  const unknownList = (reply?.discoveryList ?? []).filter((s) => !b.known[s]);

  return (
    <Modal open={open} onClose={onClose} wide title="Grok : un second avis" footer={<Button variant="primary" onClick={onClose}>Fermer</Button>}>
      <div className="space-y-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'prompt', label: '1. Préparer le prompt' }, { value: 'reply', label: '2. Coller la réponse' }]} />
        {tab === 'prompt' ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">Ce prompt contient tes positions, l’état du marché et tes règles du jour. Colle-le dans Grok, puis reviens coller sa réponse : Boussole la relit et contrôle chaque ordre.</p>
            <Textarea readOnly value={prompt} rows={14} className="font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Copy className="size-4" />} onClick={() => void copyText(prompt).then(setCopied)}>{copied ? 'Copié ✓' : 'Copier le prompt'}</Button>
              <Button onClick={() => setTab('reply')}>Passer à la réponse</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Colle ici la réponse complète de Grok…" />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={!text.trim()} onClick={() => analyse()}>Analyser la réponse</Button>
              {error && cfg && <Button loading={busy} disabled={!text.trim()} onClick={() => void extract()}>Extraire avec l’IA</Button>}
            </div>
            {error && <Banner tone="warn">{error}</Banner>}
            {reply && !check && <Banner tone="info">Réponse lue ({reply.orders.length} ordre{reply.orders.length > 1 ? 's' : ''}). Les données du panier sont encore en chargement : le contrôle s’affichera dès qu’elles seront prêtes.</Banner>}
            {reply && check && (
              <div ref={resultRef} className="space-y-3">
                {reply.market && <p className="text-sm text-ink-2">Marché selon Grok : {reply.market}</p>}
                <div className="flex flex-wrap items-center gap-2 text-sm"><Badge tone={TONE[check.status]}>{LABEL[check.status]}</Badge><span className="text-ink-2">{reply.orders.length} ordre{reply.orders.length > 1 ? 's' : ''} · total {fmtNum(check.totalUsd, 2)} USDC</span></div>
                {check.messages.map((m) => <Banner key={m} tone="warn">{m}</Banner>)}
                <ul className="space-y-2">
                  {check.lines.map((l, i) => (
                    <li key={`${l.order.symbol}-${i}`} className="rounded-lg border border-line p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{l.order.symbol}</span>
                        <Badge>{l.order.kind === 'core' ? 'Cœur' : l.order.kind === 'discovery' ? 'Découverte' : 'Type ?'}</Badge>
                        <span className="tnum text-ink">{fmtNum(l.order.usd, 2)} USDC</span>
                        <Badge tone={TONE[l.status]} className="ml-auto">{LABEL[l.status]}</Badge>
                      </div>
                      {l.order.reason && <p className="mt-1 text-xs text-ink-2">Grok : {l.order.reason}</p>}
                      {l.messages.map((m) => <p key={m} className={`text-xs ${l.status === 'fix' ? 'text-down' : 'text-muted'}`}>{m}</p>)}
                    </li>
                  ))}
                </ul>
                <div className="rounded-lg bg-surface-2 p-3 text-xs text-ink-2">
                  <p className="font-medium text-ink">Comparaison avec l’ordre de Boussole</p>
                  {!onlyMine.length && !onlyTheirs.length ? <p>Les deux proposent les mêmes cryptos.</p> : (
                    <>
                      {onlyMine.length > 0 && <p>Seulement chez Boussole : {onlyMine.join(', ')}.</p>}
                      {onlyTheirs.length > 0 && <p>Seulement chez Grok : {onlyTheirs.join(', ')}.</p>}
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={!check.lines.length || check.lines.some((l) => !l.coin)} onClick={useGrokOrders}>Enregistrer les ordres de Grok{check.status === 'fix' ? ' (hors règles)' : ''}</Button>
                  {reply.discoveryList.length > 0 && <Button disabled={unknownList.length === reply.discoveryList.length} onClick={applyList}>Mettre à jour ma liste découverte</Button>}
                </div>
                {unknownList.length > 0 && <p className="text-xs text-muted">Inconnues de Boussole (ignorées dans la liste) : {unknownList.join(', ')}.</p>}
                {reply.alerts.length > 0 && <div className="text-xs text-ink-2"><p className="font-medium text-ink">Alertes de Grok</p><ul className="list-disc pl-5">{reply.alerts.map((a) => <li key={a}>{a}</li>)}</ul></div>}
                {reply.unverified.length > 0 && <div className="text-xs text-ink-2"><p className="font-medium text-ink">Non vérifié par Grok</p><ul className="list-disc pl-5">{reply.unverified.map((a) => <li key={a}>{a}</li>)}</ul></div>}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
