# Lot 1 — Banc d'essai : plan d'implémentation

> **Pour les agents :** sous-compétence requise : superpowers:subagent-driven-development (recommandée) ou superpowers:executing-plans, tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`).

**But :** mesurer de façon reproductible ce que vaut chaque signal de Boussole, afficher cette fiabilité à côté de chaque signal, et livrer le simulateur dont le lot 2 a besoin (version 1.23.0).

**Architecture :** fonctions pures dans `src/lib/lab/` (statistiques, univers, règles d'exécution, étude de signal, simulateur, mesures, stratégies). Un outil en ligne de commande (`scripts/bench/`) les fait tourner sur l'historique Binance et écrit des rapports et une table `src/data/reliability.json`, que l'application lit pour afficher la fiabilité. Une page « Labo » remplace « Papier ».

**Pile :** TypeScript strict, React 19, Zustand 5, TanStack Query, Vitest, esbuild (outil), IndexedDB.

**Fiche :** [docs/superpowers/specs/2026-11-15-labo-banc-d-essai-autopilote-design.md](../specs/2026-11-15-labo-banc-d-essai-autopilote-design.md), sections 6, 7 et 8. La lire avant de commencer.

## Contraintes globales

- Interface, commentaires et messages de commit en français. Chaque message de commit se termine par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Calculs dans `src/lib`, en fonctions pures, testées par un fichier `*.test.ts` à côté. Lancer un test : `npx vitest run <fichier>`.
- Jamais un chiffre inventé : une donnée absente s'affiche comme absente (« non mesuré », « prix inconnu »).
- Zustand 5 : aucun `filter`/`map` dans un sélecteur `useStore(...)` ; filtrer dans un `useMemo` (sinon erreur React 185).
- Rien de volumineux dans `localStorage` : bougies et historiques vont dans IndexedDB (base `boussole-cache`, magasin `kv`).
- Une stratégie ne lit ni l'horloge ni le réseau ; aléatoire = générateur à graine fixe.
- Conserver la fin de ligne existante d'un fichier modifié (le dépôt mélange CRLF et LF).
- Valeurs fixées par la fiche : période de réglage jusqu'au 31/12/2022 inclus, période de contrôle à partir du 01/01/2023 ; univers des 50 premiers par volume pour l'étude, 20 pour les stratégies ; coupure sur trou de plus de 5 jours ; chaînage refusé au-delà de 10 % d'écart ; Wilson à 90 % (z = 1,645) ; frais « plateforme d'échange » 0,10 % + écart 0,05 % par côté, « application » 0 % + 1,50 % ; montant minimal d'un ordre 5 USDC.
- Fin de lot : `npm run typecheck`, `npm test`, `npx vite build` verts ; essai de fumée Electron ; entrée de version dans `docs/FONCTIONNALITES.md` et `README.md` ; publication (tâche 15).

## Points de vigilance

1. **Bougie du jour encore ouverte transmise à un calcul « clos ».** Attendu : aucun libellé de signal ne change entre 10 h et 22 h le même jour. Test en tâche 2 (`closedCandles` retire la bougie en cours).
2. **Crypto sans paire Binance ou historique < 200 jours dans « Rejouer sur une crypto ».** Attendu : message clair (« pas assez d'historique »), jamais un tableau de zéros. Test en tâche 7 (`studySignals` sur 150 bougies rend `observations: 0`) et en tâche 14 (état vide).
3. **Paire retirée en cours de fenêtre (LUNA en mai 2022).** Attendu : rendement à la dernière clôture connue, compté « sortie forcée », pas d'exclusion silencieuse. Test en tâche 7.
4. **`reliability.json` périmé après une modification des signaux.** Attendu : la suite de tests échoue. Test en tâche 10.
5. **Ancien ordre papier corrigé deux fois ou corrigé à tort.** Attendu : la correction ne touche que les frais > 5 % du montant, une seule fois, jamais un achat fantôme. Test en tâche 3.

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/lib/lab/stats.ts` | médiane, quantile, Wilson, générateur à graine, bootstrap, XIRR |
| `src/lib/lab/types.ts` | `CostModel`, `Intent`, `Fill`, `Position`, `Book`, `Strategy`, `StrategyContext` |
| `src/lib/lab/fills.ts` | règles d'exécution (fiche 7.4) |
| `src/lib/lab/universe.ts` | liste de l'annexe B, coupure, chaînage, `universeAt`, correspondance des identifiants |
| `src/lib/lab/replayTemp.ts` | température rejouable |
| `src/lib/lab/events.ts` | étude de signal, épisodes, verdicts, plan en R |
| `src/lib/lab/metrics.ts` | TWR, baisse maximale, trades, fenêtres glissantes, références |
| `src/lib/lab/sim.ts` | simulateur de portefeuille |
| `src/lib/lab/strategies/{index,dcaBtc,investisseur}.ts` | registre et deux stratégies |
| `src/lib/lab/reliability.ts` | validation de la table, phrases d'affichage |
| `src/lib/idb.ts` | lecture/écriture clé-valeur IndexedDB (extrait de `queryCache.ts`) |
| `src/api/history.ts` | historique journalier complet d'un symbole, mis en cache |
| `scripts/bench/{main,fetch,report}.ts` | outil en ligne de commande |
| `src/data/reliability.json` | table produite par l'outil |
| `src/pages/Labo.tsx` | page Labo (onglets Papier, Achats fantômes, Banc d'essai) |
| `docs/bench/` | rapports datés |

---

### Tâche 1 : statistiques de base

**Fichiers :** créer `src/lib/lab/stats.ts`, `src/lib/lab/stats.test.ts`.

**Interfaces — produit :**
- `median(xs: number[]): number` (NaN si vide)
- `quantile(xs: number[], q: number): number` (interpolation linéaire, `q` entre 0 et 1)
- `wilson(k: number, n: number, z?: number): { low: number; high: number }` (fractions 0-1, `z` = 1,645 par défaut)
- `hashSeed(s: string): number` (FNV-1a 32 bits, non signé)
- `mulberry32(seed: number): () => number`
- `bootstrapMeans(xs: number[], draws: number, seed: number): number[]` (moyennes triées)
- `xirr(flows: { t: number; amount: number }[]): number | null` (`t` en ms ; apports négatifs, valeur finale positive ; dichotomie entre −0,99 et +10 ; null si pas de changement de signe)

- [ ] **Étape 1 : écrire les tests**

```ts
it('médiane et quantile', () => {
  expect(median([3, 1, 2])).toBe(2);
  expect(median([1, 2, 3, 4])).toBe(2.5);
  expect(Number.isNaN(median([]))).toBe(true);
  expect(quantile([0, 10], 0.1)).toBeCloseTo(1, 9);
});
it('intervalle de Wilson à 90 %', () => {
  expect(wilson(50, 100).low).toBeCloseTo(0.4188, 3);
  expect(wilson(50, 100).high).toBeCloseTo(0.5812, 3);
  expect(wilson(0, 10).low).toBeCloseTo(0, 6);
  expect(wilson(0, 10).high).toBeCloseTo(0.213, 3);
  expect(wilson(9, 10).low).toBeCloseTo(0.6522, 3);
});
it('bootstrap reproductible', () => {
  const xs = [1, -1, 2, 0.5, -0.3];
  expect(bootstrapMeans(xs, 200, 42)).toEqual(bootstrapMeans(xs, 200, 42));
  expect(bootstrapMeans(xs, 200, 42)).not.toEqual(bootstrapMeans(xs, 200, 43));
});
it('XIRR : 100 investis, 110 un an après = 10 %', () => {
  const t0 = Date.UTC(2024, 0, 1);
  expect(xirr([{ t: t0, amount: -100 }, { t: t0 + 365 * 86400_000, amount: 110 }])).toBeCloseTo(0.1, 4);
  expect(xirr([{ t: t0, amount: 100 }])).toBeNull();
});
```

- [ ] **Étape 2 : vérifier l'échec** — `npx vitest run src/lib/lab/stats.test.ts` → échec « module introuvable ».
- [ ] **Étape 3 : implémenter les sept fonctions dans `src/lib/lab/stats.ts`.**
- [ ] **Étape 4 : vérifier le succès** — même commande → tout passe.
- [ ] **Étape 5 : commit** — `Labo : statistiques de base (Wilson, bootstrap, XIRR)`.

### Tâche 2 : signaux sur bougies closes et numéros de version

**Fichiers :** modifier `src/lib/indicators.ts`, `src/lib/signals.ts`, `src/lib/cycle.ts`, `src/lib/autoBasket.ts`, `src/hooks/useMarket.ts`, `src/pages/CoinDetail.tsx`, `src/pages/Trading.tsx` ; tests dans `src/lib/indicators.test.ts` (créer s'il n'existe pas) et `src/lib/signals.test.ts`.

**Interfaces — produit :**
- `closedCandles(candles: Candle[], nowMs: number): Candle[]` (retire la dernière bougie si `time + 86400 > nowMs / 1000`)
- `volumeRatio(candles: Candle[], period?: number, opts?: { closedOnly?: boolean }): number` — `closedOnly` : compare la dernière bougie aux `period` précédentes
- `analyze(candles, ctx?, opts?: { closedOnly?: boolean }): Analysis | null` ; `detectSetups(candles, series, opts?)` idem
- `export const SIGNALS_VERSION = 1` (signals.ts), `export const CYCLE_VERSION = 1` (cycle.ts), `export const AUTO_BASKET_VERSION = 1` (autoBasket.ts)

- [ ] **Étape 1 : écrire les tests**

```ts
it('closedCandles retire la bougie du jour encore ouverte', () => {
  const day = 86400;
  const cs = [0, 1, 2].map((i) => ({ time: i * day, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
  expect(closedCandles(cs, (2 * day + 3600) * 1000)).toHaveLength(2);
  expect(closedCandles(cs, (3 * day) * 1000)).toHaveLength(3);
});
it('volumeRatio en mode clos compare la dernière bougie aux 20 précédentes', () => {
  const cs = Array.from({ length: 22 }, (_, i) => ({ time: i, open: 1, high: 1, low: 1, close: 1, volume: i === 21 ? 300 : 100 }));
  expect(volumeRatio(cs, 20, { closedOnly: true })).toBeCloseTo(3, 9);
});
it('analyze en mode clos donne le même résultat quelle que soit l’heure de la journée', () => {
  // `series(n, from, to)` : fonction déjà présente dans src/lib/signals.test.ts
  const closed = series(260, 100, 180);
  const day0 = closed[closed.length - 1].time + 86400;             // ouverture de la bougie du jour
  const open = (close: number) => ({ time: day0, open: close, high: close * 1.2, low: close * 0.8, close, volume: 99_999 });
  const at10h = analyze(closedCandles([...closed, open(150)], (day0 + 10 * 3600) * 1000), {}, { closedOnly: true });
  const at22h = analyze(closedCandles([...closed, open(230)], (day0 + 22 * 3600) * 1000), {}, { closedOnly: true });
  expect(at10h?.investor.label).toBe(at22h?.investor.label);
  expect(at10h?.trader.label).toBe(at22h?.trader.label);
  expect(at10h?.setups).toEqual(at22h?.setups);
});
```

- [ ] **Étape 2 : vérifier l'échec.**
- [ ] **Étape 3 : implémenter** `closedCandles`, l'option `closedOnly` (passée par `analyze` à `detectSetups` et à `volumeRatio`), les trois constantes.
- [ ] **Étape 4 : brancher** `useScan` (`src/hooks/useMarket.ts` : `analyze(closedCandles(candles, Date.now()), ctx, { closedOnly: true })`), la fiche (`CoinDetail.tsx`) et le calculateur (`Trading.tsx`) de la même façon. Le cours affiché reste le cours du moment.
- [ ] **Étape 5 : vérifier** — `npx vitest run src/lib` puis `npm run typecheck` → vert.
- [ ] **Étape 6 : commit** — `Signaux calculés sur bougies closes, numéros de version des règles`.

### Tâche 3 : correctif des frais du papier

**Fichiers :** modifier `src/pages/Paper.tsx:64`, `src/lib/paper.ts`, `src/store/useStore.ts` (fonction `merge` du `persist`) ; test dans `src/lib/paper.test.ts` (créer s'il n'existe pas).

**Interfaces — produit :** `fixPaperFees(trades: PaperTrade[], nowIso: string): { trades: PaperTrade[]; changed: number }`.

- [ ] **Étape 1 : écrire les tests**

```ts
const t = (id: string, fee: number, ghost?: true): PaperTrade => ({ id, coinId: 'x', symbol: 'x', name: 'X', date: '2026-11-01', type: 'buy', quantity: 1, priceUsd: 100, feeUsd: fee, ...(ghost ? { ghost } : {}) });
it('ramène à 0,1 % les frais d’un ordre à 10 %', () => {
  const r = fixPaperFees([t('a', 10)], '2026-11-20T00:00:00.000Z');
  expect(r.trades[0].feeUsd).toBe(0.1);
  expect(r.trades[0].updatedAt).toBe('2026-11-20T00:00:00.000Z');
  expect(r.changed).toBe(1);
});
it('ne touche ni un ordre juste, ni un achat fantôme, et ne corrige qu’une fois', () => {
  const r = fixPaperFees([t('b', 0.1), t('c', 10, true)], '2026-11-20T00:00:00.000Z');
  expect(r.changed).toBe(0);
  expect(fixPaperFees(fixPaperFees([t('a', 10)], 'x').trades, 'y').changed).toBe(0);
});
```

- [ ] **Étape 2 : vérifier l'échec.**
- [ ] **Étape 3 : implémenter** `fixPaperFees` (seuil : frais > 5 % de `quantity × priceUsd` ; nouvelle valeur `round(montant × 0,001, 2)`) ; corriger la formule de `Paper.tsx` (`Math.round(quantity * priceUsd * FEE_PCT) / 100`) ; appliquer `fixPaperFees` dans la fonction `merge` du `persist` (`useStore.ts`).
- [ ] **Étape 4 : vérifier le succès.**
- [ ] **Étape 5 : commit** — `Papier : frais à 0,1 % (et non 10 %), anciens ordres corrigés`.

### Tâche 4 : types du Labo et règles d'exécution

**Fichiers :** créer `src/lib/lab/types.ts`, `src/lib/lab/fills.ts`, `src/lib/lab/fills.test.ts`.

**Interfaces — produit (types.ts) :** `CostModel`, `Intent`, `StrategyContext`, `Strategy` exactement comme la fiche 7.3, plus :
```ts
export const COSTS = { exchange: { feePct: 0.1, spreadPct: 0.05 }, app: { feePct: 0, spreadPct: 1.5 } } as const;
export interface Fill { coinId: string; symbol: string; name: string; side: 'buy' | 'sell'; kind: 'market' | 'stop' | 'target' | 'limit' | 'delist'; quantity: number; marketUsd: number; priceUsd: number; feeUsd: number; at: string; reason: string; tag?: string; stop?: number; target?: number }
export interface Position { coinId: string; symbol: string; name: string; quantity: number; costUsd: number; openedOn: string; stop?: number; target?: number }
export interface Book { cashUsd: number; positions: Record<string, Position> }
```
`StrategyContext.live` utilise `CgMarket` de `src/api/coingecko.ts`.

**Interfaces — produit (fills.ts) :**
- `applyIntent(book: Book, intent: Intent, marketUsd: number, costs: CostModel, opts: { at: string; day: string; minOrderUsd: number }): { book: Book; fill: Fill | null; skip: string | null }` — achat : le montant inclut les frais, `quantité = (montant − montant × f) ÷ (p × (1 + s))` ; vente : produit `q × p × (1 − s)`, frais sur le produit ; position fermée retirée ; `stop`/`target` posés sur la position (`target = prix obtenu + targetR × (prix obtenu − stop)`).
- `pendingHit(kind: 'stop' | 'target' | 'limitBuy', level: number, bar: Candle): number | null` — prix du marché d'exécution (trou de cotation compris), règles de la fiche 7.4.
- `settleBar(book: Book, coinId: string, bar: Candle, costs: CostModel, at: string, opts?: { gapRule?: boolean }): { book: Book; fill: Fill | null }` — stop prioritaire sur l'objectif ; `gapRule: false` désactive la règle d'exécution à l'ouverture (position ouverte dans la même bougie).

- [ ] **Étape 1 : écrire les tests**

```ts
const ex = COSTS.exchange;
it('achat de 100 USDC à 100 $', () => {
  const r = applyIntent({ cashUsd: 1000, positions: {} }, { coinId: 'btc', symbol: 'btc', name: 'B', side: 'buy', sizing: { usd: 100 }, reason: 'test' }, 100, ex, { at: 'A', day: '2024-01-01', minOrderUsd: 5 });
  expect(r.fill?.priceUsd).toBeCloseTo(100.05, 9);
  expect(r.fill?.feeUsd).toBeCloseTo(0.1, 9);
  expect(r.fill?.quantity).toBeCloseTo(0.99850075, 8);
  expect(r.book.cashUsd).toBeCloseTo(900, 9);
});
it('achat dimensionné par le risque, plafonné', () => { /* riskUsd 10, stop 90, p 100 → q = 10 ÷ (100,05 − 90) ; maxUsd 50 → montant 50 */ });
it('abandons : sous 5 USDC, prix au-delà de skipAbove, stop au-dessus du prix', () => { /* skip renseigné, book inchangé */ });
it('vente totale', () => { /* produit q × 100 × 0,9995, frais 0,1 % du produit, position supprimée */ });
it('stop : touché dans la bougie, ou trou de cotation à l’ouverture', () => {
  expect(pendingHit('stop', 90, bar(95, 96, 88, 92))).toBe(90);
  expect(pendingHit('stop', 90, bar(85, 87, 80, 86))).toBe(85);
  expect(pendingHit('target', 120, bar(125, 130, 124, 128))).toBe(125);
  expect(pendingHit('limitBuy', 95, bar(100, 101, 94, 99))).toBe(95);
});
it('stop et objectif dans la même bougie : le stop gagne', () => { /* settleBar → fill.kind === 'stop' */ });
```
(`bar(o, h, l, c)` : petite fonction locale.)

- [ ] **Étape 2 : vérifier l'échec.**
- [ ] **Étape 3 : implémenter.** Quantités arrondies à 8 décimales, montants au centime.
- [ ] **Étape 4 : vérifier le succès.**
- [ ] **Étape 5 : commit** — `Labo : types et règles d'exécution communes`.

### Tâche 5 : univers de mesure

**Fichiers :** créer `src/lib/lab/universe.ts`, `src/lib/lab/universe.test.ts`.

**Interfaces — produit :**
- `UNIVERSE_SYMBOLS: readonly string[]` (annexe B, KAS et XDC exclus)
- `CHAINS: { from: string; to: string }[]` = MATIC→POL, RNDR→RENDER, FTM→S
- `ID_MAP: Record<string, string>` = `{ bitcoin: 'BTC', ethereum: 'ETH' }` et `toSymbol(coinId)`, `toCoinId(symbol)`
- `splitOnGaps(symbol: string, candles: Candle[], maxGapDays?: number): { id: string; candles: Candle[] }[]` (identifiants `LUNA#1`, `LUNA#2` seulement s'il y a coupure)
- `chainSeries(a: Candle[], b: Candle[], maxJumpPct?: number): Candle[] | null` (null si écart de prix > 10 % à la jonction)
- `interface Asset { id: string; candles: Candle[]; dayIndex: Map<string, number> }`
- `buildAssets(raw: Map<string, Candle[]>): { assets: Asset[]; notes: string[] }` (exclusions `isStable`/`isWrappedOrStaked`/`isGold`, coupures, chaînages, notes pour le rapport)
- `universeAt(assets: Asset[], day: string, opts: { top: number; minBars?: number }): Asset[]` (classement par médiane du volume en dollars des 30 jours précédents ; `minBars` = 200)

- [ ] **Étape 1 : écrire les tests** — coupure sur un trou de 6 jours (deux actifs), pas de coupure à 5 jours ; chaînage accepté à 3 % d'écart, refusé à 15 % ; `universeAt` ignore un actif à 150 bougies et un actif terminé avant le jour, classe par volume, renvoie `top` actifs ; `toSymbol('bitcoin') === 'BTC'`.
- [ ] **Étape 2 : vérifier l'échec.**
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : vérifier le succès.**
- [ ] **Étape 5 : commit** — `Labo : univers de mesure (coupures, chaînages, classement par volume)`.

### Tâche 6 : température rejouable

**Fichiers :** créer `src/lib/lab/replayTemp.ts`, `src/lib/lab/replayTemp.test.ts`.

**Interfaces — produit :** `temperatureSeries(btc: Candle[], fngByDay: Map<string, number>, mvrvByDay: Map<string, number>): Map<string, number>` ; `temperatureAt(day, btc, fngByDay, mvrvByDay): number | null` — `computeCycle` avec les 1500 dernières bougies ≤ `day`, le Fear & Greed du jour, le MVRV de `day − 7 jours`, sans stablecoins ni financement.

- [ ] **Étape 1 : écrire les tests** — égalité avec un appel direct à `computeCycle` aux mêmes entrées ; le MVRV lu est bien celui de J−7 ; `null` avant 200 bougies.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Labo : température du marché rejouable`.

### Tâche 7 : étude de signal

**Fichiers :** créer `src/lib/lab/events.ts`, `src/lib/lab/events.test.ts`.

**Interfaces — consomme :** `analyze` (tâche 2), `universeAt`/`Asset` (tâche 5), `wilson`/`median` (tâche 1), `pendingHit` (tâche 4).

**Interfaces — produit :**
```ts
export type Bias = 'bull' | 'bear' | 'neutral';
export interface KeyMeta { key: string; label: string; bias: Bias; horizon: number; horizons: number[] }
export interface ObsCtx { asset: Asset; i: number; window: Candle[]; analysis: Analysis; temperature: number | null; btcAboveSma200: boolean | null }
export type Extractor = (o: ObsCtx) => string[];          // clés actives ce jour-là
export const SIGNAL_KEYS: KeyMeta[];                       // familles inv:, tr:, setup:, temp:, plan: (fiche 8.5)
export const DEFAULT_EXTRACTORS: Extractor[];
export type Verdict = 'validé' | 'prometteur' | 'sans effet' | 'inversé' | 'trop peu de cas';
export interface PeriodStats { days: number; episodes: number; hitPct: number; hitLow: number; hitHigh: number; medianPct: number; meanPct: number; excessMedianPct: number; worstMedianPct: number; baselineHitPct: number; baselineMedianPct: number; expectancyR?: number }
export interface KeyStats { meta: KeyMeta; byHorizon: Record<number, { all: PeriodStats; tuning: PeriodStats; control: PeriodStats }>; verdict: Verdict; frequencyPct: number; forcedExits: number }
export function forwardReturn(c: Candle[], t: number, h: number): { ret: number; worst: number; forced: boolean } | null;
export function episodeStarts(activeIdx: number[]): number[];
export function planR(c: Candle[], t: number, stop: number, targetR: number, maxDays?: number): number;
export function verdictOf(s: KeyStats['byHorizon'][number], bias: Bias, metaKey: string): Verdict;
export function studySignals(input: { assets: Asset[]; btc: Asset; temperature: Map<string, number>; top: number; extractors?: Extractor[]; from?: string; to?: string; onProgress?: (done: number, total: number) => void }): { keys: KeyStats[]; observations: number; dataThrough: string };
```
Conventions (fiche 8.5) : entrée à `ouverture[t+1]`, `ret = clôture[t+H] ÷ ouverture[t+1] − 1`, `worst = plus bas sur ]t, t+H] ÷ ouverture[t+1] − 1` ; fin de série par retrait → dernière clôture, `forced: true` ; `t+H` dans le futur → `null`. Épisode compté une fois depuis son premier jour. Les clés `temp:*` ne s'observent que sur Bitcoin. Verdicts : table de la fiche 8.5, plus la règle des clés `plan:*` (espérance > +0,15 R en contrôle et positive en réglage, frais « plateforme d'échange » retirés à l'entrée et à la sortie).

- [ ] **Étape 1 : écrire les tests**
  - `forwardReturn` : entrée à l'ouverture du lendemain (et non à la clôture) ; série qui s'arrête au jour t+10 pour H = 30 → `forced: true` ; t+H au-delà de la dernière bougie d'une série vivante → `null` ;
  - `episodeStarts([3,4,5,9,10])` → `[3, 9]` ;
  - `planR` : objectif touché → `+2` ; stop touché → `−1` ; ni l'un ni l'autre → (clôture J30 − entrée) ÷ (entrée − stop) ;
  - `verdictOf` : un cas par verdict, construit à la main (dont « trop peu de cas » avec 11 épisodes en contrôle) ;
  - `studySignals` sur un actif de 150 bougies → `observations: 0` ; sur un jeu synthétique où une clé factice précède toujours une hausse → verdict « validé ».
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Labo : étude de signal (épisodes, horizons, verdicts)`.

