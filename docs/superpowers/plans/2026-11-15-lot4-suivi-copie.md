# Lot 4 — Suivi et passage au réel : plan d'implémentation

> **Pour les agents :** sous-compétence requise : superpowers:subagent-driven-development (recommandée) ou superpowers:executing-plans, tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`).

**But :** courbe et performance du vrai portefeuille, alertes quand un signal fiable apparaît, copie en réel d'un autopilote avec mesure de l'écart, wallets suivis et pépites notés sur leurs résultats (version 1.27.0).

**Architecture :** trois nouvelles collections synchronisées (`portfolioSnapshots`, `smartMoves`, `pickSnapshots`, données v4). Les calculs restent purs (`src/lib/history`, `src/lib/lab/copy.ts`, `src/lib/smartScore.ts`, `src/lib/pickTracking.ts`) ; le runner calcule les alertes de signal une fois par jour.

**Pile :** TypeScript strict, React 19, Zustand 5, Vitest, runner Node.

**Fiche :** [docs/superpowers/specs/2026-11-15-labo-banc-d-essai-autopilote-design.md](../specs/2026-11-15-labo-banc-d-essai-autopilote-design.md), section 11. **Prérequis :** lots 2B (autopilotes) et 3 (signaux v2).

## Contraintes globales

- Interface, commentaires et messages de commit en français ; chaque message de commit se termine par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Fonctions pures testées dans `src/lib` ; `npx vitest run <fichier>`.
- Jamais un chiffre inventé : prix inconnu = « prix inconnu », jamais zéro.
- Nouvelle collection = `ITEM_KEYS` + `BACKUP_KEYS` + `OBJECT_LISTS` + migration 3 → 4 + `DATA_VERSION = 4`.
- Valeurs fixées : alertes de signal après 0 h 10 UTC, 3 au plus par cycle, clé `sig:<coinId>:<clé>:<premier jour de l'épisode>` ; `smartMoves` plafonné à 300 ; notation à 7 et 30 jours ; « historique défavorable » sous 40 % avec 10 mouvements ou plus ; relevé des pépites chaque lundi, 10 meilleures candidates, carte affichée à partir de 8 semaines ; taille conseillée de copie : `copyPct` du verdict.
- Fin de lot : `npm run typecheck`, `npm test`, `npx vite build`, `npm run build:runner`, essai de fumée, entrée de version, publication.

## Points de vigilance

1. **Transferts entre comptes comptés comme des apports.** Attendu : un transfert ne change ni la performance ni les versements. Test en tâche 1.
2. **Deux appareils écrivent le relevé du même jour, l'un sur des données partielles.** Attendu : le relevé complet l'emporte. Test en tâche 2.
3. **Une alerte de signal qui revient chaque jour tant que l'épisode dure.** Attendu : une seule par épisode. Test en tâche 4.
4. **Ordre copié en réel puis supprimé ou corrigé dans le journal.** Attendu : le rapport de copie suit la transaction telle qu'elle est aujourd'hui. Test en tâche 5.
5. **Mouvement de wallet sur un token sans prix.** Attendu : non noté, jamais compté perdant. Test en tâche 6.

---

### Task 1: courbe du portefeuille reconstituée d'après le journal

**Fichiers :** créer `src/lib/history/equity.ts`, `src/lib/history/equity.test.ts`.

**Interfaces — consomme :** `fiatFlows` (`src/lib/benchmark.ts`), `twr`, `maxDrawdownPct`, `xirr`, `DayPoint` (lot 1).

**Interfaces — produit :** `journalEquity(txs: Transaction[], closes: Map<string, Map<string, number>>, from: string, to: string): { series: DayPoint[]; missing: string[] }` (quantités détenues × clôtures ; apports et retraits = flux de `fiatFlows` ; crypto sans clôture → listée dans `missing`, valorisée au dernier prix connu) ; `periodStats(series: DayPoint[]): { twrPct: number; xirrPct: number | null; maxDrawdownPct: number; bestMonth: { month: string; pct: number } | null; worstMonth: { month: string; pct: number } | null }`.

