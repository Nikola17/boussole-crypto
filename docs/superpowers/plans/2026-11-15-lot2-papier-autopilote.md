# Lot 2 — Papier complet (2A) et autopilote (2B) : plan d'implémentation

> **Pour les agents :** sous-compétence requise : superpowers:subagent-driven-development (recommandée) ou superpowers:executing-plans, tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`).

**But :** 2A (1.24.0) : plusieurs portefeuilles papier avec ordres au marché, limites, stops, objectifs, courbe et statistiques. 2B (1.25.0) : des portefeuilles qui suivent seuls une stratégie, à l'identique sur PC, téléphone et serveur, avec un verdict de confiance et leurs ordres sur Telegram.

**Architecture :** l'état d'un portefeuille en autopilote est une fonction pure de ses enregistrements journaliers (`PaperDayLog`). Le « tick » rejoue les jours manquants avec le moteur du lot 1 (`fills.ts`, stratégies), au prix de l'heure d'exécution. Les écritures sont idempotentes : deux appareils qui calculent le même jour écrivent la même chose.

**Pile :** TypeScript strict, React 19, Zustand 5, TanStack Query, Vitest, runner Node (esbuild).

**Fiche :** [docs/superpowers/specs/2026-11-15-labo-banc-d-essai-autopilote-design.md](../specs/2026-11-15-labo-banc-d-essai-autopilote-design.md), sections 7 et 9. **Prérequis :** lot 1 livré (`src/lib/lab/*`).

## Contraintes globales

- Interface, commentaires et messages de commit en français ; chaque message de commit se termine par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Calculs dans `src/lib`, fonctions pures, tests `*.test.ts` à côté ; `npx vitest run <fichier>`.
- Jamais un chiffre inventé ; aucun prix de remplacement quand une bougie manque : le tick attend.
- Le papier n'entre dans aucun total, aucune fiscalité, aucun conseil du vrai portefeuille.
- Zustand 5 : aucun `filter`/`map` dans un sélecteur.
- Nouvelle collection synchronisée = `ITEM_KEYS` (`src/lib/sync/merge.ts`) + `BACKUP_KEYS` et `OBJECT_LISTS` (`src/lib/backup.ts`) + migration (`migrateState`, `src/store/persistence.ts`) + `DATA_VERSION`.
- Suppression d'un élément synchronisé = `dropped(s, 'collection/id')` ; modification = `touch(item)`.
- Valeurs fixées : heure d'exécution 8, fuseau `Europe/Paris` ; 6 autopilotes actifs au plus ; ordres en attente expirés après 90 jours ; préréglages de frais de la fiche 9.3 ; paramètres des stratégies de la fiche 9.6 ; seuils du verdict de la fiche 9.7 ; moins de 150 Ko par portefeuille et par an.
- Conserver la fin de ligne existante d'un fichier modifié.
- Fin de chaque demi-lot : `npm run typecheck`, `npm test`, `npx vite build`, essai de fumée Electron, entrée de version, publication.

## Points de vigilance

1. **Deux appareils calculent le même jour à quelques minutes d'écart.** Attendu : aucun doublon, aucun aller-retour de synchronisation sans fin. Test en tâche 9 (deux « appareils » puis fusion, puis un tick qui n'écrit rien).
2. **Application fermée pendant douze jours.** Attendu : les douze jours rattrapés à l'ouverture, au même résultat qu'en douze ticks. Test en tâche 11.
3. **Passage à l'heure d'été ou d'hiver, ou serveur dans un autre fuseau que le téléphone.** Attendu : la même heure d'exécution partout. Test en tâche 8.
4. **Crypto retirée de Binance alors qu'une position papier est ouverte.** Attendu : position soldée à la dernière clôture connue, mentionnée dans l'historique. Test en tâche 11 (série qui s'arrête).
5. **Un utilisateur modifie les réglages d'un autopilote.** Attendu : l'ancien est archivé, un nouveau repart de zéro avec un verdict « en observation ». Test en tâche 11.

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/types.ts` | `PaperPortfolio`, `PaperOrder`, `PaperFill`, `PaperDayLog`, champs ajoutés à `PaperTrade` |
| `src/lib/lab/paperBook.ts` | état d'un portefeuille manuel, ticket d'ordre, repricing avec d'autres frais |
| `src/lib/lab/settle.ts` | règlement des ordres en attente sur bougies 1 heure |
| `src/lib/lab/equity.ts` | courbe d'un portefeuille papier |
| `src/lib/lab/clock.ts` | heure d'exécution, jour de décision, semaine ISO |
| `src/lib/lab/autoState.ts` | état d'un autopilote rejoué depuis ses journaux ; fusion idempotente des journaux |
| `src/lib/lab/autopilot.ts` | tick |
| `src/lib/lab/trust.ts` | verdict de confiance |
| `src/lib/lab/strategies/{dcaBoussole,trader}.ts` | deux stratégies |
| `src/lib/autoBasket.ts` | `buildAutoBasketPlan` extrait de `useBasket` |
| `src/hooks/{usePaperSettle,useAutopilot}.ts` | exécution périodique dans l'application |
| `src/runner/autopilot.ts` | branchement du tick dans le runner |
| `src/pages/labo/*` | composants de la page Labo |

---

## Demi-lot 2A — Papier complet (1.24.0)

### Tâche 1 : modèle de données version 3

**Fichiers :** modifier `src/types.ts`, `src/lib/backup.ts` (`DATA_VERSION = 3`, listes), `src/lib/sync/merge.ts` (`ITEM_KEYS` : `paperPortfolios`, `paperOrders`, `paperDays`), `src/store/persistence.ts` (bloc `if (version < 3)`), `src/store/useStore.ts`, `src/runner/evaluate.ts` (`watchOf` lit les trois collections) ; tests dans `src/store/persistence.test.ts` et `src/store/paper.test.ts`.

**Interfaces — produit :**
- Types `PaperPortfolio`, `PaperOrder`, `PaperFill`, `PaperDayLog` : fiche 9.2, à l'identique, plus sur `PaperOrder` deux champs facultatifs `attachStop?: number; attachTarget?: number` (achat limite qui posera un stop et un objectif à son exécution).
- `PaperTrade` reçoit `portfolioId?: string` (absent pour un achat fantôme), `orderType?: 'market' | 'limit' | 'stop' | 'target'`, `orderId?: string`, `marketUsd?: number`, `reason?: string`.
- Actions du magasin : `upsertPaperPortfolio(p)`, `removePaperPortfolio(id)` (supprime aussi ses ordres, ses `paperTrades` et ses `paperDays`, chaque suppression inscrite au registre), `upsertPaperOrder(o)`, `removePaperOrder(id)`, `applyPaperDays(days: PaperDayLog[])` (voir tâche 9 ; d'ici là, simple ajout).
- Migration 2 → 3 : fiche 9.2 (portefeuille `manuel`, `portfolioId: 'manuel'` sur les ordres non fantômes, collections vides ; rubrique `paper` laissée en place).

- [ ] **Étape 1 : écrire les tests** — un état version 2 avec trois ordres papier et un achat fantôme migre vers un portefeuille « Papier manuel » (`startingUsd` = `paper.startingUsd`, `createdAt` = `paper.resetAt` sinon date du premier ordre) portant les trois ordres ; l'achat fantôme garde `portfolioId` absent ; un second passage ne change rien ; `removePaperPortfolio` laisse 0 ordre, 0 exécution, 0 jour de ce portefeuille et autant d'entrées dans `deletions`.
- [ ] **Étape 2 à 4 : échec, implémentation, succès** ; `npx vitest run src/store src/lib/sync src/lib/backup` reste vert.
- [ ] **Étape 5 : commit** — `Papier : plusieurs portefeuilles, ordres et journaux (données v3)`.

### Tâche 2 : ticket d'ordre et état d'un portefeuille manuel

**Fichiers :** créer `src/lib/lab/paperBook.ts` et son test ; modifier `src/lib/paper.ts` (`paperStatus` reçoit les ordres d'un seul portefeuille, `liveTrades` filtre aussi par `portfolioId`).

**Interfaces — consomme :** `applyIntent`, `COSTS` (lot 1, `src/lib/lab/fills.ts`, `types.ts`).

**Interfaces — produit :**
- `COST_PRESETS: Record<'exchange' | 'app', CostModel>` (= `COSTS`) et `measuredPreset(spreadMedianPct: number | null, samples: number): CostModel | null` (null sous 5 achats ; écart borné entre 0,05 et 5).
- `tradesOf(trades: PaperTrade[], portfolioId: string): PaperTrade[]`
- `bookOf(portfolio: PaperPortfolio, trades: PaperTrade[]): Book`
- `marketOrder(portfolio, trades, input: { coin: CoinRef; side: 'buy' | 'sell'; usd?: number; quantity?: number; stop?: number; target?: number }, marketUsd: number, nowIso: string): { trade: PaperTrade | null; orders: PaperOrder[]; error: string | null }` — achat avec stop et/ou objectif : crée les ordres `stop` et `target` dans un même `ocoGroup`.
- `repriceWithCosts(fills: { side: 'buy' | 'sell'; quantity: number; marketUsd: number }[], startingUsd: number, costs: CostModel, lastPrices: Map<string, number>): number` (valeur finale avec d'autres frais).

- [ ] **Étape 1 : écrire les tests** — achat de 100 USDC à 100 $ en préréglage `exchange` → mêmes valeurs que le test de `applyIntent` ; vente d'une quantité supérieure à la position → `error` ; achat avec stop 90 et objectif 120 → deux ordres, même `ocoGroup`, `expiresAt` = création + 90 jours ; `repriceWithCosts` en préréglage `app` donne moins que `exchange` ; `measuredPreset(0.02, 8)` → écart 0,05.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Papier : ticket d'ordre, frais réalistes et état par portefeuille`.

### Tâche 3 : règlement des ordres en attente

**Fichiers :** créer `src/lib/lab/settle.ts`, `src/lib/lab/settle.test.ts`, `src/hooks/usePaperSettle.ts` ; monter le crochet dans `AppEffects` (`src/App.tsx`).

**Interfaces — consomme :** `pendingHit` (lot 1).

**Interfaces — produit :**
- `settleOrders(input: { portfolio: PaperPortfolio; orders: PaperOrder[]; trades: PaperTrade[]; hourly: Map<string, Candle[]>; nowMs: number }): { trades: PaperTrade[]; orders: PaperOrder[] }` — renvoie seulement les éléments nouveaux ou modifiés ; bougies lues dans l'ordre du temps à partir de l'heure suivant `createdAt` ; une exécution crée un `PaperTrade` d'identifiant `fill:<orderId>` ; annule les autres ordres du même `ocoGroup` ; achat limite avec `attachStop`/`attachTarget` → crée les deux ordres de vente ; vente sans quantité = toute la position ; passé `expiresAt` → `expired`.
- `usePaperSettle()` : au lancement puis toutes les 15 minutes, charge les bougies 1 heure (`getKlines(sym, '1h', 1000, startTime)`, 12 pages au plus) des cryptos qui ont un ordre ouvert, appelle `settleOrders`, enregistre.
- Ticket : un ordre en attente est refusé pour une crypto sans paire Binance (`binanceSymbolFor`) avec le texte « Ordres limites et stops : seulement pour les cryptos cotées sur Binance, faute de bougies horaires ».

- [ ] **Étape 1 : écrire les tests** — limite d'achat exécutée au bon prix ; stop sur trou de cotation exécuté à l'ouverture ; groupe OCO (l'objectif s'exécute, le stop passe à `cancelled`) ; expiration ; règlement relancé deux fois → aucun nouvel élément la seconde fois ; deux règlements indépendants du même ordre → même identifiant `fill:<orderId>`.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Papier : ordres limites, stops et objectifs exécutés sur bougies horaires`.

### Tâche 4 : courbe et statistiques d'un portefeuille

**Fichiers :** créer `src/lib/lab/equity.ts` et son test.

**Interfaces — consomme :** `DayPoint`, `twr`, `maxDrawdownPct`, `closedTrades`, `tradeStatsOf` (lot 1, `metrics.ts`) ; `loadDailyHistory` (lot 1).

**Interfaces — produit :** `paperEquitySeries(startingUsd: number, trades: PaperTrade[], closes: Map<string, Map<string, number>>, from: string, to: string): { series: DayPoint[]; partial: boolean }` — une crypto sans clôture un jour donné est valorisée à son dernier prix connu et met `partial` à vrai ; `tradesToFills(trades: PaperTrade[]): Fill[]`.

- [ ] **Étape 1 : écrire les tests** — achat puis vente sur trois jours : valeurs calculées à la main ; jour sans clôture → `partial: true`, aucune valeur à zéro.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Papier : courbe de valeur et statistiques`.

### Tâche 5 : interface des portefeuilles papier et publication 1.24.0

**Fichiers :** créer `src/pages/labo/{PortfolioList,PortfolioDetail,OrderTicket,EquityChart}.tsx` ; modifier `src/pages/Labo.tsx` (onglet « Portefeuilles papier » remplace « Papier »), `docs/FONCTIONNALITES.md`, `README.md`.

**Interfaces — consomme :** tâches 1 à 4 ; `LineChart` (`src/components/LineChart.tsx`) ; référence « même mise en Bitcoin » via `referenceHoldBtc`.

- Liste : une carte par portefeuille (nom, type, valeur, performance depuis la création, « Même mise en Bitcoin : … », petite courbe) et « Nouveau portefeuille » (nom, capital, préréglage de frais ; `measured` proposé seulement s'il est disponible).
- Détail : contenu de la fiche 9.4 (en-tête, courbe avec référence Bitcoin, onglets Positions, Ordres en attente, Historique, Statistiques, ticket, renommer, remettre à zéro, archiver, supprimer).
- [ ] **Étape 1 : implémenter.**
- [ ] **Étape 2 : essai de fumée Electron** : créer un portefeuille, passer un achat au marché de 100 USDC (frais affichés 0,10), poser un stop, supprimer le portefeuille ; aucun écran d'erreur.
- [ ] **Étape 3 :** `npm run typecheck && npm test && npx vite build`.
- [ ] **Étape 4 : publier 1.24.0** (même procédure que la tâche 15 du lot 1).

## Demi-lot 2B — Autopilote (1.25.0)

### Tâche 6 : `buildAutoBasketPlan` extrait de `useBasket`

**Fichiers :** modifier `src/lib/autoBasket.ts`, `src/hooks/useBasket.ts` ; test dans `src/lib/autoBasket.test.ts`.

**Interfaces — produit :**
```ts
export interface AutoBasketInputs {
  basket: Pick<BasketPlan, 'amountUsd' | 'basePct' | 'maxBaseLines' | 'maxDiscoveryLines' | 'minOrderUsd' | 'reserveUsd' | 'discoverySource'>;
  markets: CgMarket[]; smallCaps: CgMarket[] | null;
  scores: Record<string, number>; change7d: Record<string, number | null>;
  cdc: Record<string, CdcState> | null; temperature: number | null;
  heldUsd: Record<string, number>; totalValueUsd: number;
  rules: ProfileRules; linesOpen: number; discoveryLinesOpen: number;
}
export function buildAutoBasketPlan(i: AutoBasketInputs): BasketPlanResult;
```
`useBasket` appelle cette fonction au lieu de construire le contexte lui-même ; le comportement de l'écran ne change pas.

- [ ] **Étape 1 : écrire le test** — mêmes entrées que le test existant de `planAutoBasket` le plus complet → même résultat.
- [ ] **Étape 2 à 4 : échec, implémentation, succès** ; `npx vitest run src/lib/autoBasket.test.ts` et l'essai de fumée DCA existant (`smoke/dca.cjs`) restent verts.
- [ ] **Étape 5 : commit** — `Panier automatique : calcul extrait en fonction pure`.

### Tâche 7 : stratégies « DCA Boussole » et « Trader »

**Fichiers :** créer `src/lib/lab/strategies/{dcaBoussole,trader}.ts` ; modifier `strategies/index.ts` ; tests dans `strategies.test.ts`.

**Interfaces — consomme :** `buildAutoBasketPlan` (tâche 6), `analyze` en mode clos, `reliabilityOf` (lot 1).

**Interfaces — produit :** `dcaBoussole` (`replayable: false`, `uses: ['signals', 'cycle', 'autoBasket']`) et `trader` (`replayable: true`, `uses: ['signals']`), paramètres et règles de la fiche 9.6. Dans `trader`, la valeur par défaut de `setups` est calculée au chargement : clés `setup:*` haussières au verdict « validé » ou « prometteur ». Sans `ctx.live`, `dcaBoussole` force `basePct` à 100.

- [ ] **Étape 1 : écrire les tests de `trader`** — entrée seulement si setup listé et signal haussier ; aucune entrée quand Bitcoin est sous sa moyenne 200 jours (`regime`) ; délai de 5 jours après une sortie au stop ; taille = min(risque, 20 % de la valeur, cash) ; `skipAbove` = clôture × 1,03 ; sortie au 30ᵉ jour et sur « Vente forte » ; pause à −20 % depuis le plus haut, reprise à −10 % ; liste `setups` vide → aucune entrée.
- [ ] **Étape 2 : écrire les tests de `dcaBoussole`** — avec `ctx.live` : ordres égaux à ceux de `buildAutoBasketPlan` pour le même portefeuille ; sans `ctx.live` : base seule.
- [ ] **Étape 3 à 5 : échec, implémentation, succès.**
- [ ] **Étape 6 : commit** — `Labo : stratégies DCA Boussole et Trader`.

### Tâche 8 : horloge d'exécution

**Fichiers :** créer `src/lib/lab/clock.ts` et son test.

**Interfaces — produit :** `execInstant(day: string, hour: number, timeZone: string): number` (ms UTC, par `Intl.DateTimeFormat`, sur le modèle de `nyEpoch` dans `src/runner/brief.ts`) ; `decisionDay(execMs: number): string` (jour UTC de `execMs`, moins un jour) ; `localDay(ms: number, timeZone: string): string` ; `addDays(day: string, n: number): string` ; `isoWeek(day: string): string` (`2026-W47`).

- [ ] **Étape 1 : écrire les tests**

```ts
expect(new Date(execInstant('2026-03-28', 8, 'Europe/Paris')).toISOString()).toBe('2026-03-28T07:00:00.000Z');
expect(new Date(execInstant('2026-03-29', 8, 'Europe/Paris')).toISOString()).toBe('2026-03-29T06:00:00.000Z');
expect(new Date(execInstant('2026-10-25', 8, 'Europe/Paris')).toISOString()).toBe('2026-10-25T07:00:00.000Z');
expect(new Date(execInstant('2026-11-17', 8, 'Pacific/Auckland')).toISOString()).toBe('2026-11-16T19:00:00.000Z');
expect(decisionDay(execInstant('2026-11-17', 8, 'Pacific/Auckland'))).toBe('2026-11-15');
expect(decisionDay(execInstant('2026-11-17', 8, 'Europe/Paris'))).toBe('2026-11-16');
expect(isoWeek('2026-11-16')).toBe('2026-W47');
```

- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Labo : horloge d'exécution indépendante du fuseau de la machine`.

### Tâche 9 : état rejoué et écriture idempotente

**Fichiers :** créer `src/lib/lab/autoState.ts` et son test ; brancher `applyPaperDays` du magasin dessus.

**Interfaces — produit :**
- `interface AutoState { cashUsd: number; positions: Record<string, Position>; peakEquityUsd: number; lastFill: Record<string, string> /* `${tag}|${coinId}` et `${tag}` → jour */ }`
- `autoState(portfolio: PaperPortfolio, logs: PaperDayLog[], closeOf?: (coinId: string, day: string) => number | null): AutoState` (journaux triés par jour ; plus haut de la valeur suivi aux jours connus)
- `sameDayLog(a: PaperDayLog, b: PaperDayLog): boolean` (contenu, sans `updatedAt` ni `by`)
- `mergeDayLogs(existing: PaperDayLog[], incoming: PaperDayLog[]): { days: PaperDayLog[]; changed: PaperDayLog[] }`
- `effectiveCursor(portfolio: PaperPortfolio, logs: PaperDayLog[]): string`

- [ ] **Étape 1 : écrire les tests** — trois journaux (apport, achat, vente) → cash et positions calculés à la main ; journal identique avec un autre `by` → `changed` vide ; deux faisceaux de deux appareils fusionnés par `mergeBundles` → aucun doublon ; `effectiveCursor` prend le plus grand des deux.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Labo : état d'un autopilote rejoué depuis ses journaux`.