### Tâche 8 : mesures et simulateur

**Fichiers :** créer `src/lib/lab/metrics.ts`, `src/lib/lab/sim.ts` et leurs tests.

**Interfaces — produit :**
```ts
export interface DayPoint { day: string; valueUsd: number; cashUsd: number; flowUsd: number }
export function twr(series: DayPoint[]): number;                    // apport compté en début de journée
export function annualize(r: number, days: number): number;
export function maxDrawdownPct(series: DayPoint[]): number;         // sur l'indice TWR, négatif
export interface ClosedTrade { coinId: string; openedAt: string; closedAt: string; costUsd: number; proceedsUsd: number; pnlUsd: number; pnlPct: number; r: number | null; feesUsd: number }
export function closedTrades(fills: Fill[]): ClosedTrade[];          // premier entré, premier sorti, par crypto
export function tradeStatsOf(trades: ClosedTrade[]): { n: number; winRatePct: number; avgWinPct: number; avgLossPct: number; expectancyPct: number; expectancyR: number | null; profitFactor: number | null; maxLosingStreak: number; feesUsd: number };
export function rollingWindows(series: DayPoint[], L: number): { p10: number; p50: number; p90: number } | null;
export function referenceDcaBtc(flows: { day: string; usd: number }[], btc: Candle[], costs: CostModel): DayPoint[];
export function referenceHoldBtc(capitalUsd: number, from: string, to: string, btc: Candle[], costs: CostModel): DayPoint[];
// sim.ts
export interface SimData { assets: Asset[]; temperature: Map<string, number>; btcId: string }
export interface SimConfig { startCashUsd: number; costs: CostModel; fill: 'nextOpen' | 'nextClose'; from: string; to: string; minOrderUsd: number }
export interface SimResult { series: DayPoint[]; fills: Fill[]; skipped: { day: string; symbol: string; why: string }[] }
export function simulate<P extends Record<string, unknown>>(s: Strategy<P>, params: P, data: SimData, cfg: SimConfig): SimResult;
```
Ordre des opérations : tableau de la fiche 8.6 (deux modes). `ctx.universe = universeAt(assets, D, { top: 20 })`, `rank` = rang par volume, `available: null`. Paire retirée : solde à la dernière clôture (`kind: 'delist'`).