- [ ] **Étape 1 : écrire les tests** — achat, vente, transfert entre comptes, dépôt, retrait sur un journal d'essai ; TWR et XIRR calculés à la main ; transfert sans effet sur la performance.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Suivi : courbe du portefeuille reconstituée d'après le journal`.

### Task 2: relevés quotidiens et données version 4

**Fichiers :** modifier `src/types.ts`, `src/lib/backup.ts`, `src/lib/sync/merge.ts`, `src/store/persistence.ts`, `src/store/useStore.ts` ; créer `src/hooks/useSnapshots.ts` ; tests dans `src/store/persistence.test.ts` et `src/lib/history/snapshots.test.ts`.

**Interfaces — produit :**
- `PortfolioSnapshot { id: string /* = day */; updatedAt?; day: string; valueUsd: number; byBucket: Record<string, number>; complete: boolean }`, `SmartMove { id: string /* eventKey */; updatedAt?; walletId: string; coinId?: string; mint?: string; symbol: string | null; side: 'buy' | 'sell'; priceUsd: number; at: string }`, `PickSnapshot { id: string /* semaine ISO */; updatedAt?; week: string; picks: { coinId: string; symbol: string; source: 'gems' | 'basket'; score: number | null; priceUsd: number }[] }`.
- Migration 3 → 4 : trois collections vides.
- `chooseSnapshot(existing: PortfolioSnapshot | undefined, next: PortfolioSnapshot): PortfolioSnapshot | null` (null = ne rien écrire ; un complet remplace un partiel, jamais l'inverse).
- `useSnapshots()` : au premier chargement complet du portefeuille de la journée, écrit le relevé via `chooseSnapshot`.
- `mergeEquity(reconstructed: DayPoint[], snapshots: PortfolioSnapshot[]): { series: DayPoint[]; firstSnapshotDay: string | null }`.

- [ ] **Étape 1 : écrire les tests** — migration ; `chooseSnapshot` dans les quatre cas ; `mergeEquity` bascule sur les relevés à partir du premier.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Suivi : relevés quotidiens du portefeuille (données v4)`.

### Task 3: graphique « Valeur du portefeuille »

**Fichiers :** créer `src/components/PortfolioChart.tsx` ; modifier `src/pages/Portfolio.tsx` (en tête de page).

- Périodes 1 mois, 3 mois, 1 an, tout ; courbes : valeur, versements cumulés, « tout en Bitcoin » (même logique que `BenchmarkCard`, étendue jour par jour).
- Statistiques sous le graphique : `periodStats`.
- Jours reconstitués : légende « reconstitué d'après le journal » jusqu'au premier relevé. Crypto sans historique Binance : prix CoinGecko (365 jours au plus), sinon « prix inconnu ».
- [ ] **Étape 1 : implémenter.**
- [ ] **Étape 2 : essai de fumée** sur `/portefeuille` avec un journal d'essai ; pas d'écran d'erreur ; aucune valeur à 0 € pour une crypto sans prix.
- [ ] **Étape 3 : commit** — `Wallet : graphique de la valeur du portefeuille`.

### Task 4: alertes de signal

**Fichiers :** créer `src/runner/signals.ts` et son test ; modifier `src/runner/cycle.ts`, `src/runner/config.ts` (`signalAlertsEnabled`, vrai par défaut), `src/runner/state.ts` (dernier jour calculé), `src/hooks/useSmartAlerts.ts`.

**Interfaces — produit :**
- `interface SignalEvent { coinId: string; symbol: string; key: string; label: string; episodeStart: string; kind: 'enter' | 'exit' }`
- `signalEvents(prev: Record<string, string[]>, now: Record<string, string[]>, day: string, episodeStartOf: (coinId: string, key: string) => string): SignalEvent[]` — événements de la fiche 11.2 (setup validé, entrée et sortie de « Accumuler fort », « Alléger », « Prendre des profits », changement de régime)
- `signalMessage(e: SignalEvent, phrase: string): string` — l'événement, puis la phrase de fiabilité.
- Le runner calcule une fois par jour après 0 h 10 UTC (positions du journal, watchlist, 20 premières), 3 messages au plus, silence nocturne et vacances respectés ; l'application fait de même en notification locale quand le serveur veilleur est muet depuis 45 minutes.

- [ ] **Étape 1 : écrire les tests** — une seule alerte sur un épisode de cinq jours ; une nouvelle après une interruption ; rien en mode vacances ; phrase de fiabilité présente.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Alertes de signal sur Telegram et dans l'application`.

### Task 5: copie en réel