### Tâche 10 : verdict de confiance

**Fichiers :** créer `src/lib/lab/trust.ts` et son test ; ajouter `trustRules?: Partial<TrustRules>` à `Profile` (`src/types.ts`).

**Interfaces — consomme :** `twr`, `maxDrawdownPct`, `rollingWindows`, `closedTrades`, `tradeStatsOf`, `bootstrapMeans`, `hashSeed`.

**Interfaces — produit :**
```ts
export interface TrustRules { minDays: number; minTrades: number; minDeposits: number; maxDrawdownPct: number; maxExtraDrawdownPts: number; bootstrapDraws: number; minWindowWinPct: number; withdrawGapPts: number; copyPct: number; copyPctTrusted: number }
export const DEFAULT_TRUST_RULES: TrustRules; // 90, 30, 20, 25, 5, 2000, 60, 10, 5, 15
export type TrustLevel = 'observation' | 'insuffisant' | 'encourageant' | 'fiable' | 'retirée';
export interface TrustCriterion { id: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6'; ok: boolean | null; text: string }
export interface TrustVerdict { level: TrustLevel; headline: string; criteria: TrustCriterion[]; copyPct: number | null; withdrawnOn?: string }
export function trustVerdict(i: { kind: 'trades' | 'deposits'; seed: string; live: DayPoint[]; fills: Fill[]; reference: DayPoint[] | null; bench: { p10: number } | null; previous?: TrustVerdict | null }, rules?: TrustRules): TrustVerdict;
```
Critères et textes : fiche 9.7, à l'identique. `kind: 'deposits'` compare à la référence DCA Bitcoin ; pas de verdict pour `dca-btc` (l'appelant ne l'appelle pas).