- [ ] **Étape 1 : écrire les tests**
  - `twr` : 100 → apport de 100 et valeur 200 sans variation de prix → 0 ; +10 % puis −10 % → −1 %.
  - `maxDrawdownPct` sur 100, 120, 90, 130 → −25.
  - `closedTrades` : deux achats puis une vente partielle → appariement premier entré, premier sorti.
  - `simulate` sur une série synthétique de 60 bougies (fichier de données local au test) avec une stratégie de test « achète le jour 10 avec stop, vend le jour 40 » : exécutions et valeur finale calculées à la main, dans les deux modes ; trou de cotation sous le stop ; cash insuffisant ; montant minimal ; paire retirée le jour 30.
  - Déterminisme : deux appels → `toEqual`.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Labo : simulateur de portefeuille et mesures de performance`.

### Tâche 9 : registre et premières stratégies

**Fichiers :** créer `src/lib/lab/strategies/{index,dcaBtc,investisseur}.ts` et `src/lib/lab/strategies/strategies.test.ts`.

**Interfaces — produit :**
- `STRATEGIES: Record<string, Strategy>` ; `rulesFingerprint(s: Strategy): string` (ex. `investisseur@1+cycle1`) — nommée ainsi pour ne pas entrer en conflit avec `rulesOf` de `src/lib/profile.ts` (la fiche l'appelle `rulesOf(strategy)`).
- `dcaBtc` et `investisseur` : définitions de la fiche 9.6 (paramètres par défaut, raisons en toutes lettres). `investisseur` utilise `temperatureMultiplier` (`src/lib/dca.ts`) et `lastFillOn('trim')`.

- [ ] **Étape 1 : écrire les tests** — `deposit` : 25 les mardis et vendredis, 0 sinon ; `dcaBtc.decide` : un achat de Bitcoin pour le montant ; `investisseur` à T = 15 → budget 50 réparti 75/25 ; T inconnue → ×1 ; T = 83 et dernier allègement il y a 31 jours → vente de 7,5 % de chaque position, il y a 10 jours → rien ; `rulesFingerprint(investisseur) === 'investisseur@1+cycle1'`.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Labo : registre des stratégies, DCA Bitcoin et Investisseur`.

