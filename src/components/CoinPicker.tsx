// Sélecteur de crypto : recherche CoinGecko + raccourcis vers les plus grosses capitalisations.

import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useMarkets, useSearch } from '../hooks/useMarket';
import type { CoinRef } from '../types';
import { CoinIcon, Input, Spinner } from './ui';

export function CoinPicker({ value, onChange, placeholder = 'Rechercher une crypto (ex : Bitcoin, SOL)…' }: {
  value: CoinRef | null;
  onChange: (c: CoinRef) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const markets = useMarkets();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const local = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = markets.data ?? [];
    if (!s) return list.slice(0, 8);
    return list.filter((m) => m.symbol.toLowerCase() === s || m.name.toLowerCase().includes(s) || m.symbol.toLowerCase().startsWith(s)).slice(0, 8);
  }, [q, markets.data]);
  const remote = useSearch(local.length < 3 ? debounced : '');

  const options: CoinRef[] = useMemo(() => {
    const seen = new Set<string>();
    const out: CoinRef[] = [];
    for (const m of local) {
      seen.add(m.id);
      out.push({ coinId: m.id, symbol: m.symbol, name: m.name, image: m.image });
    }
    for (const c of remote.data ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ coinId: c.id, symbol: c.symbol, name: c.name, image: c.large || c.thumb });
    }
    return out.slice(0, 12);
  }, [local, remote.data]);

  return (
    <div className="relative">
      {value && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-left text-sm text-ink hover:bg-surface-3"
        >
          <CoinIcon src={value.image} symbol={value.symbol} size={20} />
          <span className="font-medium">{value.name}</span>
          <span className="text-muted">{value.symbol.toUpperCase()}</span>
          <span className="ml-auto text-xs text-accent">Changer</span>
        </button>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            autoFocus={open}
            className="pl-9"
            value={q}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          />
        </div>
      )}
      {open && (
        <div className="absolute left-0 right-0 top-11 z-30 max-h-72 overflow-y-auto rounded-lg border border-line bg-surface-2 p-1 shadow-[var(--shadow)]">
          {remote.isFetching && <div className="px-3 py-2"><Spinner label="Recherche…" /></div>}
          {options.map((o) => (
            <button
              key={o.coinId}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-3"
              onClick={() => { onChange(o); setOpen(false); setQ(''); }}
            >
              <CoinIcon src={o.image} symbol={o.symbol} size={20} />
              <span className="truncate text-ink">{o.name}</span>
              <span className="text-xs text-muted">{o.symbol.toUpperCase()}</span>
            </button>
          ))}
          {!options.length && !remote.isFetching && <p className="px-3 py-2 text-sm text-muted">Aucun résultat.</p>}
          <button type="button" className="mt-1 w-full rounded-md px-2.5 py-1.5 text-xs text-muted hover:bg-surface-3" onClick={() => setOpen(false)}>Fermer</button>
        </div>
      )}
    </div>
  );
}