- [ ] **Étape 1 : écrire les tests** — un cas par niveau, sur séries synthétiques ; même résultat à deux appels ; « retirée » quand un portefeuille « encourageant » dépasse la baisse maximale ; textes exacts « En observation : jour 27 sur 90, 9 trades sur 30. Ne copie pas encore. » et « Fiable jusqu'ici. Le verdict se recalcule chaque jour. ».
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Labo : verdict de confiance d'un autopilote`.

### Tâche 11 : le tick

**Fichiers :** créer `src/lib/lab/autopilot.ts`, `src/lib/lab/autopilot.test.ts`.

**Interfaces — consomme :** `clock.ts`, `autoState.ts`, `applyIntent`/`settleBar`, `STRATEGIES`, `rulesFingerprint`, `temperatureAt`.

**Interfaces — produit :**
```ts
export interface AutopilotSources {
  daily(coinId: string): Promise<Candle[]>;                       // bougies closes
  hourly(coinId: string, fromMs: number, toMs: number): Promise<Candle[]>;
  temperatureAt(day: string): number | null;
  universe(): Promise<{ coinId: string; symbol: string; name: string; rank: number | null; available: boolean | null }[]>;
  live(): Promise<StrategyContext['live'] | null>;
}
export type AutopilotEvent = { kind: 'orders'; day: string; fills: PaperFill[]; skipped: PaperDayLog['skipped'] } | { kind: 'stop' | 'target'; fill: PaperFill };
export function needsArchive(p: PaperPortfolio): boolean;           // empreinte ≠ p.rules
export async function tickAutopilot(p: PaperPortfolio, logs: PaperDayLog[], nowMs: number, src: AutopilotSources, device: string): Promise<{ portfolio: PaperPortfolio; changed: PaperDayLog[]; events: AutopilotEvent[] }>;
```
Algorithme et règles : fiche 9.5 (pseudo-code, points 1 à 5, non rejouable et jours manqués, univers figé par semaine et repris tel quel au rattrapage, arrêt sans bougie 1 heure, arrêt sans `ctx.live` pour une stratégie non rejouable). Jours sans événement : aucun journal, seul `cursorDay` avance.