### Tâche 10 : table de fiabilité

**Fichiers :** créer `src/lib/lab/reliability.ts`, `src/lib/lab/reliability.test.ts`, `src/data/reliability.json` (contenu provisoire : `{ "generatedAt": "", "dataThrough": "", "rulesVersion": 1, "universe": { "assets": 0, "from": "2019-01-01", "top": 50 }, "entries": {} }`, remplacé en tâche 12).

**Interfaces — produit :**
- `ReliabilityTable` et `ReliabilityEntry` : schéma de la fiche 8.7.
- `validateReliability(x: unknown): ReliabilityTable | null`
- `RELIABILITY: ReliabilityTable` (import de `src/data/reliability.json`, validé)
- `reliabilityOf(key: string): ReliabilityEntry | null` ; clés : `inv:<libellé>`, `tr:<libellé>`, `setup:<clé>`
- `reliabilityPhrase(e: ReliabilityEntry | null, fromYear: number): string` — textes exacts :
  - mesuré : `Depuis 2019 : vu 913 fois. En hausse 30 jours après dans 55 % des cas (un jour quelconque : 48 %). Verdict : validé.`
  - trop peu de cas : `Pas assez de cas pour juger (12 fois depuis 2019).`
  - absent : `Fiabilité non mesurée.`

