// Formulaires (fenêtres modales) partagés : transaction, plan DCA, alerte de prix, trade.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { useCycle, useEurUsdHistory, useFx, useMarkets } from '../hooks/useMarket';
import { usePortfolio } from '../hooks/usePortfolio';
import { FREQUENCY_LABEL, STRATEGY_HELP, STRATEGY_LABEL, type DcaStrategy, type Frequency } from '../lib/dca';
import { fmtMoney, fmtNum, isoDay, uid } from '../lib/format';
import { isStable } from '../lib/portfolio';
import { eurPerUsdOn, FALLBACK_EUR_PER_USD } from '../lib/fx';
import { outsideDcaCheck, impulseVerdict, FOMO_WAIT_MS } from '../lib/rules';
import type { CoinRef, DcaPlan, PriceAlert, TradeEntry, Transaction, TxType } from '../types';
import type { Currency } from '../lib/format';
import { CoinPicker } from './CoinPicker';
import { Banner, Button, Field, Input, Modal, NumberInput, Select, Textarea, Toggle } from './ui';

function usePriceOf(coinId: string | undefined): number | null {
  const markets = useMarkets();
  if (!coinId) return null;
  return markets.data?.find((m) => m.id === coinId)?.current_price ?? null;
}

// ------------------------------------------------------------------ Transaction