**Fichiers :** créer `src/lib/lab/copy.ts` et son test, `src/pages/labo/CopyReport.tsx` ; modifier `src/types.ts` (`copyOf?: { portfolioId: string; day: string; coinId: string }` sur `Transaction` et `TradeEntry`), `src/components/forms.tsx` (préremplissage), `src/pages/labo/PortfolioDetail.tsx`.

**Interfaces — produit :**
- `copyReport(logs: PaperDayLog[], txs: Transaction[], trades: TradeEntry[]): { orders: number; copied: number; avgSlipPct: number | null; realPct: number | null; paperPct: number | null; lines: { day: string; symbol: string; paperUsd: number; realUsd: number | null; slipPct: number | null; delayH: number | null }[] }`
- `copySize(verdict: TrustVerdict, realPortfolioUsd: number, stopDistancePct: number | null, riskPerTradePct: number): number | null` (min(`copyPct` × valeur, risque ÷ distance du stop) ; null sous « encourageant »).
- Bouton « J'ai copié en réel » sur chaque ordre en direct : sous « encourageant », fenêtre de confirmation qui rappelle le verdict ; ouvre le formulaire réel prérempli (`Transaction` pour les stratégies à échéances, `TradeEntry` avec stop, objectif et `setup = 'autopilote'` pour `trader`).
- Texte du rapport : exemple de la fiche 11.3, à l'identique.

- [ ] **Étape 1 : écrire les tests** — 5 ordres dont 3 copiés : écart moyen, résultats réel et papier ; transaction corrigée après coup → rapport mis à jour ; `copySize` null en « observation ».
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Copie en réel d'un autopilote, écart mesuré`.

### Task 6: wallets suivis notés

**Fichiers :** créer `src/lib/smartScore.ts` et son test ; modifier `src/runner/cycle.ts` (inscription dans `smartMoves`, dans l'écriture unique du faisceau), `src/pages/Smart.tsx`.

**Interfaces — produit :** `addMoves(existing: SmartMove[], incoming: SmartMove[], max?: number): SmartMove[]` (300 au plus, les plus anciens retirés, sans doublon d'identifiant) ; `scoreWallet(moves: SmartMove[], priceAt: (move: SmartMove, days: number) => number | null): { followed: number; wins7: number; wins30: number; judged30: number; unfavorable: boolean }` (achat gagnant si hausse ; vente gagnante si baisse évitée ; prix inconnu → non jugé).

- [ ] **Étape 1 : écrire les tests** — plafond et doublons ; notation à 7 et 30 jours ; prix inconnu non jugé ; « historique défavorable » à 3 gagnants sur 10.
- [ ] **Étape 2 à 4 : échec, implémentation, succès** ; texte affiché : « 14 mouvements suivis, 9 gagnants à 30 jours ».
- [ ] **Étape 5 : commit** — `Smart money : chaque wallet noté sur ses mouvements`.

### Task 7: pépites suivies en avant et publication 1.27.0

**Fichiers :** créer `src/lib/pickTracking.ts` et son test, `src/hooks/usePickSnapshots.ts` ; modifier `src/pages/Gems.tsx`.

**Interfaces — produit :** `weeklyPicks(week: string, gems: { coinId: string; symbol: string; score: number; priceUsd: number }[], basket: { coinId: string; symbol: string; priceUsd: number }[]): PickSnapshot` (10 meilleures pépites + découvertes du panier) ; `pickPerformance(snaps: PickSnapshot[], priceAt: (coinId: string, day: string) => number | null, btcAt: (day: string) => number | null, today: string): { weeks: number; at30: { avgPct: number; vsBtcPts: number } | null; at90: { avgPct: number; vsBtcPts: number } | null }`. Un seul relevé par semaine ISO (identifiant = semaine).

- [ ] **Étape 1 : écrire les tests** — deux appels la même semaine → un relevé ; performance à 30 et 90 jours ; carte masquée sous 8 semaines.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 :** carte « Ce que valaient les scores » dans Pépites.
- [ ] **Étape 6 :** entrée « v1.27.0 — Suivi et copie en réel » dans `docs/FONCTIONNALITES.md`, `README.md`, `runner/README.md` ; `npm run typecheck && npm test && npx vite build && npm run build:runner` ; essai de fumée (`/portefeuille`, `/smart`, `/pepites`, `/labo`) ; publier 1.27.0.