- [ ] **Étape 1 : écrire les tests** — les trois phrases ; un objet sans `entries` est refusé ; **garde-fou :** `expect(RELIABILITY.rulesVersion).toBe(SIGNALS_VERSION)`.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Labo : lecture de la table de fiabilité et phrases d'affichage`.

### Tâche 11 : historique en cache dans l'application

**Fichiers :** créer `src/lib/idb.ts`, `src/api/history.ts`, `src/api/history.test.ts` ; modifier `src/lib/queryCache.ts` pour utiliser `idb.ts`.

**Interfaces — produit :**
- `idbGet<T>(key: string): Promise<T | null>`, `idbPut(key: string, value: unknown): Promise<void>` (base `boussole-cache`, magasin `kv` ; erreurs avalées, comme aujourd'hui)
- `appendHistory(old: Candle[], fresh: Candle[]): Candle[]` (fusion par `time`, triée, sans doublon)
- `loadDailyHistory(symbol: string, nowMs?: number): Promise<Candle[]>` — clé `hist:<SYMBOLE>:1d` ; complète par la fin si la dernière bougie a plus d'un jour ; renvoie des bougies closes (`closedCandles`)
- `useDailyHistory(symbol: string | null)` (TanStack Query, `staleTime` 12 h)

- [ ] **Étape 1 : écrire les tests** de `appendHistory` (chevauchement, doublons, ordre).
- [ ] **Étape 2 à 4 : échec, implémentation, succès** ; vérifier que `npx vitest run src/lib/queryCache.test.ts` reste vert s'il existe.
- [ ] **Étape 5 : commit** — `Historique journalier complet en cache (IndexedDB)`.

### Tâche 12 : outil en ligne de commande et premiers rapports

**Fichiers :** créer `scripts/bench/main.ts`, `scripts/bench/fetch.ts`, `scripts/bench/report.ts` ; modifier `package.json`, `tsconfig.json` (`"include": ["src", "scripts/bench"]`), `.gitignore` (`.cache/`) ; produire `docs/bench/AAAA-MM-JJ-signaux-v1.md`, `docs/bench/AAAA-MM-JJ-strategies.md`, `src/data/reliability.json`, `src/data/strategies-bench.json`.

**Interfaces — consomme :** `buildAssets`, `temperatureSeries`, `studySignals`, `simulate`, `STRATEGIES`, `COSTS`, `rollingWindows`.

- Script : `"bench": "esbuild scripts/bench/main.ts --bundle --platform=node --format=esm --target=node20 --outfile=.cache/bench/bench.mjs && node .cache/bench/bench.mjs"` (les arguments de `npm run bench -- signals` arrivent après `node …`).
- `fetch.ts` : `loadDaily(symbol)` (pagination depuis le 17/08/2017, cache `.cache/bench/<SYMBOLE>-1d.json` réutilisé s'il a moins de 24 h, bougie en cours retirée), `loadFng()`, `loadMvrv()` (`https://bitcoin-data.com/v1/mvrv`).
- Commandes : `signals`, `strategies`, `compare <a> <b>` (fiche 8.7). Schéma de `strategies-bench.json` : fiche 8.7. Chaque rapport commence par la date des données, l'univers, les conventions et les limites. Tri des clés et arrondis fixes pour que deux exécutions donnent des fichiers identiques.

- [ ] **Étape 1 : lancer** `npm run bench -- signals` sur un cache vide. Attendu : rapport et `reliability.json` écrits (compter une dizaine de minutes).
- [ ] **Étape 2 : relancer** et vérifier `git diff --stat` : aucun changement.
- [ ] **Étape 3 : comparer** le rapport à l'annexe A de la fiche (même sens pour chaque ligne) ; ajouter au rapport une section « Écarts avec la mesure du 14 novembre » qui explique tout écart de sens.
- [ ] **Étape 4 : lancer** `npm run bench -- strategies`. Attendu : `dca-btc` et `investisseur`, deux modes, deux préréglages de frais.
- [ ] **Étape 5 : vérifier** `npx vitest run src/lib/lab/reliability.test.ts` et `npm run typecheck`.
- [ ] **Étape 6 : commit** — `Banc d'essai : outil en ligne de commande, premiers rapports et table de fiabilité`.

### Tâche 13 : fiabilité affichée à côté des signaux

**Fichiers :** modifier `src/components/uikit/badges.tsx` (`SignalBadge`), `src/pages/CoinDetail.tsx`, `src/pages/Market.tsx`.

**Interfaces — consomme :** `reliabilityOf`, `reliabilityPhrase`, `RELIABILITY.universe.from`.

- `SignalBadge` reçoit `reliabilityKey?: string` : la phrase s'affiche dans `title` (info-bulle) ; en vue non compacte, sous le libellé (fiche d'une crypto, cartes « Signal investisseur » et « Signal trader »).
- Fiche et liste Signaux : les setups au verdict « sans effet » ou « inversé » passent dans un `<details>` replié intitulé « Peu fiables d'après l'historique ». Les libellés investisseur et trader restent à leur place quel que soit leur verdict.
- [ ] **Étape 1 : implémenter.**
- [ ] **Étape 2 : vérifier** `npm run typecheck`, puis à l'œil dans `npm run dev` : phrase visible sous un libellé, info-bulle dans la liste, groupe replié présent.
- [ ] **Étape 3 : commit** — `Fiabilité mesurée affichée à côté de chaque signal`.

### Tâche 14 : page Labo

**Fichiers :** créer `src/pages/Labo.tsx` ; déplacer le contenu de `src/pages/Paper.tsx` dans des composants appelés par Labo (onglets « Papier » et « Achats fantômes ») ; modifier `src/App.tsx` (route `/labo` ; `/papier` rend Labo sur l'onglet Papier), `src/components/Layout.tsx` (entrée « Labo », icône `FlaskConical`, à la place de « Papier »).

**Interfaces — consomme :** `RELIABILITY`, `reliabilityPhrase`, `useDailyHistory`, `buildAssets`, `studySignals`, `binanceSymbolFor`.

- Onglet par paramètre d'adresse `tab` : `papier` (défaut), `fantomes`, `banc`.
- Onglet « Banc d'essai » :
  - tableau de toutes les clés, trié par verdict (validé, prometteur, sans effet, inversé, trop peu de cas) : libellé, fréquence, épisodes, taux, médiane, référence, taux en contrôle, verdict ; date des données en sous-titre ;
  - « Rejouer sur une crypto » : `CoinPicker` → symbole Binance → `useDailyHistory` → `studySignals` sur ce seul actif (référence = ses propres jours, pas d'excès du jour), calcul découpé pour ne pas figer l'écran ; moins de 12 épisodes → bandeau « Trop peu de cas pour conclure » ; moins de 200 bougies ou pas de paire → « Pas assez d'historique pour cette crypto » ;
  - « Méthode » : `<details>` de dix lignes reprenant les conventions et les limites de la fiche (8.5, annexe A).
- Sur téléphone : le tableau devient des cartes, aucun défilement horizontal.
- [ ] **Étape 1 : implémenter.**
- [ ] **Étape 2 : vérifier** `npm run typecheck` et `npm test`.
- [ ] **Étape 3 : écrire et lancer** l'essai de fumée Electron (`smoke/labo.cjs` dans le dossier temporaire de la session, sur le modèle de `smoke/main.cjs`) : `/labo`, `/labo?tab=banc`, `/papier`, `/coin/bitcoin`, `/marche` s'affichent sans « Cet écran a rencontré un problème » ; le tableau du banc d'essai contient « Verdict ». Commande : `env -u ELECTRON_RUN_AS_NODE npx electron <script> "$(pwd)/dist"` après `npx vite build`.
- [ ] **Étape 4 : commit** — `Page Labo : papier, achats fantômes et banc d'essai`.

### Tâche 15 : documentation et publication 1.23.0

**Fichiers :** `docs/FONCTIONNALITES.md`, `README.md`, `package.json` (version).

- [ ] **Étape 1 :** entrée « v1.23.0 — Banc d'essai » dans `docs/FONCTIONNALITES.md` (fiabilité affichée, page Labo, frais du papier corrigés, signaux figés une fois par jour) et mise à jour du `README.md`.
- [ ] **Étape 2 :** `npm run typecheck && npm test && npx vite build` → vert.
- [ ] **Étape 3 :** `npm version minor --no-git-tag-version` (→ 1.23.0), puis `env -u ELECTRON_RUN_AS_NODE npm run build:apk && env -u ELECTRON_RUN_AS_NODE npm run build:exe`.
- [ ] **Étape 4 :** empreintes `release/SHA256-1.23.0.txt`, commit, `git push`, `gh release create v1.23.0 --target main` avec l'APK, les deux exe et les empreintes, annonce `latestVersion.json` dans le dépôt de synchronisation, puis commit du `versionCode` réécrit par le build Android.