export function TransactionModal({ open, onClose, initial, presetCoin, presetType }: {
  open: boolean; onClose: () => void; initial?: Transaction | null; presetCoin?: CoinRef | null; presetType?: TxType;
}) {
  const upsert = useStore((s) => s.upsertTransaction);
  const accounts = useStore((s) => s.accounts);
  const currencyPref = useStore((s) => s.settings.currency);
  const impulseWaits = useStore((s) => s.impulseWaits);
  const upsertImpulseWait = useStore((s) => s.upsertImpulseWait);
  const fx = useFx();
  const pf = usePortfolio();
  const [coin, setCoin] = useState<CoinRef | null>(null);
  const [type, setType] = useState<TxType>('buy');
  const [date, setDate] = useState(isoDay());
  const [quantity, setQuantity] = useState<number | ''>('');
  const [price, setPrice] = useState<number | ''>('');
  const [total, setTotal] = useState<number | ''>('');
  const [currency, setCurrency] = useState<Currency>(currencyPref);
  const [fee, setFee] = useState<number | ''>(0);
  const [fiat, setFiat] = useState(true);
  const [pv, setPv] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [account, setAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const livePrice = usePriceOf(coin?.coinId);
  const cycle = useCycle();
  // Une opération passée reçoit le taux EUR/USD de SON jour (et non celui d'aujourd'hui) : sinon son coût en euros est faux.
  // Une transaction modifiée garde son taux, sauf si sa date change : elle prend alors celui de sa nouvelle date.
  const dateChanged = !initial || date !== initial.date;
  const eurUsdHistory = useEurUsdHistory(open && dateChanged && date !== isoDay());
  const fxForDate = date === isoDay() ? fx : eurPerUsdOn(date, eurUsdHistory.data, fx);
  const reserveUsd = useStore((s) => s.basket?.reserveUsd ?? null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setCoin({ coinId: initial.coinId, symbol: initial.symbol, name: initial.name, image: initial.image });
      setType(initial.type);
      setDate(initial.date);
      setQuantity(initial.quantity);
      setPrice(initial.price);
      setTotal(Math.round(initial.quantity * initial.price * 100) / 100);
      setCurrency(initial.currency);
      setFee(initial.fee);
      setFiat(initial.type === 'sell' ? initial.toFiat !== false : initial.fromFiat !== false);
      setPv(initial.portfolioValueEur ?? '');
      setNote(initial.note ?? '');
      setAccount(initial.accountId ?? '');
      setToAccount(initial.toAccountId ?? '');
    } else {
      setCoin(presetCoin ?? null);
      setType(presetType ?? 'buy');
      setDate(isoDay());
      setQuantity('');
      setPrice('');
      setTotal('');
      setCurrency(currencyPref);
      setFee(0);
      setFiat(true);
      setPv('');
      setNote('');
      setAccount('');
      setToAccount('');
    }
  }, [open, initial, presetCoin, presetType, currencyPref]);

  // Pré-remplit (une seule fois par crypto et par devise) le prix du marché du jour
  const prefilled = useRef('');
  useEffect(() => {
    if (!open) { prefilled.current = ''; return; }
    if (initial || livePrice == null || !coin) return;
    const key = `${coin.coinId}|${currency}`;
    if (prefilled.current === key) return;
    prefilled.current = key;
    const p = currency === 'EUR' ? livePrice * fx : livePrice;
    setPrice(Math.round(p * 1e6) / 1e6);
    if (quantity !== '') setTotal(Math.round(Number(quantity) * p * 100) / 100);
  }, [open, initial, livePrice, currency, fx, coin, quantity]);

  // Valeur globale du portefeuille (€) pré-remplie pour une vente du jour
  useEffect(() => {
    if (open && type === 'sell' && fiat && pv === '' && date === isoDay() && pf.totals.value > 0) {
      const eur = currencyPref === 'EUR' ? pf.totals.value : pf.totals.value * fx;
      setPv(Math.round(eur));
    }
  }, [open, type, fiat, pv, date, pf.totals.value, currencyPref, fx]);

  const onQty = (v: number | '') => {
    setQuantity(v);
    if (v !== '' && price !== '') setTotal(Math.round(v * price * 100) / 100);
  };
  const onPrice = (v: number | '') => {
    setPrice(v);
    if (v !== '' && quantity !== '') setTotal(Math.round(quantity * v * 100) / 100);
  };
  const onTotal = (v: number | '') => {
    setTotal(v);
    if (v !== '' && price !== '' && price > 0) setQuantity(Math.round((v / price) * 1e8) / 1e8);
  };

  // Règle de ta stratégie : un achat hors DCA n'est autorisé qu'avec la réserve d'USDC et si le marché a vraiment peur.
  const totalUsd = total === '' ? 0 : currency === 'EUR' ? Number(total) / (fx || FALLBACK_EUR_PER_USD) : Number(total);
  const outside = !initial && type === 'buy' && coin && !isStable(coin.symbol, coin.coinId) && date === isoDay()
    ? outsideDcaCheck({ temperature: cycle.data?.temperature ?? null, reserveUsd, amountUsd: totalUsd })
    : null;

  // Règle des 24 h anti-FOMO : une crypto qui a pris +50 % en 7 jours ne s'achète pas dans la minute.
  const markets = useMarkets();
  const change7d = coin ? markets.data?.find((m) => m.id === coin.coinId)?.price_change_percentage_7d_in_currency ?? null : null;
  const impulseGate = !!coin && !initial && type === 'buy' && !isStable(coin.symbol, coin.coinId) && date === isoDay();
  const existingWait = impulseGate ? impulseWaits.find((w) => w.coinId === coin?.coinId) : undefined;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!impulseGate) return;
    const i = setInterval(() => tick((n) => n + 1), 30_000); // le décompte bouge tout seul tant qu'on regarde
    return () => clearInterval(i);
  }, [impulseGate]);
  const impulse = impulseGate ? impulseVerdict(change7d, existingWait, Date.now()) : null;

  const valid = coin && quantity !== '' && quantity > 0 && (type === 'transfer' ? !!account && !!toAccount && account !== toAccount : price !== '' && price >= 0);

  function startWait() {
    if (!coin) return;
    upsertImpulseWait({
      id: uid(),
      coinId: coin.coinId, symbol: coin.symbol, name: coin.name,
      change7dPct: change7d ?? undefined,
      createdAt: new Date().toISOString(),
      unlockAt: new Date(Date.now() + FOMO_WAIT_MS).toISOString(),
    });
  }

  function save() {
    if (!valid || !coin) return;
    if (impulse?.blocked) return; // la règle garde la main même face à un clic pressé
    const tx: Transaction = {
      id: initial?.id ?? uid(),
      ...coin,
      date,
      type,
      quantity: Number(quantity),
      price: Number(price),
      currency,
      fee: Number(fee || 0),
      fxEurPerUsd: initial && !dateChanged ? initial.fxEurPerUsd : fxForDate,
      fromFiat: type === 'buy' || type === 'deposit' ? fiat : undefined,
      toFiat: type === 'sell' ? fiat : undefined,
      portfolioValueEur: type === 'sell' && fiat && pv !== '' ? Number(pv) : undefined,
      source: initial?.source ?? 'manual',
      note: note.trim() || undefined,
      // Horodatage de toute saisie du jour : l'ordre des opérations d'une même journée (achat avant vente) en dépend.
      time: initial && !dateChanged ? initial.time : (date === isoDay() ? new Date().toISOString() : undefined),
      accountId: account || undefined,
      toAccountId: type === 'transfer' ? toAccount : undefined,
    };
    upsert(tx);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Modifier la transaction' : 'Nouvelle transaction'} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button>{impulse?.blocked && !impulse.started ? (
      <Button variant="secondary" disabled={!coin} onClick={startWait}>Poser le délai de 24 h</Button>
    ) : (
      <Button variant="primary" disabled={!valid || !!impulse?.blocked} onClick={save}>Enregistrer</Button>
    )}</>}>
      <div className="space-y-3">
        <Field label="Crypto"><CoinPicker value={coin} onChange={setCoin} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as TxType)}>
              <option value="buy">Achat</option>
              <option value="sell">Vente</option>
              <option value="deposit">Dépôt (déjà détenu)</option>
              <option value="withdraw">Retrait / envoi</option>
              <option value="reward">Récompense (staking, airdrop)</option>
              {accounts.length > 1 && <option value="transfer">Transfert entre mes comptes</option>}
            </Select>
          </Field>
          <Field label="Date"><Input type="date" value={date} max={isoDay()} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantité"><NumberInput value={quantity} onChange={onQty} placeholder="0,05" /></Field>
          {type !== 'transfer' && <><Field label="Devise">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="EUR">Euro (€)</option>
              <option value="USD">Dollar ($)</option>
            </Select>
          </Field>
          <Field label={`Prix unitaire (${currency === 'EUR' ? '€' : '$'})`} hint={type === 'reward' ? 'Laisse 0 pour une récompense.' : 'Prérempli avec le cours actuel.'}><NumberInput value={price} onChange={onPrice} /></Field>
          <Field label={`Montant total (${currency === 'EUR' ? '€' : '$'})`}><NumberInput value={total} onChange={onTotal} /></Field>
          <Field label="Frais"><NumberInput value={fee} onChange={setFee} /></Field></>}
        </div>
        {type === 'transfer' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Depuis"><Select value={account} onChange={(e) => setAccount(e.target.value)}><option value="">Choisir…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
              <Field label="Vers"><Select value={toAccount} onChange={(e) => setToAccount(e.target.value)}><option value="">Choisir…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            </div>
            <p className="text-xs text-muted">Un transfert déplace tes cryptos d’un compte à un autre sans changer ton prix d’achat.</p>
          </>
        ) : accounts.length > 0 && (
          <Field label="Compte"><Select value={account} onChange={(e) => setAccount(e.target.value)}><option value="">Aucun compte précis</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        )}
        {(type === 'buy' || type === 'deposit') && (
          <Toggle checked={fiat} onChange={setFiat} label="Payé en monnaie classique (€/$)" hint="Décoche si tu as échangé une autre crypto : c'est neutre fiscalement et n'augmente pas ton prix d'acquisition." />
        )}
        {type === 'sell' && (
          <>
            <Toggle checked={fiat} onChange={setFiat} label="Converti en euros/dollars (vente imposable)" hint="Décoche s'il s'agit d'un échange contre une autre crypto (non imposable en France)." />
            {fiat && (
              <Field label="Valeur totale de ton portefeuille crypto au moment de la vente (€)" hint="Nécessaire au calcul officiel de la plus-value (formule 150 VH bis). Préremplie avec la valeur actuelle pour une vente du jour.">
                <NumberInput value={pv} onChange={setPv} />
              </Field>
            )}
          </>
        )}
        <Field label="Note (facultatif)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Plateforme, raison de l'achat…" /></Field>
        {outside && !outside.allowed && (
          <Banner tone="warn" title="Achat hors DCA : ta règle dit non">
            Ta stratégie n’autorise un achat hors DCA qu’avec la réserve d’USDC et quand le marché a vraiment peur : {outside.reasons.join(' ; ')}. Tu peux l’enregistrer, mais demande-toi si ce n’est pas du FOMO.
          </Banner>
        )}
        {impulse && impulse.blocked && !impulse.started && (
          <Banner tone="warn" title="Règle des 24 h : cette montée demande un délai">
            {coin?.name} a pris +{fmtNum(change7d ?? 0)} % en 7 jours. Ta stratégie impose 24 h de réflexion avant d’acheter pareil mouvement : pose le délai, reviens demain à la même heure. Il arrive souvent que l’envie soit passée — c’est le but.
          </Banner>
        )}
        {impulse && impulse.blocked && impulse.started && (
          <Banner tone="warn" title={`Attente posée — achat possible dans environ ${impulse.hoursLeft} h`}>
            Le délai expire {new Date(impulse.unlockAt ?? '').toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}. La fenêtre reste ouverte : tu peux revenir la remplir, ou la fermer et laisser tomber — ça compte aussi.
          </Banner>
        )}
        {impulse && !impulse.blocked && impulse.started && (
          <Banner tone="info" title="24 h de réflexion écoulées">
            Tu peux enregistrer maintenant. Si tu ne le fais pas, c’est que la règle a fait son travail.
          </Banner>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Plan DCA

export function DcaPlanModal({ open, onClose, initial, presetCoin }: { open: boolean; onClose: () => void; initial?: DcaPlan | null; presetCoin?: CoinRef | null }) {
  const upsert = useStore((s) => s.upsertDcaPlan);
  const currency = useStore((s) => s.settings.currency);
  const budget = useStore((s) => s.profile.monthlyBudget);
  const [coin, setCoin] = useState<CoinRef | null>(null);
  const [amount, setAmount] = useState<number | ''>(50);
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(5);
  const [strategy, setStrategy] = useState<DcaStrategy>('fear_greed');
  const [startDate, setStartDate] = useState(isoDay());
  const [reminder, setReminder] = useState(true);
  const [exchange, setExchange] = useState('');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setCoin({ coinId: initial.coinId, symbol: initial.symbol, name: initial.name, image: initial.image });
      setAmount(initial.amount);
      setFrequency(initial.frequency);
      setDayOfWeek(initial.dayOfWeek ?? 1);
      setDayOfMonth(initial.dayOfMonth ?? 5);
      setStrategy(initial.strategy);
      setStartDate(initial.startDate);
      setReminder(initial.reminder);
      setExchange(initial.exchange ?? '');
    } else {
      setCoin(presetCoin ?? null);
      setAmount(Math.max(10, Math.round((budget || 100) / 4)));
      setFrequency('weekly');
      setStrategy('fear_greed');
      setStartDate(isoDay());
      setReminder(true);
      setExchange('');
    }
  }, [open, initial, presetCoin, budget]);

  const monthly = amount === '' ? 0 : frequency === 'daily' ? amount * 30 : frequency === 'weekly' ? amount * 4.33 : frequency === 'biweekly' ? amount * 2.17 : amount;

  function save() {
    if (!coin || amount === '' || amount <= 0) return;
    upsert({
      id: initial?.id ?? uid(),
      ...coin,
      amount: Number(amount),
      frequency,
      dayOfWeek: frequency === 'weekly' || frequency === 'biweekly' ? dayOfWeek : undefined,
      dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
      strategy,
      startDate,
      active: initial?.active ?? true,
      reminder,
      exchange: exchange.trim() || undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Modifier le plan DCA' : 'Nouveau plan DCA'} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!coin || amount === '' || amount <= 0} onClick={save}>Enregistrer</Button></>}>
      <div className="space-y-3">
        <Field label="Crypto"><CoinPicker value={coin} onChange={setCoin} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Montant de base (${currency === 'EUR' ? '€' : '$'})`}><NumberInput value={amount} onChange={setAmount} /></Field>
          <Field label="Fréquence">
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          {(frequency === 'weekly' || frequency === 'biweekly') && (
            <Field label="Jour">
              <Select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
                {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </Select>
            </Field>
          )}
          {frequency === 'monthly' && (
            <Field label="Jour du mois"><NumberInput value={dayOfMonth} onChange={(v) => setDayOfMonth(v === '' ? 1 : Math.min(28, Math.max(1, Math.round(v))))} /></Field>
          )}
          <Field label="Début"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        </div>
        <Field label="Stratégie" hint={STRATEGY_HELP[strategy]}>
          <Select value={strategy} onChange={(e) => setStrategy(e.target.value as DcaStrategy)}>
            {Object.entries(STRATEGY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Plateforme (facultatif)"><Input value={exchange} onChange={(e) => setExchange(e.target.value)} placeholder="Ex : Coinbase, Kraken, Bitpanda…" /></Field>
        <Toggle checked={reminder} onChange={setReminder} label="Rappel le jour de l’achat" hint="Notification à 9 h sur Android. Sur ordinateur, l’échéance s’affiche dans l’application, sans notification séparée." />
        <p className="text-xs text-muted">≈ {fmtMoney(monthly, currency, 0)} par mois en mode classique{budget ? ` (budget mensuel du profil : ${fmtMoney(budget, currency, 0)})` : ''}.</p>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Alerte de prix

export function AlertModal({ open, onClose, presetCoin }: { open: boolean; onClose: () => void; presetCoin?: CoinRef | null }) {
  const upsert = useStore((s) => s.upsertAlert);
  const currency = useStore((s) => s.settings.currency);
  const fx = useFx();
  const [coin, setCoin] = useState<CoinRef | null>(null);
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [price, setPrice] = useState<number | ''>('');
  const live = usePriceOf(coin?.coinId);
  const rate = currency === 'EUR' ? fx : 1;

  useEffect(() => {
    if (open) { setCoin(presetCoin ?? null); setPrice(''); setCondition('above'); }
  }, [open, presetCoin]);

  function save() {
    if (!coin || price === '' || price <= 0) return;
    upsert({ id: uid(), coinId: coin.coinId, symbol: coin.symbol, name: coin.name, condition, priceUsd: Number(price) / rate, createdAt: new Date().toISOString(), active: true } as PriceAlert);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle alerte de prix" footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!coin || price === ''} onClick={save}>Créer l’alerte</Button></>}>
      <div className="space-y-3">
        <Field label="Crypto"><CoinPicker value={coin} onChange={setCoin} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Condition">
            <Select value={condition} onChange={(e) => setCondition(e.target.value as 'above' | 'below')}>
              <option value="above">Passe au-dessus de</option>
              <option value="below">Passe en dessous de</option>
            </Select>
          </Field>
          <Field label={`Prix (${currency === 'EUR' ? '€' : '$'})`} hint={live != null ? `Cours actuel : ${(live * rate).toLocaleString('fr-FR', { maximumFractionDigits: 6 })}` : undefined}>
            <NumberInput value={price} onChange={setPrice} />
          </Field>
        </div>
        <p className="text-xs text-muted">Les alertes sont vérifiées toutes les quelques minutes tant que l’application est ouverte.</p>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Trade

export function TradeModal({ open, onClose, initial, preset }: {
  open: boolean; onClose: () => void; initial?: TradeEntry | null; preset?: Partial<TradeEntry> | null;
}) {
  const upsert = useStore((s) => s.upsertTrade);
  const [t, setT] = useState<TradeEntry | null>(null);
  const [coin, setCoin] = useState<CoinRef | null>(null);

  useEffect(() => {
    if (!open) return;
    const base: TradeEntry = initial ?? {
      id: uid(), coinId: preset?.coinId ?? '', symbol: preset?.symbol ?? '', side: preset?.side ?? 'long', status: 'open', entryDate: isoDay(),
      entryPrice: preset?.entryPrice ?? 0, quantity: preset?.quantity ?? 0, stopLoss: preset?.stopLoss, takeProfit: preset?.takeProfit,
      leverage: preset?.leverage ?? 1, fees: 0, setup: preset?.setup ?? '', emotion: '', notes: '',
    };
    setT(base);
    setCoin(base.coinId ? { coinId: base.coinId, symbol: base.symbol, name: base.symbol.toUpperCase() } : null);
    // Initialisé à l'ouverture seulement : un préremplissage recréé à chaque rendu effaçait la saisie en cours.
  }, [open, initial?.id]);

  if (!t) return null;
  const set = (patch: Partial<TradeEntry>) => setT({ ...t, ...patch });
  const valid = !!coin && t.entryPrice > 0 && t.quantity > 0 && (t.status === 'open' || (t.exitPrice ?? 0) > 0);

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Modifier le trade' : 'Nouveau trade'} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!valid} onClick={() => { if (coin) { upsert({ ...t, coinId: coin.coinId, symbol: coin.symbol }); onClose(); } }}>Enregistrer</Button></>}>
      <div className="space-y-3">
        <Field label="Crypto"><CoinPicker value={coin} onChange={setCoin} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sens">
            <Select value={t.side} onChange={(e) => set({ side: e.target.value as 'long' | 'short' })}>
              <option value="long">Long (achat)</option>
              <option value="short">Short (vente à découvert)</option>
            </Select>
          </Field>
          <Field label="Statut">
            <Select value={t.status} onChange={(e) => set({ status: e.target.value as 'open' | 'closed', exitDate: e.target.value === 'closed' ? (t.exitDate ?? isoDay()) : t.exitDate })}>
              <option value="open">Ouvert</option>
              <option value="closed">Clôturé</option>
            </Select>
          </Field>
          <Field label="Date d’entrée"><Input type="date" value={t.entryDate} onChange={(e) => set({ entryDate: e.target.value })} /></Field>
          <Field label="Prix d’entrée ($)"><NumberInput value={t.entryPrice || ''} onChange={(v) => set({ entryPrice: v === '' ? 0 : v })} /></Field>
          <Field label="Quantité"><NumberInput value={t.quantity || ''} onChange={(v) => set({ quantity: v === '' ? 0 : v })} /></Field>
          <Field label="Levier"><NumberInput value={t.leverage} onChange={(v) => set({ leverage: v === '' ? 1 : Math.max(1, v) })} /></Field>
          <Field label="Stop loss ($)"><NumberInput value={t.stopLoss ?? ''} onChange={(v) => set({ stopLoss: v === '' ? undefined : v })} /></Field>
          <Field label="Objectif ($)"><NumberInput value={t.takeProfit ?? ''} onChange={(v) => set({ takeProfit: v === '' ? undefined : v })} /></Field>
          {t.status === 'closed' && (
            <>
              <Field label="Date de sortie"><Input type="date" value={t.exitDate ?? isoDay()} onChange={(e) => set({ exitDate: e.target.value })} /></Field>
              <Field label="Prix de sortie ($)"><NumberInput value={t.exitPrice ?? ''} onChange={(v) => set({ exitPrice: v === '' ? undefined : v })} /></Field>
            </>
          )}
          <Field label="Frais totaux ($)"><NumberInput value={t.fees} onChange={(v) => set({ fees: v === '' ? 0 : v })} /></Field>
          <Field label="Setup"><Input value={t.setup ?? ''} onChange={(e) => set({ setup: e.target.value })} placeholder="Ex : cassure, repli MM50…" /></Field>
        </div>
        <Field label="État d’esprit"><Select value={t.emotion ?? ''} onChange={(e) => set({ emotion: e.target.value })}>
          <option value="">—</option>
          <option>Calme, plan suivi</option>
          <option>FOMO</option>
          <option>Peur</option>
          <option>Revanche après une perte</option>
          <option>Excès de confiance</option>
        </Select></Field>
        <Field label="Notes"><Textarea value={t.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Pourquoi ce trade ? Qu'as-tu appris ?" /></Field>
        {!t.stopLoss && <Banner tone="warn">Un trade sans stop loss n’a pas de risque défini. Fixe-le avant d’entrer.</Banner>}
      </div>
    </Modal>
  );
}
