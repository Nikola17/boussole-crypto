# Labo Boussole : banc d'essai, papier complet, autopilote, signaux sur preuves

Fiche de conception du 15 novembre 2026, pour la version 1.22.1 de l'application. Elle décrit cinq lots à livrer dans l'ordre. Elle est écrite pour la personne (ou l'agent) qui planifiera et codera ces lots sans pouvoir reposer de questions à l'utilisateur.

## 1. En bref

L'utilisateur veut savoir s'il peut faire confiance à Boussole au point de copier ses ordres avec de l'argent réel. Aujourd'hui rien ne le prouve : les signaux n'ont jamais été mesurés, et une mesure rapide montre que plusieurs ne valent rien (annexe A).

Le projet construit cette preuve en cinq lots :

| Lot | Contenu | Version |
|---|---|---|
| 1 | Banc d'essai : rejouer n'importe quelle règle sur l'historique, afficher la fiabilité mesurée de chaque signal | 1.23.0 |
| 2 | Papier complet (2A), puis autopilote et verdict de confiance (2B) | 1.24.0 et 1.25.0 |
| 3 | Signaux refaits sur preuves (version 2 des règles) | 1.26.0 |
| 4 | Suivi : courbe du vrai portefeuille, alertes de signal, copie en réel mesurée | 1.27.0 |
| 5 | DCA et trading alignés sur les preuves, ménage | 1.28.0 |

Idée centrale : **un seul moteur de stratégies**. Une stratégie est une fonction pure qui lit des bougies journalières closes et rend des ordres. Le même moteur la rejoue sur le passé (banc d'essai) et l'exécute jour après jour (autopilote). Un résultat papier se compare donc directement à ce que la règle a fait sur l'historique.

## 2. Intention

- **Ce que veut l'utilisateur (ses mots) :** « si le paper trading marche, c'est que Boussole commence à être efficiente, je peux lui faire confiance et éventuellement copier ses trades avec du fiat réel ».
- **Ce que cela impose :** le papier doit être honnête. Un autopilote qui gagne grâce à des prix inatteignables, à des frais oubliés ou à trois trades chanceux pousserait l'utilisateur à risquer de l'argent sur une illusion.
- **Principe retenu :** la confiance se gagne, se chiffre et se retire. Chaque autopilote porte un verdict calculé sur ses seuls résultats en direct, frais compris, avec des critères écrits à l'avance. Le verdict redescend tout seul si les résultats se dégradent. Il n'existe pas d'état « confiance aveugle ».

## 3. Objectifs, non-objectifs, anti-objectifs

**Objectifs**

1. Chaque signal affiché porte sa fiabilité mesurée (ou la mention « non mesuré »).
2. Des portefeuilles papier en autopilote, un par stratégie, qui donnent le même résultat sur PC, téléphone et serveur, y compris après des jours sans exécution.
3. Un verdict de confiance par autopilote, fondé sur le direct, net de frais réalistes.
4. Des ordres copiables par un humain : annoncés à une heure fixe où il est réveillé, exécutés sur le papier au prix de cette heure-là, sur des cryptos qu'il peut acheter.
5. Des signaux en version 2 dont chaque composant a passé le banc d'essai sur une période qui n'a pas servi à le régler.
6. La mesure de l'écart entre le papier et ce que l'utilisateur obtient en copiant.

**Non-objectifs**

- Aucune exécution réelle automatique, aucune clé d'API avec droit d'achat ou de retrait. L'utilisateur passe ses ordres lui-même (décision antérieure, maintenue).
- Pas de vente à découvert ni de levier sur le papier : au comptant, à l'achat seulement.
- Pas de stratégie intrajournalière : une décision par jour, sur bougies journalières.
- Pas d'apprentissage automatique ni de règle inexplicable. Chaque ordre porte sa raison en une phrase.
- L'IA ne décide aucun ordre de l'autopilote.
- Pas de fonction fiscale nouvelle.

**Anti-objectifs (échec même si « ça marche »)**

- Un historique papier flatteur : exécution au prix de clôture qui a déclenché le signal, frais ignorés, partie simulée présentée comme du direct.
- Des signaux réglés sur le passé qui échouent en direct.
- Un verdict « fiable » obtenu par chance sur trop peu de trades.
- Le papier mélangé au vrai portefeuille (totaux, fiscalité, conseils).
- Un texte qui promet un gain. Tout chiffre de fiabilité s'affiche avec sa référence et son nombre de cas.

## 4. Contraintes

- **Pile technique :** React 19, Vite 7, TypeScript strict, Tailwind 4, Zustand 5 (persist), TanStack Query, Electron 45, Capacitor 8, Vitest. Aucun serveur applicatif. Le runner (`src/runner`, un fichier Node empaqueté par esbuild) tourne sur un VPS et lit le fichier de synchronisation chiffré.
- **Données gratuites uniquement** (tableau en 7.2). Les limites connues : CoinGecko sans abonnement ne donne que 365 jours d'historique et limite les requêtes ; le MVRV gratuit a 7 jours de retard et 4 ans d'historique.
- **Stockage :** les données de l'utilisateur vivent dans `localStorage` (≈ 5 Mo, alerte à 3,5 M de caractères, `src/store/persistence.ts`). Les bougies et les courbes ne s'y enregistrent jamais : elles vont dans IndexedDB (`src/lib/queryCache.ts`) ou se recalculent.
- **Synchronisation :** fusion élément par élément, la date `updatedAt` la plus récente l'emporte (`src/lib/sync/merge.ts`). Toute nouvelle collection entre dans `ITEM_KEYS` ou `STAMP_KEYS`, dans `BACKUP_KEYS` et ses validateurs (`src/lib/backup.ts`), et passe par une migration (`migrateState`, `DATA_VERSION`).
- **Piège Zustand 5 connu :** un sélecteur qui renvoie un nouveau tableau fait boucler React (erreur 185). Filtrer dans un `useMemo`, jamais dans le sélecteur.
- **Conventions du dépôt :** calculs dans `src/lib` en fonctions pures avec tests Vitest à côté ; interface et commentaires en français ; « jamais un chiffre inventé » (une donnée absente s'affiche comme absente) ; une entrée par version dans `docs/FONCTIONNALITES.md`.
- **Dépôt public :** aucune donnée personnelle dans le code, les rapports ou les exemples.

## 5. Approches envisagées

| Approche | Avantages | Inconvénients | Décision |
|---|---|---|---|
| **A. Un moteur unique, trois usages** (banc d'essai, autopilote, affichage de fiabilité) | Résultats papier comparables à l'historique ; un seul code testé ; rattrapage des jours manqués sans serveur | Granularité journalière ; les stratégies ne peuvent lire que des données rejouables, ou doivent se déclarer « non rejouables » | **Retenue** |
| B. Autopilote « en direct seulement » : à chaque cycle, lire les signaux du moment et passer des ordres papier | Rapide à écrire | Jours manqués quand rien ne tourne ; appareils divergents ; aucun lien avec l'historique, donc impossible de distinguer la chance | Écartée |
| C. Outil de backtest externe (Python, TradingView) | Outils riches | Règles dupliquées hors de l'application, qui dérivent ; inutilisable sur téléphone | Écartée |
| D. L'IA décide les ordres | Aucune règle à écrire | Ni reproductible ni vérifiable sur le passé ; coût par décision | Écartée |

L'utilisateur a délégué le choix de l'approche ; A est le choix du concepteur.

Deux sous-choix structurants, eux aussi du concepteur :

- **Où tourne l'autopilote :** dans l'application (rattrapage à chaque ouverture) *et* sur le runner du VPS. Les enregistrements sont déterministes et atomiques par jour, donc les deux peuvent calculer sans se marcher dessus. L'application seule suffit ; le VPS ajoute les messages Telegram à l'heure.
- **À quel prix s'exécute un ordre papier :** jamais au prix de clôture qui a déclenché le signal. En direct : au prix de l'heure d'exécution du lendemain (8 h, heure locale, par défaut). Au banc d'essai : à l'ouverture du lendemain, *et* à la clôture du lendemain comme variante pessimiste. Une règle n'est retenue que si elle tient dans les deux cas.

## 6. Vocabulaire

| Terme | Sens |
|---|---|
| Jour de décision **D** | Jour UTC dont la bougie journalière est close. Les décisions ne lisent que des bougies ≤ D. |
| Jour d'exécution **E** | Date locale du portefeuille à laquelle les ordres décidés sur D s'exécutent. |
| Heure d'exécution | Heure locale d'exécution du portefeuille (`executionHour`, défaut 8 ; `timeZone`, défaut `Europe/Paris`). Instant noté X(E). D est le dernier jour UTC entièrement clos à X(E). |
| Référence | Ce que donne « un jour quelconque » ou la stratégie la plus simple (DCA Bitcoin). Tout résultat s'affiche à côté de sa référence. |
| Épisode | Suite de jours consécutifs où un signal reste actif sur une même crypto. Compte pour un seul cas. |
| Période de réglage / de contrôle | Jusqu'au 31/12/2022 inclus / à partir du 01/01/2023. On règle sur la première, on juge sur la seconde. |
| Rejouable | Se dit d'une donnée (ou d'une stratégie) qu'on peut recalculer pour n'importe quel jour passé. |
| En direct / simulé | « En direct » : jour décidé avec des règles figées avant ce jour, à partir de la création du portefeuille. « Simulé » : partie rejouée sur le passé à la création. |
| R | Multiple du risque initial d'un trade : (prix de sortie − prix d'entrée) ÷ (prix d'entrée − stop). |
| Écart | Différence entre le prix du marché et le prix réellement obtenu, par côté, en %. |

## 7. Architecture commune

### 7.1 Modules

```
src/lib/lab/                 fonctions pures, testées, sans réseau ni React
  types.ts                   Strategy, StrategyContext, Intent, CostModel, Fill, SimResult
  stats.ts                   médiane, intervalle de Wilson, bootstrap à graine fixe, XIRR
  universe.ts                univers de mesure (annexe B), universeAt(), séries chaînées, coupure sur trou
  replayTemp.ts              température rejouable
  events.ts                  étude de signal : rendement après un signal, épisodes, verdicts
  sim.ts                     simulateur de portefeuille jour par jour (banc d'essai, simulation à la création)
  fills.ts                   règles d'exécution communes (marché, limite, stop, objectif)
  metrics.ts                 courbe, performance, baisse maximale, statistiques de trades
  reliability.ts             lecture de la table de fiabilité, phrases d'affichage
  autopilot.ts               tick en direct (lot 2B)
  trust.ts                   verdict de confiance (lot 2B)
  copy.ts                    rapport de copie en réel (lot 4)
  strategies/                une stratégie par fichier + index.ts (registre)
scripts/bench/               outil en ligne de commande (Node, empaqueté par esbuild comme le runner)
src/data/reliability.json    table de fiabilité embarquée, produite par l'outil
src/data/strategies-bench.json  résultats des stratégies sur l'historique, produits par l'outil (lot 2B)
docs/bench/                  rapports datés, protocole, journal des essais (versionnés)
src/pages/Labo.tsx           page « Labo » : Portefeuilles papier, Classement, Banc d'essai, Achats fantômes
```

### 7.2 Sources de données

| Donnée | Source | Profondeur | Rejouable | Limites |
|---|---|---|---|---|
| Bougies 1 jour | `data-api.binance.vision/api/v3/klines` (application, outil) ; `api.binance.com` (runner) | Depuis août 2017 ; les paires retirées restent servies (vérifié le 14/11/2026 : MATIC, EOS, XMR, FTM, WAVES, OMG, HNT…) | Oui | 1000 bougies par requête ; cryptos sans paire USDT : pas de bougie |
| Bougies 1 heure | Idem | Idem | Oui | 1000 heures ≈ 41 jours par requête |
| Fear & Greed | `api.alternative.me/fng/?limit=0` | Depuis février 2018 | Oui | Une valeur par jour |
| MVRV Bitcoin | `bitcoin-data.com/v1/mvrv` (historique) | 4 ans glissants | Oui, avec 7 jours de retard | Absent avant novembre 2022 |
| Rang par capitalisation, FDV, volume 24 h | CoinGecko `coins/markets` | Instantané seulement | **Non** | Limite de requêtes ; clé « Demo » conseillée |
| Disponibilité sur la plateforme d'achat | Liste publique Crypto.com (`src/api/cryptocom.ts`) | Instantané | Non | — |
| Part des stablecoins, taux de financement | CoinGecko, Binance futures | Instantané | Non (exclus de la température rejouable) | — |

Toute stratégie qui lit une donnée non rejouable se déclare `replayable: false` (voir 9.6).

**Identifiants.** En direct, un actif est désigné par son identifiant CoinGecko (`coinId`), comme partout dans l'application. Au banc d'essai, par son symbole Binance (`BTC`, `LUNA#1`). `universe.ts` expose la correspondance des deux seuls identifiants que les stratégies nomment en dur : `bitcoin` ↔ `BTC`, `ethereum` ↔ `ETH`.

### 7.3 Contrat d'une stratégie

```ts
// src/lib/lab/types.ts
export interface CostModel { feePct: number; spreadPct: number }   // par côté, en %

export interface Intent {
  coinId: string; symbol: string; name: string;
  side: 'buy' | 'sell';
  /** Achat : montant fixe, ou montant calculé pour risquer `riskUsd` si le stop est touché (plafonné par `maxUsd`). */
  sizing?: { usd: number } | { riskUsd: number; maxUsd: number };
  /** Vente : part de la position, de 0 (exclu) à 1 (tout). */
  fraction?: number;
  /** Ordres attachés à un achat, posés à son exécution. `targetR` se calcule sur le prix réellement obtenu. */
  stop?: number; targetR?: number;
  /** L'ordre est abandonné si le prix d'exécution sort de ces bornes (le marché a trop bougé depuis la clôture). */
  skipAbove?: number; skipBelow?: number;
  reason: string;            // une phrase, affichée et envoyée telle quelle
  tag?: string;              // 'dca', 'trim', 'setup:breakout', 'time-exit', 'signal-exit'…
}

export interface StrategyContext {
  decidedOn: string;         // D
  execDay: string;           // E
  scheduled: (daysOfWeek: number[]) => boolean;   // E est-il un jour prévu ? (1 = lundi … 7 = dimanche)
  universe: { coinId: string; symbol: string; name: string; rank: number | null; available: boolean | null }[];
  /** Les 400 dernières bougies journalières closes ≤ D (moins si la crypto est récente ; tableau vide si inconnue). */
  candles: (coinId: string) => Candle[];
  temperature: number | null;                      // température rejouable de D
  btcAboveSma200: boolean | null;
  portfolio: { cashUsd: number; equityUsd: number; peakEquityUsd: number;
               positions: { coinId: string; symbol: string; quantity: number; costUsd: number; openedOn: string; stop?: number; target?: number }[];
               lastFillOn: (tag: string, coinId?: string) => string | null };
  /** Données non rejouables, présentes en direct seulement (undefined au banc d'essai). */
  live?: { markets: CgMarket[]; smallCaps: CgMarket[] | null; rules: ProfileRules };   // CgMarket : src/api/coingecko.ts
}

export interface Strategy<P extends Record<string, unknown> = Record<string, unknown>> {
  id: string; version: number;
  label: string; describe: string;
  defaults: P;
  /** Composants dont la version entre dans l'empreinte des règles : 'signals', 'cycle', 'autoBasket'. */
  uses: ('signals' | 'cycle' | 'autoBasket')[];
  replayable: boolean;
  deposit(ctx: Pick<StrategyContext, 'execDay' | 'scheduled'>, p: P): number;
  decide(ctx: StrategyContext, p: P): Intent[];
}
```

**Empreinte des règles** (`rulesOf(strategy)`) : chaîne du type `trader@1+signals2`. Elle assemble `strategy.version` et les constantes `SIGNALS_VERSION` (`src/lib/signals.ts`), `CYCLE_VERSION` (`src/lib/cycle.ts`), `AUTO_BASKET_VERSION` (`src/lib/autoBasket.ts`) des composants listés dans `uses`. Ces trois constantes sont créées au lot 1, à la valeur 1.

### 7.4 Règles d'exécution (`fills.ts`), identiques partout

Notations : `p` prix du marché au moment de l'exécution, `s = spreadPct / 100`, `f = feePct / 100`.

1. **Achat au marché :** prix obtenu `p × (1 + s)` ; frais `montant × f`. Le montant est réduit au cash disponible ; sous `minOrderUsd` (5 USDC), l'ordre est abandonné avec la raison « montant trop petit ».
2. **Vente au marché :** prix obtenu `p × (1 − s)` ; frais sur le produit de la vente ; quantité plafonnée à la position.
3. **Achat dimensionné par le risque :** `quantité = riskUsd ÷ (p × (1 + s) − stop)`, puis plafond `maxUsd` et cash. Si `p × (1 + s) ≤ stop`, abandon.
4. **Bornes :** si `p > skipAbove` ou `p < skipBelow`, abandon avec la raison « le prix a trop bougé depuis la clôture ».
5. **Ordres en attente, lus bougie par bougie dans l'ordre du temps** (`o` ouverture, `h` plus haut, `b` plus bas de la bougie) :
   - stop de vente à `S` : si `o ≤ S`, exécution à `o` (trou de cotation) ; sinon si `b ≤ S`, exécution à `S`. L'écart s'applique ensuite ;
   - objectif (vente limite) à `T` : si `o ≥ T`, exécution à `o` ; sinon si `h ≥ T`, exécution à `T` ;
   - achat limite à `L` : si `o ≤ L`, exécution à `o` ; sinon si `b ≤ L`, exécution à `L` ;
   - stop et objectif touchés dans la même bougie : **le stop gagne** (hypothèse prudente) ;
   - un ordre exécuté annule les ordres du même groupe (`ocoGroup`).
6. **Arrondis :** quantités à 8 décimales, montants au centime.

### 7.5 Déterminisme

- Une stratégie ne lit ni l'horloge ni le réseau. Tout lui arrive par `StrategyContext`.
- Les signaux se calculent toujours sur les 400 dernières bougies journalières **closes** (voir 8.3).
- Les nombres aléatoires (bootstrap) viennent d'un générateur à graine fixe (`mulberry32`, graine = empreinte de l'identifiant du portefeuille).
- Un test compare deux exécutions complètes : résultat strictement identique (`toEqual`).

## 8. Lot 1 — Banc d'essai (1.23.0)

### 8.1 But

Mesurer de façon reproductible ce que vaut chaque signal actuel, l'afficher à côté du signal, et livrer le simulateur dont le lot 2 a besoin.

### 8.2 Ce que l'utilisateur voit

- Sous chaque libellé de signal (fiche d'une crypto) et dans l'info-bulle (liste Signaux), une phrase de fiabilité :

  ```
  Depuis 2019 : vu 913 fois. En hausse 30 jours après dans 55 % des cas
  (un jour quelconque : 48 %). Verdict : validé.
  ```

- Les setups dont le verdict est « sans effet » ou « inversé » passent dans un groupe replié « Peu fiables d'après l'historique ».
- Un libellé investisseur ou trader garde sa place même avec un mauvais verdict : c'est la phrase de fiabilité qui le dit, jusqu'au lot 3.
- Une page **Labo** (route `/labo`, entrée de menu « Labo » à la place de « Papier » ; `/papier` continue de fonctionner et ouvre l'onglet Papier). Onglet **Banc d'essai** :
  - le tableau de tous les signaux mesurés, triés par verdict, avec fréquence, taux, médiane, référence, période de contrôle, date des données ;
  - « Rejouer sur une crypto » : choisir une crypto, lancer l'étude sur son seul historique, avec un avertissement quand il y a moins de 12 épisodes ;
  - la méthode expliquée en dix lignes, limites comprises (annexe A, « Limites »).

### 8.3 Signaux sur bougies closes

Aujourd'hui `analyze()` reçoit la bougie du jour, encore incomplète : le libellé change en cours de journée, et ce qui est affiché n'est pas ce qui est mesurable.

- `analyze(candles, ctx, opts?)` et `detectSetups` reçoivent `opts.closedOnly` (défaut `false`). À `true`, le tableau ne contient que des bougies closes et `volumeRatio` compare la dernière bougie à la moyenne des 20 précédentes (au lieu d'écarter la dernière).
- `useScan`, la fiche d'une crypto, `useBasket` et le calculateur de Trading retirent la bougie en cours et appellent `closedOnly: true`. Le cours affiché reste le cours du moment ; seuls les libellés et les setups se figent une fois par jour (0 h UTC).
- Le banc d'essai mesure exactement cette variante.

### 8.4 Données d'historique

- **Outil (`scripts/bench/fetch.ts`) :** `loadDaily(symbol)` pagine les bougies depuis le 17/08/2017, écrit `.cache/bench/<SYMBOLE>-1d.json` (dossier ajouté à `.gitignore`), réutilise le cache s'il a moins de 24 h, retire la bougie en cours. Idem pour le Fear & Greed (`fng.json`) et le MVRV (`mvrv.json`).
- **Application (`src/api/history.ts`) :** `getDailyHistory` existe déjà (`src/api/binance.ts`). L'historique complet d'une crypto se range dans IndexedDB (base `boussole-cache`, clé `hist:<SYMBOLE>:1d`, avec sa date) et se complète par la fin quand sa dernière bougie a plus d'un jour.
- **Univers de mesure (`universe.ts`, liste en annexe B) :**
  - `splitOnGaps(candles, 5)` : une interruption de plus de 5 jours coupe la série en deux actifs distincts (`LUNA#1`, `LUNA#2`). Cas visé : l'ancienne LUNA, dont le symbole a été réutilisé.
  - Séries chaînées, migration 1 pour 1 : `MATIC→POL`, `RNDR→RENDER`, `FTM→S`. Le chaînage n'a lieu que si l'écart de prix à la jonction est inférieur à 10 % ; sinon les deux séries restent séparées et le rapport le signale.
  - `universeAt(day, { top, minBars })` : les actifs qui ont au moins `minBars` bougies closes à cette date (défaut 200) et dont la série n'est pas terminée, classés par médiane du volume en dollars des 30 jours précédents ; les `top` premiers (20 ou 50). Stablecoins, jetons « wrapped » et or tokenisé exclus (`isStable`, `isWrappedOrStaked`, `isGold` de `src/lib/portfolio.ts`). C'est un substitut au classement par capitalisation, qui n'existe pas en historique gratuit ; le rapport le dit.
- **Température rejouable (`replayTemp.ts`) :** `temperatureAt(day, btcDaily, fngByDay, mvrvByDay)` appelle `computeCycle` avec les bougies Bitcoin ≤ `day` (1500 dernières), le Fear & Greed du jour et le MVRV de `day − 7 jours` (pour reproduire le retard de la source). Sans part des stablecoins ni taux de financement. Un test vérifie qu'elle rend la même valeur que `computeCycle` appelé à la main avec ces entrées.

### 8.5 Étude de signal (`events.ts`)

Une **observation** est un couple (actif, jour `t`) où l'actif appartient à `universeAt(t, { top: 50 })`.

- **Entrées du signal :** les 400 dernières bougies closes ≤ `t`, la température rejouable de `t`, l'écart au plus haut historique connu à `t` (plus haut de la série jusqu'à `t`).
- **Rendement à l'horizon H :** `clôture[t+H] ÷ ouverture[t+1] − 1`. L'entrée se fait à l'ouverture du lendemain, jamais à la clôture qui a produit le signal.
  - Série terminée avant `t+H` parce que la paire a été retirée : on prend la dernière clôture connue, et le cas est compté comme « sortie forcée ».
  - Série qui s'arrête parce que `t+H` est dans le futur : observation exclue pour cet horizon.
- **Référence :** toutes les observations du même univers et de la même période, sans condition.
- **Épisodes :** jours consécutifs où la clé est active sur un même actif ; l'épisode se mesure depuis son premier jour.
- **Excès du jour :** rendement de l'observation moins la moyenne des rendements de tous les actifs de l'univers ce jour-là, au même horizon. Il isole le choix de la crypto du mouvement général du marché.
- **Statistiques par clé et par horizon :** jours, épisodes, taux de hausse (part des épisodes au rendement > 0), intervalle de Wilson à 90 % sur les épisodes, médiane, moyenne, médiane de l'excès du jour, médiane de la pire baisse pendant la fenêtre (plus bas atteint ÷ prix d'entrée − 1), taux de la référence ; le tout aussi par période (réglage, contrôle).

Chaque clé déclare son intention (`bias` : `bull`, `bear`, `neutral`) et son horizon principal.

| Famille | Clés | Horizon principal | Autres horizons |
|---|---|---|---|
| Signal investisseur | `inv:<libellé>` (5) | 90 jours | 30, 180, 365 |
| Signal trader | `tr:<libellé>` (5) | 14 jours | 7, 30 |
| Setups | `setup:<clé>` (9) | 30 jours | 7, 14 |
| Zone de température, sur Bitcoin seul | `temp:<zone>` (5) | 365 jours | 90, 180 |
| Plan de trade selon le signal trader | `plan:<libellé>` | 30 jours | — |

Le **plan de trade** se mesure en R : entrée à l'ouverture de `t+1`, stop du plan, objectif à 1,5 R, 2 R et 3 R (trois variantes), règles de 7.4 sur bougies journalières, sortie forcée à la clôture du 30ᵉ jour.

**Verdict** (pour une clé haussière ; l'inverse pour une clé baissière) :

| Verdict | Condition |
|---|---|
| Trop peu de cas | Moins de 30 épisodes au total, ou moins de 12 en période de contrôle |
| Validé | En contrôle : taux ≥ référence + 5 points, borne basse de Wilson > taux de la référence, et médiane de l'excès > 0 dans les deux périodes |
| Prometteur | Taux > référence + 3 points et médiane de l'excès > 0 dans les deux périodes, sans que l'intervalle exclue la référence |
| Inversé | En contrôle : taux ≤ référence − 5 points et médiane de l'excès < 0 dans les deux périodes |
| Sans effet | Tout le reste |

Pour les clés `plan:*`, le verdict se lit sur l'espérance en R, frais « plateforme d'échange » (9.3) compris : « validé » si elle dépasse +0,15 R en contrôle et reste positive en réglage ; « inversé » si elle est négative dans les deux périodes ; « sans effet » sinon.

« Rejouer sur une crypto » applique la même étude à un seul actif : la référence est alors l'ensemble de ses propres jours, et l'excès du jour n'est pas calculé.

### 8.6 Simulateur (`sim.ts`) et mesures (`metrics.ts`)

`simulate(strategy, params, data, config)` avec `config = { startCashUsd, costs, fill: 'nextOpen' | 'nextClose', from, to, minOrderUsd }`.

Ordre des opérations pour chaque jour d'exécution E (ici E = jour UTC, D = E − 1). Il suit l'ordre réel du temps, donc il dépend du mode :

| Étape | Mode `nextOpen` | Mode `nextClose` |
|---|---|---|
| 1 | Versement de la stratégie (`deposit`) : ajouté au cash, compté comme apport | Idem |
| 2 | `decide(ctx)` : données ≤ D, portefeuille tel qu'à la clôture de D | Ordres en attente (stops, objectifs) contre la bougie de E |
| 3 | Exécution des ordres à `ouverture[E]` | `decide(ctx)` : données ≤ D, portefeuille après l'étape 2 |
| 4 | Ordres en attente contre la bougie de E, positions du jour comprises (pour une position ouverte ce jour-là, la règle du trou de cotation ne s'applique pas) | Exécution des ordres à `clôture[E]` |
| 5 | Valorisation à la clôture de E | Idem |

`ctx.universe` vaut `universeAt(D, { top: 20 })`, avec `rank` = rang par volume et `available` = `null`.

Une position sur une paire retirée se solde à la dernière clôture connue (exécution de type `delist`).

Sorties : la série journalière (valeur, cash, apports), les exécutions, les trades clos (appariement premier entré, premier sorti, par crypto).

`metrics.ts` :

- performance pondérée par le temps (TWR : rendements journaliers chaînés, apports comptés en début de journée), annualisée au-delà de 365 jours ;
- performance pondérée par l'argent (XIRR, par dichotomie entre −99 % et +1000 %) ;
- baisse maximale sur l'indice TWR ; part du temps investi ;
- trades : nombre, taux de réussite, gain et perte moyens, espérance en % et en R, facteur de profit, plus longue série de pertes, frais et écarts payés ;
- `rollingWindows(series, L)` : distribution (10ᵉ, 50ᵉ, 90ᵉ centiles) du TWR sur toutes les fenêtres de L jours, pour L = 30, 60, 90, 180, 365 ;
- `referenceDcaBtc(apports, prixBtc, costs)` et `referenceHoldBtc(capital, prixBtc, costs)` : les deux références.

Deux stratégies entrent au registre dès ce lot, pour valider le simulateur : `dca-btc` et `investisseur` (définies en 9.6).

### 8.7 Outil en ligne de commande

`npm run bench -- <commande>` : esbuild empaquette `scripts/bench/main.ts` vers `.cache/bench/bench.mjs`, puis Node l'exécute.

| Commande | Effet |
|---|---|
| `signals` | Étude de tous les signaux de 8.5 → `docs/bench/AAAA-MM-JJ-signaux-v<SIGNALS_VERSION>.md` et `src/data/reliability.json` |
| `strategies` | Chaque stratégie du registre, du 01/01/2019 à la veille, modes `nextOpen` et `nextClose`, frais « plateforme d'échange » et « application » (9.3) → rapport daté et `src/data/strategies-bench.json` |
| `compare <a> <b>` | Deux stratégies ou deux jeux de paramètres côte à côte |

- Chaque rapport commence par la date des données, l'univers, les conventions et les limites.
- À données identiques, deux exécutions produisent des fichiers identiques.
- Schéma de `strategies-bench.json` : `{ generatedAt, dataThrough, entries: Record<strategyId, { rules: string; runs: { fill: 'nextOpen' | 'nextClose'; costs: 'exchange' | 'app'; twrPct: number; twrPerYearPct: number; maxDrawdownPct: number; referenceTwrPct: number; trades: number; expectancyR: number | null; windows: Record<'30' | '60' | '90' | '180' | '365', { p10: number; p50: number; p90: number }> }[] }> }`.
- L'outil ne tourne pas en intégration continue (réseau). En revanche un test unitaire vérifie le schéma de `reliability.json` et que son champ `rulesVersion` égale `SIGNALS_VERSION` : changer les signaux sans régénérer la table casse la suite de tests.

Schéma de `reliability.json` :

```ts
{ generatedAt: string; dataThrough: string; rulesVersion: number;
  universe: { assets: number; from: string; top: number };
  entries: Record<string, {
    label: string; bias: 'bull' | 'bear' | 'neutral'; horizon: number;
    days: number; episodes: number; frequencyPct: number;
    hitPct: number; hitLow: number; hitHigh: number; medianPct: number; excessMedianPct: number;
    baselineHitPct: number; baselineMedianPct: number;
    control: { episodes: number; hitPct: number; medianPct: number; baselineHitPct: number };
    verdict: 'validé' | 'prometteur' | 'sans effet' | 'inversé' | 'trop peu de cas';
    expectancyR?: number;            // clés plan:*
  }> }
```

### 8.8 Correctif livré avec ce lot : frais du papier

- [src/pages/Paper.tsx](../../../src/pages/Paper.tsx) ligne 64 calcule `quantité × prix × 0,1 × 100 ÷ 100`, soit **10 %** de frais au lieu de 0,1 %. Les achats fantômes, eux, sont justes.
- Correction de la formule, et fonction idempotente `fixPaperFees(trades)` appliquée au chargement du magasin : tout ordre non fantôme dont les frais dépassent 5 % du montant reçoit `arrondi(montant × 0,001, 2)` et un nouvel `updatedAt` (la correction se propage par la synchronisation). Pas de changement de `DATA_VERSION` : la forme des données ne change pas.

### 8.9 Fichiers

- **Nouveaux :** `src/lib/lab/{types,stats,universe,replayTemp,events,sim,fills,metrics,reliability}.ts` et leurs tests, `src/lib/lab/strategies/{index,dcaBtc,investisseur}.ts`, `src/api/history.ts`, `scripts/bench/{main,fetch,report}.ts`, `src/data/reliability.json`, `src/pages/Labo.tsx`, `docs/bench/`.
- **Modifiés :** `src/lib/signals.ts` (`closedOnly`, `SIGNALS_VERSION`), `src/lib/indicators.ts` (`volumeRatio`), `src/lib/cycle.ts` (`CYCLE_VERSION`), `src/lib/autoBasket.ts` (`AUTO_BASKET_VERSION`), `src/hooks/useMarket.ts`, `src/hooks/useBasket.ts`, `src/pages/{CoinDetail,Market,Trading,Paper}.tsx`, `src/components/uikit/badges.tsx` (`SignalBadge`), `src/components/Layout.tsx`, `src/App.tsx`, `src/store/useStore.ts`, `package.json` (script `bench`), `.gitignore`.

### 8.10 Critères d'acceptation

1. `npm run bench -- signals` aboutit à partir d'un cache vide ; relancé, il produit des fichiers identiques.
2. Tests unitaires : rendement avec entrée à l'ouverture de `t+1` ; fusion en épisodes ; intervalle de Wilson sur trois cas calculés à la main ; les cinq verdicts ; `universeAt` ; coupure sur trou ; chaînage et son refus au-delà de 10 % ; température rejouable.
3. Tests du simulateur sur une série synthétique de 60 bougies dont les exécutions et la valeur finale sont calculées à la main : trou de cotation sous le stop, stop et objectif dans la même bougie, cash insuffisant, montant minimal, paire retirée, les deux modes d'exécution.
4. Tests des mesures : TWR insensible à un apport ; XIRR sur un cas connu ; baisse maximale.
5. Test de déterminisme (7.5).
6. Le rapport retrouve les ordres de grandeur de l'annexe A (même sens pour chaque ligne du tableau ; les valeurs diffèrent, l'univers et la convention d'entrée ayant changé). Tout écart de sens est expliqué dans le rapport.
7. Dans l'application : la phrase de fiabilité apparaît pour les libellés investisseur et trader et pour chaque setup ; la page Labo s'affiche sur téléphone sans défilement horizontal ; « Rejouer sur une crypto » fonctionne hors ligne après un premier chargement.
8. Un ordre papier de 100 USDC paie 0,10 USDC de frais ; un ancien ordre à 10 USDC de frais est ramené à 0,10 USDC au chargement, une seule fois.

## 9. Lot 2 — Papier complet (2A, 1.24.0) et autopilote (2B, 1.25.0)

### 9.1 But

2A : un vrai simulateur de portefeuille manuel. 2B : des portefeuilles qui suivent seuls les règles de Boussole, un verdict de confiance, et l'ordre du jour de chaque autopilote dans l'application et sur Telegram.

### 9.2 Modèle de données (`DATA_VERSION` 3)

```ts
export interface PaperPortfolio {
  id: string; updatedAt?: UpdatedAt;
  name: string;
  kind: 'manual' | 'auto';
  startingUsd: number;
  createdAt: string;                                   // ISO
  costs: CostModel & { preset: 'exchange' | 'app' | 'measured' | 'custom' };
  archived?: boolean; paused?: boolean;
  // Autopilote seulement
  strategyId?: string;
  rules?: string;                                      // empreinte des règles, figée à la création
  params?: Record<string, number | string | boolean | number[]>;
  liveSince?: string;                                  // premier jour d'exécution en direct (AAAA-MM-JJ)
  backfillFrom?: string;                               // début de la partie simulée, si demandée
  executionHour?: number; timeZone?: string;           // défauts : 8, 'Europe/Paris'
  cursorDay?: string;                                  // dernier jour d'exécution traité
  settledTo?: string;                                  // heure ISO jusqu'où les ordres en attente ont été contrôlés
  universe?: { coinId: string; symbol: string; name: string; rank: number | null }[];
  universeWeek?: string;                               // semaine ISO de la dernière mise à jour de l'univers
}

export interface PaperOrder {                          // portefeuilles manuels
  id: string; updatedAt?: UpdatedAt; portfolioId: string;
  coinId: string; symbol: string; name: string;
  side: 'buy' | 'sell'; type: 'limit' | 'stop' | 'target';
  price: number;                                       // USD
  usd?: number; quantity?: number;                     // vente sans quantité : toute la position
  ocoGroup?: string;
  createdAt: string; expiresAt: string;                // défaut : 90 jours
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  filledAt?: string;
}

export interface PaperFill {
  coinId: string; symbol: string; name: string;
  side: 'buy' | 'sell';
  kind: 'market' | 'stop' | 'target' | 'delist';
  quantity: number;
  marketUsd: number;                                   // prix du marché à l'exécution
  priceUsd: number;                                    // prix obtenu, écart compris
  feeUsd: number;
  at: string;                                          // instant ISO
  reason: string; tag?: string;
  stop?: number; target?: number;                      // ordres attachés créés par cet achat
}

export interface PaperDayLog {                         // portefeuilles en autopilote
  id: string;                                          // `${portfolioId}:${day}`
  updatedAt?: UpdatedAt;
  portfolioId: string;
  day: string;                                         // E
  decidedOn: string;                                   // D
  rules: string;
  depositUsd: number;
  fills: PaperFill[];
  skipped: { symbol: string; why: string }[];
  lateDays?: number;                                   // stratégie non rejouable exécutée en retard
  by: string;                                          // appareil qui a écrit
}
```

`PaperTrade` (existant) reçoit `portfolioId?: string` (absent pour un achat fantôme, qui ne vit dans aucun portefeuille), `orderType?: 'market' | 'limit' | 'stop' | 'target'`, `orderId?: string`, `marketUsd?: number`, `reason?: string`.

- **Nouvelles collections synchronisées (`ITEM_KEYS`, `BACKUP_KEYS`, listes d'objets de `backup.ts`) :** `paperPortfolios`, `paperOrders`, `paperDays`. Le runner les lit dans `watchOf` (`src/runner/evaluate.ts`).
- **Migration 2 → 3 (`migrateState`) :**
  - crée le portefeuille `{ id: 'manuel', name: 'Papier manuel', kind: 'manual', startingUsd: paper.startingUsd ?? 1000, createdAt: paper.resetAt ?? date du premier ordre ?? maintenant, costs: préréglage 'exchange' }`, même sans ordre ;
  - pose `portfolioId: 'manuel'` sur tout ordre papier non fantôme ;
  - initialise `paperOrders` et `paperDays` à vide ;
  - laisse la rubrique `paper` en place (un appareil pas encore mis à jour la lit toujours) ; elle n'est plus utilisée et sera retirée au lot 5.
- **État d'un portefeuille en autopilote :** fonction pure de ses `PaperDayLog` rejoués dans l'ordre des jours (`autoState(portfolio, logs)` : cash, positions, ordres attachés ouverts, plus haut de la valeur). Il n'a ni `PaperTrade` ni `PaperOrder`.
- **Écriture idempotente :** `applyPaperDays(logs, portfolios)` n'écrit un enregistrement que si son contenu diffère de l'existant, sans tenir compte de `updatedAt` ni de `by`. Deux appareils qui calculent le même jour ne déclenchent aucun aller-retour de synchronisation.
- **Curseur effectif :** le plus grand de `portfolio.cursorDay` et du dernier `PaperDayLog.day`. Une fusion qui ferait reculer `cursorDay` ne fait que recalculer un jour à l'identique.
- **Jours sans événement :** aucun enregistrement. Seul `cursorDay` avance.
- **Volume attendu :** moins de 150 Ko par portefeuille et par an (un test le vérifie sur une année simulée de la stratégie `trader`).
- **Suppression d'un portefeuille :** ses ordres, exécutions et jours partent avec lui, et chaque suppression s'inscrit au registre `deletions`.

### 9.3 Frais et écarts

| Préréglage | Frais par côté | Écart par côté | Usage |
|---|---|---|---|
| `exchange` — plateforme d'échange, ordre au marché | 0,10 % | 0,05 % | Défaut |
| `app` — application grand public, achat instantané | 0 % | 1,50 % | Comparaison systématique |
| `measured` — « mes frais mesurés » | 0 % | Médiane mesurée par la carte « Frais réels » (`spreadStats`, `src/lib/fees.ts`), bornée entre 0,05 % et 5 % | Proposé seulement avec 5 achats mesurés ou plus |
| `custom` | Saisi | Saisi | — |

Chaque portefeuille affiche aussi son résultat « avec les frais d'une application grand public » : mêmes exécutions, autres frais (`repriceWithCosts(fills, costs)`). C'est la réponse chiffrée à « est-ce copiable là où j'achète ? ».

### 9.4 Lot 2A — Papier complet

**Ce que l'utilisateur voit (Labo → Portefeuilles papier)**

```
┌ Papier manuel                          Manuel ┐
│ 1 043,20 USDC    +4,3 % depuis le 18/11       │
│ Même mise en Bitcoin : +6,1 %                 │
│ ▁▂▃▃▅▆▅▇                                      │
└───────────────────────────────────────────────┘
[ Nouveau portefeuille ]
```

Détail d'un portefeuille :

- en-tête : valeur, cash, performance, baisse maximale, comparaison avec la même mise en Bitcoin, résultat avec les frais d'une application ;
- courbe de valeur avec la ligne de référence Bitcoin ;
- onglets Positions, Ordres en attente, Historique, Statistiques ;
- ticket d'ordre : crypto, sens, type (au marché, limite, stop), montant en USDC *ou* quantité, stop et objectif facultatifs attachés à un achat, aperçu des frais et de l'écart, rapport gain/risque si stop et objectif sont saisis ;
- renommer, remettre à zéro, archiver, supprimer.

Les achats fantômes restent tels quels, dans leur propre onglet.

**Exécution**

- Ordre au marché : immédiat, au cours du moment, règles de 7.4.
- Ordres en attente : `settleOrders(portfolio, orders, trades, candlesByCoin)` lit les bougies **1 heure** closes depuis `createdAt` (arrondi à l'heure suivante), dans l'ordre, règles de 7.4.
  - Une exécution crée un `PaperTrade` d'identifiant `fill:<orderId>` : deux appareils qui exécutent le même ordre produisent le même élément.
  - Un achat exécuté qui portait un stop et un objectif crée les deux ordres de vente dans un même `ocoGroup`.
  - Passé `expiresAt`, l'ordre passe à `expired`.
  - Au-delà de 41 jours à relire, pagination par `startTime` (12 pages au plus).
- Un ordre en attente n'est accepté que pour une crypto qui a une paire USDT sur Binance (`binanceSymbolFor`). Sinon le ticket le dit : « Ordres limites et stops : seulement pour les cryptos cotées sur Binance, faute de bougies horaires ».
- Le règlement tourne au lancement, puis toutes les 15 minutes tant que l'application est ouverte (crochet `usePaperSettle`, monté dans `AppEffects`).

**Courbe et statistiques**

- `paperEquitySeries(portfolio, trades, closesByCoin)` : calculée, jamais enregistrée, à partir des clôtures journalières (cache IndexedDB du lot 1).
- Une crypto sans historique est valorisée à son dernier prix connu, et la courbe porte la mention « valorisation partielle ».
- Statistiques : celles de `metrics.ts`.

### 9.5 Lot 2B — Le tick de l'autopilote (`autopilot.ts`)

```
tick(P, maintenant, sources):
  pour E du lendemain du curseur effectif jusqu'à la date locale d'aujourd'hui :
    si maintenant < X(E) : arrêter
    D ← (date UTC de X(E)) − 1 jour
    régler les ordres attachés sur les bougies 1 heure jusqu'à X(E)        (1)
    si semaine ISO de E ≠ P.universeWeek : rafraîchir l'univers             (2)
    ctx ← contexte(P, D, E)                                                  (3)
    apport ← strategy.deposit(ctx) ; ordres ← strategy.decide(ctx)
    exécuter les ordres au prix d'ouverture de la bougie 1 heure qui contient X(E)   (4)
    écrire le PaperDayLog de E s'il y a un apport, une exécution ou un abandon
    P.cursorDay ← E
  régler les ordres attachés jusqu'à la dernière bougie 1 heure close       (5)
```

1. Un ordre attaché déclenché à l'instant τ appartient au jour E tel que X(E) ≤ τ < X(E+1). Si ce jour n'a pas encore d'enregistrement, il est créé avec cette seule exécution.
2. **Univers :** les 20 premières capitalisations hors stablecoins, jetons « wrapped » et or (`topBaseUniverse`, `src/lib/autoBasket.ts`), avec leur disponibilité sur la plateforme d'achat si la liste est chargée. Il se fige dans le portefeuille pour la semaine : tous les appareils lisent la même liste. Au rattrapage de plusieurs semaines, la liste du moment vaut pour toutes les semaines manquées. Une crypto sans paire USDT sur Binance sort de l'univers (pas de bougies).
3. `contexte` : bougies journalières closes ≤ D (400 par crypto), température rejouable de D, position de Bitcoin par rapport à sa moyenne 200 jours, état du portefeuille après (1).
4. Sans bougie 1 heure pour cet instant (source indisponible) : le tick s'arrête et réessaiera. Aucun prix de remplacement. De même, une stratégie non rejouable dont `ctx.live` manque ne décide pas.
5. Tourne à chaque passage, même sans nouveau jour.

X(E) se calcule avec `Intl.DateTimeFormat` et le fuseau du portefeuille, sur le modèle de `nyEpoch` dans `src/runner/brief.ts` : jamais avec le fuseau de la machine, qui diffère entre le téléphone et le serveur.

**Stratégie non rejouable et jours manqués :** l'apport de chaque échéance manquée est crédité à sa date ; seule la dernière échéance manquée est exécutée, aux données du moment, avec `lateDays` renseigné ; les autres laissent une ligne `skipped` (« aucun appareil n'a tourné ce jour-là »).

**Changement de règles :** si l'empreinte calculée par l'application diffère de `portfolio.rules`, le tick ne touche pas ce portefeuille. L'application l'archive (« anciennes règles », consultable) et en crée un neuf avec les mêmes réglages et le même capital de départ. Le verdict de confiance repart de zéro. Modifier un paramètre, les frais ou l'heure d'exécution fait de même : les réglages d'un autopilote sont figés à sa création.

**Où le tick tourne**

- **Application :** crochet `useAutopilot` dans `AppEffects`, au lancement puis toutes les 15 minutes. Si la synchronisation est active, une lecture du fichier distant précède le tick.
- **Runner :** dans `runCycle` (`src/runner/cycle.ts`), après la lecture du faisceau. Nouvelles dépendances injectées : `klines(symbol, interval, limit, startTime?)`, `binancePrices()`, `markets()` (top 250, mémorisé 24 h), `smallCaps()` (pages 2 à 5, mémorisé 24 h, seulement si une stratégie le demande), `availability()` (mémorisé 6 h), `fngHistory()`, `mvrvHistory()`. Les enregistrements nouveaux ou modifiés entrent dans le faisceau avec `updatedAt = maintenant`, et partent dans **la même écriture** que la consommation des alertes. En cas de conflit d'empreinte, rien n'est écrit : le cycle suivant recalcule.
- Le runner règle aussi les ordres en attente des portefeuilles manuels (mêmes identifiants `fill:<orderId>`) et prévient sur Telegram quand l'un d'eux s'exécute.
- **Android :** rien ne tourne en arrière-plan. Le rattrapage à l'ouverture donne le même résultat.
- **Limite :** 6 autopilotes actifs au plus.

**Messages** (runner ; drapeaux `autopilotEnabled` et `autopilotTelegram`, vrais par défaut ; clé de dédoublonnage `auto:<portfolioId>:<day>` ; silence nocturne et mode vacances respectés)

```
Autopilote « Trader » — ordres du 17/11 (papier)
ACHAT SOL : 62 USDC à ≈ 158,20 $ — cassure avec volume, signal trader « Achat fort »
  stop 146,90 $ (−7,1 %), objectif 180,80 $ (+14,3 %)
VENTE LINK : toute la position à ≈ 14,02 $ — durée maximale atteinte (+3,1 %)
Confiance : en observation (jour 12 sur 90). Ne copie pas encore.
```

Un stop ou un objectif touché part aussitôt : « Autopilote « Trader » : stop touché sur SOL à 146,90 $ (−1 R) ». Le brief du matin remplace la ligne « Papier » par une ligne par portefeuille (valeur, performance, verdict).

Dans l'application : une carte « Autopilotes » sur le Cockpit (ordres du jour et verdicts) ; aucune notification système quand le serveur veilleur a pointé depuis moins de 45 minutes, pour éviter le doublon avec Telegram.

**Création d'un autopilote**

1. Choix de la stratégie : une carte par stratégie, avec sa description et son résultat sur l'historique tiré de `strategies-bench.json` (« De 2019 à 2026 : +x % par an, pire baisse −y %. DCA Bitcoin simple : … »), suivi de « Une simulation flatte toujours un peu : seul le direct compte pour la confiance ».
2. Réglages : capital ou montant et jours des échéances (bouton « Reprendre les réglages de mon panier » pour les stratégies DCA), frais, heure d'exécution.
3. Option « Montrer ce qu'elle aurait fait depuis un an » : `simulate` en mode `nextOpen` sur bougies journalières, résultat gardé dans IndexedDB (jamais synchronisé, recalculable). Refusée pour une stratégie non rejouable.
4. « Démarre demain à 8 h. » À la création, `cursorDay` vaut la date locale du jour : le premier jour d'exécution est le lendemain, et `liveSince` vaut la date de ce lendemain.

La courbe d'un autopilote trace la partie simulée en pointillé et la partie en direct en trait plein, séparées par un repère « en direct depuis le JJ/MM ».

### 9.6 Les stratégies de la version 1

Paramètres communs aux stratégies à échéances : `amountUsd` (défaut 25), `daysOfWeek` (défaut `[2, 5]`, mardi et vendredi). `deposit` rend `amountUsd` les jours prévus, 0 sinon.

**`dca-btc` — « DCA Bitcoin simple » (référence).** `uses: []`, rejouable. Chaque jour prévu : achat de Bitcoin pour `amountUsd`. Raison : « Échéance : Bitcoin, sans modulation ».

**`investisseur` — « Investisseur (température) ».** `uses: ['cycle']`, rejouable. C'est la partie de Boussole que la mesure valide.

- Paramètres : `weights` (défaut Bitcoin 75 %, Ethereum 25 %), `trimPct` 7,5, `trimMinDays` 30.
- Chaque jour prévu : budget = `amountUsd × temperatureMultiplier(T)` (`src/lib/dca.ts` : ×2 sous 20, ×1,5 sous 40, ×1 sous 60, ×0,5 sous 80, ×0,25 au-delà ; ×1 si T inconnue), plafonné au cash. Réparti selon `weights`. Le reste demeure en cash : c'est la réserve. Raison : « Température 34/100 : échéance ×1,5 ».
- Tout jour où T ≥ 80 et où le dernier allègement (`lastFillOn('trim')`) date de `trimMinDays` jours ou plus : vente de `trimPct` % de chaque position. Raison : « Euphorie (83/100) : une tranche de 7,5 % ».

**`dca-boussole` — « DCA Boussole » (le panier automatique).** `uses: ['signals', 'cycle', 'autoBasket']`, **non rejouable**.

- Paramètres : `basePct` 70, `maxBaseLines` 3, `maxDiscoveryLines` 3, `discoverySource` `'both'`, `minOrderUsd` 5.
- Chaque jour prévu : `planAutoBasket` (`src/lib/autoBasket.ts`) avec la température rejouable, les candidates de base (univers du portefeuille, score investisseur calculé par `analyze` en bougies closes, variation 7 jours tirée des bougies), les découvertes (`ctx.live`), et l'état **du portefeuille papier** pour les montants détenus, le nombre de lignes et la réserve (son cash).
- L'assemblage de ce contexte vit aujourd'hui dans le crochet React `useBasket`. Il est extrait en fonction pure `buildAutoBasketPlan(inputs)` (`src/lib/autoBasket.ts`), que le crochet et la stratégie appellent tous deux. Entrées : lignes de marché, petites capitalisations, scores, disponibilité, température, valeurs détenues, valeur totale, règles du profil, réglages du panier.
- Au banc d'essai, `ctx.live` est absent : seule la base est simulée (`basePct` forcé à 100), et le rapport le dit.

**`trader` — « Trader (setups avec stop) ».** `uses: ['signals']`, rejouable.

- Paramètres : `riskPct` (défaut : `riskPerTradePct` du profil, soit 1), `maxPositions` 5, `maxPositionPct` 20, `targetR` 2, `maxHoldDays` 30, `cooldownDays` 5, `maxChasePct` 3, `regime` vrai, `pauseDrawdownPct` 20, `onlyAvailable` vrai, `setups` : les setups haussiers au verdict « validé » ou « prometteur » dans `reliability.json` (attendus d'après l'annexe A : `breakout`, peut-être `oversold` et `macd`). Liste vide : la stratégie n'ouvre aucune position, et sa carte l'explique (« aucun setup validé pour l'instant »).
- **Sorties, pour chaque position :**
  1. détenue depuis `maxHoldDays` jours ou plus : vente totale, « durée maximale atteinte » ;
  2. sinon, signal trader à « Vente forte » : vente totale, « signal trader passé à Vente forte ».
- **Pause :** valeur ≤ plus haut × (1 − `pauseDrawdownPct` %) : plus aucune entrée, jusqu'à ce que la valeur repasse plus haut × (1 − `pauseDrawdownPct` % ÷ 2).
- **Entrées**, hors pause, et si `regime` est faux ou si Bitcoin clôture au-dessus de sa moyenne 200 jours :
  1. candidates : cryptos de l'univers sans position, hors délai de `cooldownDays` après une sortie au stop, disponibles sur la plateforme si `onlyAvailable`, dont le signal trader est haussier, qui ont un plan (`analysis.plan`) et au moins un setup de `setups` ;
  2. tri par score trader décroissant, puis par rang ;
  3. pour chacune, dans la limite des places libres : `stop = plan.stop`, `c = clôture[D]`, `sizing = { riskUsd: valeur × riskPct %, maxUsd: min(valeur × maxPositionPct %, cash restant) }`, `targetR`, `skipAbove = c × (1 + maxChasePct %)`, `skipBelow = stop`. Raison : libellé du setup, puis libellé et score du signal trader.

La variante sans stop en séance (sortie décidée à la clôture, pour une plateforme sans ordre stop) n'est pas livrée ici : elle est mesurée au lot 3.

### 9.7 Verdict de confiance (`trust.ts`)

Calculé sur les seuls jours en direct, frais du portefeuille compris.

| Critère | Stratégies à trades (`trader`) | Stratégies à échéances |
|---|---|---|
| C1 Durée | 90 jours en direct | 90 jours en direct |
| C2 Échantillon | 30 trades clos | 20 échéances |
| C3 Résultat | Performance > 0 et espérance par trade > 0 | Performance > celle de la référence DCA Bitcoin (mêmes apports, mêmes frais) |
| C4 Risque | Baisse maximale ≤ 25 % | Baisse maximale ≤ celle de la référence + 5 points |
| C5 Solidité | 5ᵉ centile de l'espérance en R > 0 (bootstrap, 2000 tirages, graine fixe) | Bat la référence sur 60 % ou plus des fenêtres glissantes de 30 jours |
| C6 Conformité | Performance en direct ≥ 10ᵉ centile des fenêtres de même durée sur l'historique (`strategies-bench.json`) | Idem |

| Niveau | Condition | Texte |
|---|---|---|
| En observation | C1 ou C2 non atteint | « En observation : jour 27 sur 90, 9 trades sur 30. Ne copie pas encore. » |
| Insuffisant | C1 et C2 atteints, C3 ou C4 en échec | « Ne fait pas mieux que [référence]. À ne pas copier. » |
| Encourageant | C1 à C4 atteints, C5 non | « Résultats positifs, mais ce peut encore être de la chance. » |
| Fiable jusqu'ici | C1 à C6 atteints | « Fiable jusqu'ici. Le verdict se recalcule chaque jour. » |
| Confiance retirée | Était « encourageant » ou « fiable », et C4 échoue, ou la performance sur 60 jours glissants passe sous la référence de 10 points ou plus | « Confiance retirée le JJ/MM : … » |

- Un portefeuille de la stratégie `dca-btc` n'a pas de verdict : il sert de référence.
- Pour `dca-boussole`, C6 compare au résultat « base seule » du banc d'essai (9.6), et le panneau le précise.
- **Taille conseillée pour copier**, affichée à partir d'« encourageant » : au plus 5 % du portefeuille réel (15 % à « fiable jusqu'ici »), risque par trade égal à `riskPerTradePct` du profil.
- Tous les seuils vivent dans un objet `trustRules` du profil (synchronisé avec lui), modifiable dans Labo → « Règles de confiance », avec retour aux valeurs par défaut.
- Panneau affiché :

  ```
  Confiance : en observation — ne copie pas encore
  ✓ Baisse maximale −6,2 % (limite −25 %)
  … Durée en direct : 27 jours sur 90
  … Trades clos : 9 sur 30
  – Espérance : +0,21 R par trade (marge d'erreur trop large pour conclure)
  Avec les frais d'une application grand public : −3,8 % au lieu de +4,3 %
  ```

- **Classement** (Labo → Classement) : tous les autopilotes et les deux références ; performance à 30, 90 et 180 jours et depuis le début du direct ; baisse maximale ; écart avec Bitcoin ; verdict.

### 9.8 Fichiers

- **Nouveaux :** `src/lib/lab/{autopilot,trust}.ts`, `src/lib/lab/strategies/{dcaBoussole,trader}.ts`, `src/hooks/{usePaperSettle,useAutopilot}.ts`, `src/runner/autopilot.ts`, composants de la page Labo, `src/data/strategies-bench.json`.
- **Modifiés :** `src/types.ts`, `src/store/{useStore,persistence}.ts`, `src/lib/{backup,paper,autoBasket}.ts`, `src/lib/sync/merge.ts`, `src/hooks/useBasket.ts`, `src/runner/{cycle,evaluate,brief,config,main,market}.ts`, `runner/README.md`, `runner/runner.json.example`, `src/pages/Dashboard.tsx`, `src/App.tsx`.

### 9.9 Critères d'acceptation

1. Migration : un état en version 2 avec trois ordres papier et un achat fantôme donne un portefeuille « Papier manuel » portant les trois ordres ; l'achat fantôme est intact ; un second passage ne change rien.
2. Ordres en attente : limite, stop, objectif, groupe OCO, expiration, trou de cotation, crypto sans paire Binance refusée.
3. Déterminisme entre appareils : deux « appareils » de test calculent les mêmes dix jours ; leurs enregistrements sont identiques hors `updatedAt` et `by` ; la fusion des deux faisceaux ne crée aucun doublon ; un nouveau tick n'écrit rien.
4. Rattrapage : dix jours calculés en une fois égalent dix ticks quotidiens.
5. Changement d'heure : X(E) est juste les 29 mars et 25 octobre 2026 (`Europe/Paris`), et pour un fuseau à l'est où X(E) tombe la veille en UTC.
6. Stratégie non rejouable : une échéance manquée est exécutée en retard, une seule fois, avec `lateDays`.
7. Chaque stratégie a ses tests de décision, dont, pour `trader` : pause, délai après un stop, régime, plafonds de taille, abandon quand le prix a filé.
8. Runner, de bout en bout, avec de faux GitHub, Telegram et bougies (sur le modèle de `src/runner/cycle.test.ts`) : message envoyé une fois ; conflit d'écriture sans doublon au cycle suivant ; mode à blanc (`--check`) sans écriture ni envoi ; silence nocturne.
9. Verdict : les cinq niveaux sur des séries synthétiques ; bootstrap identique d'une exécution à l'autre.
10. Changement de règles : le portefeuille est archivé, un neuf démarre, le verdict repart de zéro.
11. Une année simulée de `trader` pèse moins de 150 Ko.
12. Le papier n'entre toujours dans aucun total, aucune fiscalité, aucun conseil du vrai portefeuille (test de non-régression sur `computeHoldings`, `useGuidance`, `tax.ts`).

## 10. Lot 3 — Signaux refaits sur preuves (1.26.0)

### 10.1 But

Remplacer les pondérations fixées à la main par des règles dont chaque composant a passé le banc d'essai. Le résultat ne peut pas être écrit d'avance : cette fiche fixe le protocole, les candidats, et les conditions de sortie.

### 10.2 Protocole (`docs/bench/protocole.md`)

1. Un candidat est une clé de l'étude de signal (8.5), avec intention et horizon déclarés avant la mesure.
2. Ses paramètres se choisissent sur la période de réglage seule. Valeurs rondes ; trois essais au plus par candidat.
3. Chaque regard sur la période de contrôle s'inscrit dans `docs/bench/journal.md` (date, candidat, paramètres, résultat). C'est ce qui empêche de régler sans le dire sur la période censée juger.
4. Un candidat entre dans les signaux seulement s'il est « validé » et si son effet a le même sens sur 60 % ou plus des actifs qui ont au moins 5 épisodes.
5. Un candidat « prometteur » peut s'afficher comme information, sans peser sur un libellé.

### 10.3 Candidats à mesurer

| N° | Candidat | Intention | Horizon |
|---|---|---|---|
| F1 | Régime : Bitcoin au-dessus de sa moyenne 200 jours (variante : moyenne en hausse sur 20 jours) | Filtre des achats d'altcoins | 14 et 30 j |
| F2 | Tendance propre : prix au-dessus d'une moyenne 200 jours en hausse | Haussier | 90 j |
| F3 | Cassure avec volume : plus haut 20 jours (variante 55 jours), volume ≥ 1,5 (variante 2) fois la moyenne | Haussier | 14 et 30 j |
| F4 | Pression acheteuse : part des achats « au marché » dans le volume, moyenne sur 7 jours > 52 % | Haussier | 14 j |
| F5 | Force relative face à Bitcoin sur 30 et 90 jours | Haussier | 30 j |
| F6 | Survente avec rebond : RSI 14 < 30 et clôture en hausse (variante : en tendance haussière seulement) | Haussier | 7 et 14 j |
| F7 | Valorisation profonde : multiple de Mayer < 0,8 ; variante : −60 % sous le plus haut d'un an avec 30 jours positifs | Haussier | 90 et 180 j |
| F8 | Zone de température, sur Bitcoin et Ethereum, et comme filtre des altcoins | Selon la zone | 90 à 365 j |
| F9 | Compression de volatilité suivie d'une cassure dans les 5 jours | Sens de la cassure | 14 j |
| F10 | Excès : RSI hebdomadaire > 80 ou multiple de Mayer > 2, mesuré sur la **pire baisse** des 30 et 90 jours suivants | Risque | 30 et 90 j |
| F11 | Taux de financement extrême de la crypto (historique public Binance futures) | Baissier | 7 j |
| F12 | Deux horizons : tendance hebdomadaire haussière (clôture au-dessus de la moyenne 30 semaines) et déclencheur journalier | Haussier | 30 j |
| F13 | Sortie à la clôture plutôt qu'au stop en séance, pour le plan de trade | Plan | 30 j |
| F14 | Plan de trade : objectif à 1,5 R, 2 R, 3 R ; stop à 1,5, 2 et 3 fois la volatilité moyenne | Plan | 30 j |

- **F4** demande d'étendre `Candle` avec `takerBuyQuote?: number` (champ 10 d'une bougie Binance), dans `src/api/binance.ts`, dans le runner et dans l'outil.
- **F5** a déjà échoué à la mesure rapide. Elle repasse une fois le protocole complet, puis est abandonnée.
- **F11** dépend d'un accès à `fapi.binance.com` depuis l'outil ; s'il est refusé, le candidat est noté « non mesurable » et abandonné.

### 10.4 Construction de la version 2

- **Signal investisseur : une table de décision**, plus une somme pondérée. Chaque libellé correspond à des conditions explicites, toutes validées :
  - « Accumuler fort » et « Accumuler » n'apparaissent que si une condition haussière validée est vraie. Sinon : « Conserver ».
  - « Alléger » devient un état de risque, fondé sur F10 ou sur la zone d'euphorie, et son texte parle de la baisse qui a suivi dans l'historique.
  - « Prendre des profits » devient atteignable (aujourd'hui les votes de tendance annulent les votes de valorisation au sommet : le score n'est jamais descendu sous −35).
  - Fréquences visées en contrôle : « Accumuler fort » ≤ 5 % des jours, « Accumuler » ≤ 25 %.
- **Signal trader : les setups d'abord.** « Achat » exige au moins un setup haussier validé et un régime favorable si F1 est validé ; « Vente » exige un setup baissier validé ; sinon « Neutre ». Le score de −100 à +100 ne sert plus qu'au tri, calculé sur les seuls facteurs validés.
- **Retraits :** tout setup ou facteur au verdict « sans effet » ou « inversé » sort de l'application. La mesure rapide désigne les croisements doré et de la mort, le « repli en tendance haussière », les bandes de Bollinger comme facteur ; le lot 1 tranche.
- Le plan de trade (stop, objectif) prend la variante de F13 et F14 à la meilleure espérance en contrôle.

### 10.5 Conditions de sortie, jugées en période de contrôle

1. « Accumuler fort » : taux à 90 jours ≥ référence + 8 points.
2. « Accumuler » : taux ≥ référence + 4 points, borne basse de Wilson au-dessus de la référence.
3. « Alléger » : médiane de la pire baisse à 90 jours plus profonde que celle de la référence d'au moins 5 points, ou taux ≤ référence − 4 points.
4. Trader « Achat » : espérance du plan ≥ +0,15 R, frais « plateforme d'échange » compris, et positive sur au moins 2 des 3 sous-périodes (2023, 2024, 2025-2026).
5. Les stratégies `trader` et `dca-boussole` (base seule) simulées avec la version 2 font mieux que leur version 1 en TWR, sans baisse maximale supérieure de plus de 2 points, dans les deux modes d'exécution.

**Si une condition n'est pas atteinte, le libellé concerné n'est pas livré tel quel :** il est retiré, ou remplacé par « pas de signal fiable ». On ne livre jamais un signal non validé pour tenir la liste.

### 10.6 Livrables

- `src/lib/signals.ts` en version 2 (`SIGNALS_VERSION = 2`), tests mis à jour, `reliability.json` et `strategies-bench.json` régénérés.
- Rapport `docs/bench/` version 1 contre version 2, ligne à ligne, et journal des essais.
- Textes : chaque facteur affiché cite sa mesure ; « Comment lire ces signaux » (page Signaux) et le Guide sont réécrits.
- IA : `src/ai/context.ts` transmet la phrase de fiabilité de chaque signal cité, et les consignes (`src/ai/prompts.ts`) interdisent de présenter un signal sans elle.
- Les autopilotes dont l'empreinte change sont archivés et relancés (9.5).

### 10.7 Critères d'acceptation

1. Les cinq conditions de 10.5 sont documentées une par une dans le rapport, atteintes ou non.
2. Le journal des essais existe, et aucun candidat n'y dépasse trois essais.
3. Plus aucun libellé ni setup au verdict « sans effet » ou « inversé » n'est affiché.
4. Tests : chaque ligne de la table de décision ; « Prendre des profits » atteignable sur un cas construit ; fréquences des libellés sur un jeu d'essai embarqué.

## 11. Lot 4 — Suivi et passage au réel (1.27.0)

### 11.1 Courbe du vrai portefeuille

- `src/lib/history/equity.ts`, `journalEquity(transactions, closesByCoin, fxByDay)` : valeur jour par jour depuis la première transaction (quantités détenues × clôtures), apports et retraits tirés de `fiatFlows` (`src/lib/benchmark.ts`), performance TWR et XIRR, baisse maximale, meilleur et pire mois.
- **Limite :** ce que le journal ne décrit pas (soldes lus sur la blockchain sans transaction) n'est pas reconstituable. D'où des relevés quotidiens :
  - `portfolioSnapshots` (nouvelle collection synchronisée, identifiant = jour) : `{ id, day, valueUsd, byBucket, complete }`, écrit une fois par jour par l'application à son premier chargement complet du portefeuille ; un relevé `complete: false` est remplacé par un relevé complet du même jour.
  - À partir du premier relevé, la courbe suit les relevés ; avant, elle est « reconstituée d'après le journal », et l'écran le dit.
- Wallet, en tête de page : graphique « Valeur du portefeuille » (1 mois, 3 mois, 1 an, tout) avec la valeur, les versements cumulés et la référence « tout en Bitcoin » (logique de `BenchmarkCard` étendue à une courbe).
- Une crypto sans historique Binance prend ses prix dans CoinGecko (365 jours au plus) ; au-delà, « prix inconnu », jamais zéro.

### 11.2 Alertes de signal

- Le runner calcule une fois par jour, après 0 h 10 UTC, les signaux (version 2, bougies closes) des positions du journal, de la watchlist et de l'univers des 20 premières.
- Événements : nouveau setup validé sur une crypto suivie ; passage à « Accumuler fort », « Alléger » ou « Prendre des profits », ou sortie de l'un de ces états ; changement de régime (F1, s'il est validé).
- Message : l'événement, puis sa phrase de fiabilité. Clé de dédoublonnage `sig:<coinId>:<clé>:<premier jour de l'épisode>`. Trois au plus par cycle ; regroupées après le silence nocturne ; drapeau `signalAlertsEnabled`.
- Application ouverte et serveur veilleur muet : les mêmes événements en notification locale (`src/hooks/useSmartAlerts.ts`).

### 11.3 Copie en réel

- Sur chaque ordre en direct d'un autopilote : bouton « J'ai copié en réel ». Sous le niveau « encourageant », une fenêtre rappelle le verdict et demande confirmation.
- Il ouvre le formulaire réel prérempli : une `Transaction` (stratégies à échéances), ou un `TradeEntry` avec stop, objectif et `setup = 'autopilote'` (stratégie `trader`). L'utilisateur saisit le prix, la quantité et les frais réellement obtenus.
- La transaction ou le trade reçoit `copyOf?: { portfolioId: string; day: string; coinId: string }`.
- `copy.ts`, `copyReport(logs, transactions, trades)` : pour chaque ordre copié, l'écart d'exécution (prix réel contre prix papier, en %) et le délai ; au total, la part des ordres copiés, l'écart moyen, le résultat réel contre le résultat papier des mêmes ordres.

  ```
  Copie en réel : 12 ordres sur 15. Écart moyen à l'exécution : −0,8 %.
  Résultat réel +3,1 % ; papier, sur les mêmes ordres, +4,6 %.
  ```

- « Combien mettre ? » : montant conseillé, calculé avec la taille de 9.7, la valeur du portefeuille réel et le stop de l'ordre.

### 11.4 Wallets suivis notés

- Le runner, qui détecte déjà les mouvements des wallets suivis, inscrit chaque achat ou vente d'un token dont le prix est connu dans `smartMoves` (nouvelle collection synchronisée, 300 éléments au plus, les plus anciens retirés) : `{ id: eventKey, walletId, coinId | mint, side, priceUsd, at }`.
- Chaque mouvement est rejugé à 7 et 30 jours : hausse après un achat, baisse évitée après une vente.
- Smart money : une note par wallet (« 14 mouvements suivis, 9 gagnants à 30 jours ») ; mention « historique défavorable » sous 40 % avec 10 mouvements ou plus.

### 11.5 Pépites suivies en avant

Le score des pépites lit des données non rejouables : il ne peut pas passer le banc d'essai. Il est donc suivi vers l'avant.

- Chaque lundi, l'application enregistre les 10 meilleures candidates de l'onglet « Petites capis » et les découvertes proposées par le panier, avec leur prix : `pickSnapshots` (nouvelle collection synchronisée, identifiant = semaine ISO).
- À 30 et 90 jours : rendement de chacune, comparé à Bitcoin.
- Pépites : carte « Ce que valaient les scores », affichée à partir de 8 semaines de recul.

### 11.6 Fichiers

- **Nouveaux :** `src/lib/history/equity.ts`, `src/lib/lab/copy.ts`, `src/lib/smartScore.ts`, `src/lib/pickTracking.ts`, `src/runner/signals.ts`, composants de la courbe.
- **Modifiés :** `src/types.ts`, `src/store/*`, `src/lib/backup.ts`, `src/lib/sync/merge.ts` (migration 3 → 4 : trois collections), `src/pages/{Portfolio,Smart,Gems,Labo}.tsx`, `src/components/forms.tsx`, `src/runner/{cycle,evaluate,config}.ts`.

### 11.7 Critères d'acceptation

1. Courbe : achats, ventes, transferts entre comptes, dépôts et retraits sur un journal d'essai ; TWR et XIRR sur des cas calculés à la main ; bascule des jours reconstitués vers les relevés.
2. Alertes de signal : une seule alerte par épisode ; rien pendant le mode vacances ; phrase de fiabilité présente.
3. Rapport de copie : écart et résultats sur un jeu de 5 ordres dont 3 copiés.
4. Mouvements de wallets : notation à 7 et 30 jours, plafond de 300, fusion entre appareils.
5. Suivi des pépites : un relevé par semaine, jamais deux.

## 12. Lot 5 — DCA et trading alignés sur les preuves, ménage (1.28.0)

### 12.1 DCA

- **Classement de la base.** Variantes simulées avec `dca-boussole` (base seule), dans les deux modes d'exécution : (a) trois meilleurs scores investisseur, version 2 ; (b) pondération par capitalisation ; (c) ancre Bitcoin et Ethereum pour une part fixe, le reste selon le signal ; (d) parts égales sur les 20 ; (e) Bitcoin seul.
  - La variante retenue est celle au meilleur TWR en contrôle sans baisse maximale supérieure de plus de 2 points à celle de `dca-btc`.
  - Si aucune ne bat `dca-btc`, l'éditeur du panier le dit en clair, et une option « Ancre Bitcoin et Ethereum » (part réglable, défaut 70 % de la base) est activée par défaut pour les **nouveaux** paniers.
  - Un panier existant n'est jamais modifié d'office : une bannière montre la comparaison mesurée et propose le changement en un clic.
- **« Rejouer mon panier »** (page DCA) : simulation de la base avec les réglages de l'utilisateur, face au DCA Bitcoin simple, avec ses frais.
- **Découverte :** le score des pépites ne classe les découvertes que si le suivi en avant (11.5) lui donne raison après 90 jours ; d'ici là, la carte porte « non mesuré ».
- **Multiplicateurs de température :** la table actuelle face à une table plus plate et à une plus pentue, sur Bitcoin et Ethereum, avec réserve. Elle ne change que si une variante gagne plus de 2 points de TWR annualisé en contrôle sans baisse maximale supérieure.
- **Plans « avancés »** (une seule crypto) : la section disparaît quand l'utilisateur n'a aucun plan. S'il en a, ils restent utilisables, avec la mention « remplacé par le panier » ; leurs données restent stockées.

### 12.2 Trading

- « Setups détectés » : triés par fiabilité mesurée, avec le régime du moment en tête. Les setups non validés sont masqués par défaut.
- Calculateur : « Remplir » applique le plan de la version 2 et affiche les chances mesurées et l'espérance du setup. Si les frais du préréglage choisi rendent l'espérance négative, un avertissement le chiffre.
- Bouton « Tester sur papier » (calculateur et fiche d'une crypto) : crée l'ordre dans le portefeuille manuel, avec stop et objectif attachés.
- Journal : les statistiques par setup s'affichent à côté de ce que le banc d'essai attend (« toi : +0,4 R sur 6 trades ; historique : +0,2 R »).
- Runner : stop ou objectif d'un trade ouvert du journal touché (bougies 1 heure) → message Telegram, une fois.

### 12.3 Ménage

- **Menu de 13 à 9 entrées :** Cockpit, Signaux, DCA, Wallet, Labo, Pépites (avec Smart money et Airdrops en onglets), Trading, Copilote IA, Plus (Rendement & DeFi, Guide & profil, Réglages). Les anciennes routes restent valides. Barre du bas sur téléphone : Cockpit, Signaux, DCA, Wallet, Labo.
- **Cockpit :** « Narratives du jour » et « Les plus recherchées » rejoignent Pépites → Narratives.
- **Données mortes (migration 4 → 5) :** `theses`, `checklist` et la rubrique `paper` sortent du magasin, de `ITEM_KEYS`, `STAMP_KEYS`, `BACKUP_KEYS`, des types et du runner ; les références restantes (`useExitPlan`, `ConsolidateCard`, `ai/context.ts`, `runner/evaluate.ts`, `Guide.tsx`) disparaissent. Une copie de précaution précède la migration, comme pour les précédentes.
- **Documents :** `README.md`, `docs/FONCTIONNALITES.md`, `docs/STRATEGIE.md` (qui cite encore la règle « thèse cassée »), `runner/README.md`.

### 12.4 Critères d'acceptation

1. Le rapport des variantes du DCA existe, et la règle livrée est celle qu'il désigne.
2. Un panier existant garde ses réglages après la mise à jour.
3. « Tester sur papier » crée un ordre et ses deux ordres attachés.
4. Aucune route existante ne casse (essai de fumée sur toutes les routes, anciennes comprises).
5. Migration 4 → 5 : aucune donnée utile perdue ; deux appareils dans des versions différentes ne se détruisent rien (le plus ancien passe en lecture seule, comportement existant).

## 13. Dépendances et « terminé »

| Lot | Dépend de | Peut commencer |
|---|---|---|
| 1 | — | Tout de suite |
| 2A | 1 (`fills.ts`, `metrics.ts`) | Après 1 |
| 2B | 1, 2A | Après 2A |
| 3 | 1 ; 2B pour l'archivage des autopilotes | Après 2B (la mesure peut démarrer dès 1) |
| 4 | 2B (copie), 3 (alertes de signal) | Après 3 |
| 5 | 3, 4 (suivi des pépites) | Après 4 |

Un lot est terminé quand :

1. `npm run typecheck`, `npm test` (les 495 tests actuels restent verts) et `npx vite build` passent ;
2. un essai de fumée Electron parcourt les routes nouvelles et modifiées sans écran d'erreur ;
3. ses critères d'acceptation sont vérifiés un par un, et ceux qui n'ont pas pu l'être sont nommés ;
4. `docs/FONCTIONNALITES.md` et `README.md` ont leur entrée de version ;
5. la version est publiée selon le processus du dépôt (exécutables, APK, empreintes, annonce de mise à jour).

## 14. Risques

| Risque | Parade |
|---|---|
| Surapprentissage : une règle qui colle au passé | Périodes de réglage et de contrôle séparées, journal des regards, trois essais au plus, deux modes d'exécution, verdict en direct |
| Source de données indisponible ou modifiée | Aucun prix de remplacement : le tick attend ; le banc d'essai travaille sur son cache ; chaque rapport porte la date des données |
| Univers de mesure flatteur | Paires retirées incluses ; classement par volume à la date ; limite écrite dans chaque rapport |
| Stockage local saturé | Rien de volumineux dans `localStorage` ; test de volume ; bandeau existant |
| Divergence entre appareils sur une stratégie non rejouable | Enregistrement atomique par jour, univers figé par semaine |
| L'utilisateur copie trop tôt ou trop gros | Verdict visible sur chaque ordre et chaque message ; confirmation sous « encourageant » ; taille conseillée ; pause automatique de `trader` |
| Frais réels supérieurs au papier | Résultat recalculé avec les frais d'une application ; rapport de copie |
| Le lot 3 n'atteint pas ses conditions | Prévu : le libellé est retiré ou marqué « pas de signal fiable » |

## 15. Qui a décidé quoi

**Décidé par l'utilisateur**

- Le but : pouvoir faire confiance à Boussole, puis éventuellement copier ses ordres en réel.
- Cinq lots, dans cet ordre.
- Un autopilote qui suit les informations de Boussole.
- Il passe ses ordres lui-même ; le papier ne se mélange pas au réel ; pas de veille fiscale (décisions antérieures).

**Choix du concepteur, à corriger si besoin**

- Le moteur unique et l'exécution papier à 8 h, heure locale.
- Les quatre stratégies de la version 1 et leurs paramètres par défaut ; « investisseur » fondée sur la seule température.
- Le filtre de régime actif par défaut dans `trader`.
- Les seuils du verdict (90 jours, 30 trades, 25 %…) et les tailles conseillées (5 % puis 15 %).
- Les préréglages de frais, dont 1,5 % d'écart par côté pour une application grand public.
- Les seuils des verdicts du banc d'essai et les conditions de sortie du lot 3.
- Les signaux calculés sur bougies closes dès le lot 1.
- Le menu regroupé, « Labo » dans la barre du bas à la place du Copilote IA.
- L'option « Ancre Bitcoin et Ethereum » par défaut pour les nouveaux paniers si la mesure le confirme.
- Le sort des plans DCA « avancés ».

**Laissé à la personne qui construit**

- Le découpage en composants, les noms internes, le style des graphiques.
- Le choix entre traitement par tranches et fil d'exécution séparé pour les calculs longs.
- L'organisation des fichiers de test.
- La formulation exacte des textes, dans le ton de l'application : phrases courtes, chiffres avec leur référence, aucune promesse.

## Annexe A — Mesure exploratoire du 14 novembre 2026

Script jetable, hors dépôt. `analyze()` de la version 1.22.1, rejoué chaque jour sur 20 grandes cryptos encore cotées (BTC, ETH, BNB, SOL, XRP, ADA, DOGE, AVAX, LINK, DOT, LTC, TRX, NEAR, UNI, ATOM, AAVE, SUI, XLM, BCH, HBAR), de septembre 2018 à août 2026 : 44 183 jours-cryptos. Entrée à la clôture du jour du signal. Température reconstituée (Bitcoin et Fear & Greed).

| Signal | Fréquence | En hausse ensuite | Médiane | Référence |
|---|---|---|---|---|
| Investisseur « Accumuler fort », 90 j | 1,4 % | 63 % | +6,2 % | 48 %, −2,2 % |
| Investisseur « Accumuler », 90 j | 51,4 % | 49 % | −1,1 % | 48 %, −2,2 % |
| Investisseur « Conserver », 90 j | 40,9 % | 45 % | −5,5 % | 48 %, −2,2 % |
| Investisseur « Alléger », 90 j | 6,4 % | 54 % | +7,9 % | 48 %, −2,2 % |
| Investisseur « Prendre des profits » | 0 % | jamais émis | — | — |
| Trader « Achat fort », 7 j | 9,7 % | 50 % | 0,0 % | 49 %, −0,3 % |
| Trader « Vente forte », 7 j | 9,3 % | 52 % | +0,4 % | 49 %, −0,3 % |
| Setup « Repli en tendance haussière », 30 j | 4,7 % | 41 % | −4,7 % | 48 %, −1,0 % |
| Setup « Surachat », 30 j | 3,1 % | 58 % | +5,3 % | 48 %, −1,0 % |
| Setup « Cassure avec volume », 30 j | 2,1 % | 55 % | +4,1 % | 48 %, −1,0 % |
| Setups « Croisement doré », « de la mort », « Compression », 30 j | — | 47 à 49 % | ≈ −1 % | 48 %, −1,0 % |

Autres résultats :

- **Température, sur Bitcoin seul**, part des jours suivis d'une hausse un an après : sous 20, 90 % ; 20 à 40, 68 % ; 40 à 60, 62 % ; 60 à 80, 54 % ; 80 et plus, 42 %.
- **Plan de trade** (stop du plan, objectif 1,5 R, 30 jours) : objectif touché dans 40 à 43 % des cas quand le signal trader est haussier, espérance ≈ +0,1 R avant frais ; ≈ 0 R sinon.
- **Signal trader haussier**, rendement moyen à 14 jours : +5,7 % contre +3,6 % pour un jour quelconque quand Bitcoin est au-dessus de sa moyenne 200 jours ; +0,4 % contre +0,3 % quand il est dessous.
- **DCA automatique** : les trois meilleurs scores investisseur de la semaine battent la moyenne simple des 20 dans 40 % des semaines, à 90 jours (+23,3 % contre +24,9 %).
- **Altcoins face à Bitcoin**, à 90 jours : une altcoin de cette liste bat Bitcoin dans 37 % des cas (médiane −8,3 points).
- **Pistes testées sans succès** : force relative face à Bitcoin sur 90 jours ; combinaison « tendance et force » (favorable en 2019-2021 et 2023-2024, défavorable en 2025-2026).

**Limites.** Cryptos survivantes, ce qui flatte les résultats. Jours qui se chevauchent, donc bien moins de cas indépendants que de lignes. Moyennes tirées par quelques envolées (d'où les médianes). Température dont les seuils ont été choisis en connaissant une partie de cet historique. Le lot 1 refait cette mesure avec les conventions de 8.5 ; ces chiffres ne servent qu'à vérifier les ordres de grandeur.

## Annexe B — Univers de mesure

Symboles dont la paire USDT existe ou a existé sur l'API publique de Binance (vérifié le 14 novembre 2026) :

BTC, ETH, BNB, XRP, ADA, SOL, DOGE, TRX, LINK, DOT, LTC, BCH, AVAX, MATIC, POL, UNI, ATOM, XLM, ETC, FIL, ICP, VET, THETA, EOS, AAVE, ALGO, XTZ, NEO, IOTA, DASH, ZEC, XMR, NEAR, FTM, S, SAND, MANA, AXS, EGLD, HBAR, APT, ARB, OP, SUI, SHIB, PEPE, TON, LUNA, LUNC, FTT, WAVES, XEM, OMG, MKR, COMP, SNX, CRV, GRT, CHZ, RUNE, CAKE, INJ, RNDR, RENDER, FET, TIA, SEI, TAO, ENA, HYPE, ONDO, JUP, WIF, BONK, KSM, ENJ, QTUM, ZIL, ONT, BAT, ICX, IOST, KAVA, STX, IMX, LDO, QNT, FLOW, GALA, ROSE, CELO, ONE, HNT, WLD, PYTH, JTO, STRK, ZK, EIGEN, TRUMP, PENGU, VIRTUAL.

- Paires arrêtées à la date de vérification : MATIC (10/09/2024), EOS (26/05/2025), XMR (20/02/2024), FTM (13/01/2025), WAVES, XEM et OMG (17/06/2024), MKR (15/09/2025), RNDR (22/07/2024), HNT (14/10/2022), TON (30/06/2026), ICX (03/09/2026).
- Séries à chaîner : MATIC→POL, RNDR→RENDER, FTM→S (8.4).
- `LUNA` : l'ancienne crypto jusqu'en mai 2022, puis un autre actif sous le même symbole ; la coupure sur trou les sépare.
- Absents de l'API : KAS, XDC.
- Un symbole absent au moment de l'exécution est ignoré et listé dans le rapport.