- [ ] **Étape 1 : écrire les tests** (sources factices sur données synthétiques)
  - dix jours en un tick == dix ticks quotidiens (mêmes journaux, même portefeuille) ;
  - deux appareils, même instant → journaux identiques hors `updatedAt` et `by` ; second tick → `changed` vide ;
  - bougie 1 heure absente → arrêt sans journal, `cursorDay` inchangé ;
  - stratégie non rejouable fermée six échéances → apports crédités, une seule exécution avec `lateDays`, cinq lignes `skipped` « aucun appareil n'a tourné ce jour-là » ;
  - stop touché entre deux heures d'exécution → rattaché au bon jour ;
  - série qui s'arrête (paire retirée) → exécution `delist` ;
  - `needsArchive` vrai quand la version d'une stratégie change ;
  - une année de `trader` sur données synthétiques → JSON des journaux < 150 000 caractères.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Labo : tick de l'autopilote (rattrapage, déterminisme)`.

### Tâche 12 : autopilote dans l'application

**Fichiers :** créer `src/hooks/useAutopilot.ts`, `src/pages/labo/{AutopilotWizard,TrustPanel,Leaderboard}.tsx`, `src/components/AutopilotCard.tsx` ; modifier `src/pages/Labo.tsx` (onglet « Classement »), `src/pages/Dashboard.tsx` (carte), `src/App.tsx`.

**Interfaces — consomme :** tâches 6 à 11 ; `src/data/strategies-bench.json` (lot 1) ; synchronisation existante (`src/hooks/useSync.ts`).

- `useAutopilot` : au lancement puis toutes les 15 minutes ; lecture de la synchronisation d'abord si elle est active ; archive puis recrée les portefeuilles dont `needsArchive` est vrai (mêmes réglages, même capital, nom suivi de « (anciennes règles) » pour l'archive) ; enregistre `changed` par `applyPaperDays` ; notifications locales seulement si le serveur veilleur n'a pas pointé depuis 45 minutes.
- Assistant de création : fiche 9.5 (« Création d'un autopilote », étapes 1 à 4, textes compris) ; refus au-delà de 6 autopilotes actifs ; simulation « depuis un an » gardée dans IndexedDB (`idbPut('sim:<portfolioId>', …)`), jamais synchronisée.
- Courbe : partie simulée en pointillé, partie en direct en trait plein, repère « en direct depuis le JJ/MM ».
- Panneau de confiance et classement : fiche 9.7 ; « Règles de confiance » modifiables (Labo), retour aux valeurs par défaut.
- [ ] **Étape 1 : implémenter.**
- [ ] **Étape 2 : essai de fumée Electron** : créer un autopilote `dca-btc` et un `trader`, ouvrir le classement et le Cockpit ; aucun écran d'erreur ; le panneau affiche « En observation ».
- [ ] **Étape 3 : commit** — `Labo : autopilotes dans l'application (création, confiance, classement)`.

### Tâche 13 : autopilote sur le serveur

**Fichiers :** créer `src/runner/autopilot.ts` et son test ; modifier `src/runner/cycle.ts`, `src/runner/main.ts`, `src/runner/market.ts`, `src/runner/config.ts`, `src/runner/brief.ts`, `runner/README.md`, `runner/runner.json.example`.

**Interfaces — consomme :** `tickAutopilot`, `settleOrders`, `trustVerdict`.

**Interfaces — produit :**
- `CycleDeps` reçoit (facultatifs) `klines(symbol, interval, limit, startTime?)`, `binancePrices()`, `markets()`, `smallCaps()`, `availability()`, `fngHistory()`, `mvrvHistory()` ; mémorisations de la fiche 9.5 dans `main.ts`.
- `RunnerConfig` reçoit `autopilotEnabled` et `autopilotTelegram` (vrais par défaut).
- `runAutopilots(bundle, deps, nowMs, device): Promise<{ bundle: SyncBundle; events: { key: string; text: string }[] }>` : tick de chaque autopilote actif et règlement des ordres manuels ; les éléments changés entrent dans le faisceau avec `updatedAt` = maintenant.
- `cycle.ts` : une seule écriture du faisceau pour les autopilotes et la consommation des alertes ; conflit d'empreinte → rien n'est écrit, le cycle suivant recalcule ; messages en file avec la clé `auto:<portfolioId>:<day>` (et `auto:<portfolioId>:<fillAt>` pour un stop ou un objectif), silence nocturne et mode vacances respectés.
- Textes des messages : exemples de la fiche 9.5, à l'identique. Brief du matin : une ligne par portefeuille (valeur, performance, verdict) à la place de la ligne « Papier ».

- [ ] **Étape 1 : écrire les tests** (sur le modèle de `src/runner/cycle.test.ts`, faux GitHub, faux Telegram, fausses bougies) — message envoyé une fois ; conflit d'écriture puis cycle suivant sans doublon ; `--check` sans écriture ni envoi ; silence nocturne ; ordre manuel exécuté par le serveur → même identifiant `fill:<orderId>` que dans l'application.
- [ ] **Étape 2 à 4 : échec, implémentation, succès** ; `npm run build:runner` aboutit.
- [ ] **Étape 5 : commit** — `Runner : autopilotes, ordres papier et messages Telegram`.

### Tâche 14 : non-régression et publication 1.25.0

- [ ] **Étape 1 : test de non-régression** (`src/lib/paper.isolation.test.ts`) — un état avec des portefeuilles papier et des journaux donne exactement les mêmes `computeHoldings`, `useGuidance` (fonction pure sous-jacente) et calculs de `tax.ts` qu'un état sans papier.
- [ ] **Étape 2 :** `npm run bench -- strategies` (ajoute `dca-boussole` en base seule et `trader` à `strategies-bench.json`) ; commit du rapport.
- [ ] **Étape 3 :** entrée « v1.25.0 — Autopilotes » dans `docs/FONCTIONNALITES.md`, `README.md`, `runner/README.md` (nouveaux drapeaux).
- [ ] **Étape 4 :** `npm run typecheck && npm test && npx vite build && npm run build:runner`.
- [ ] **Étape 5 : publier 1.25.0** (procédure de la tâche 15 du lot 1) et rappeler à l'utilisateur de mettre à jour le fichier du runner sur son serveur.
