# Lot 5 — DCA et trading alignés sur les preuves, ménage : plan d'implémentation

> **Pour les agents :** sous-compétence requise : superpowers:subagent-driven-development (recommandée) ou superpowers:executing-plans, tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`).

**But :** recaler le DCA automatique et l'onglet Trading sur ce que le banc d'essai prouve, regrouper le menu et supprimer les données mortes (version 1.28.0).

**Architecture :** les choix du DCA se décident par des simulations (`npm run bench -- dca-variants`), et seule la variante désignée par le rapport est livrée. Les paniers existants ne sont jamais modifiés d'office. Le ménage passe par une migration 4 → 5.

**Pile :** TypeScript strict, React 19, Zustand 5, Vitest, outil `npm run bench`, runner Node.

**Fiche :** [docs/superpowers/specs/2026-11-15-labo-banc-d-essai-autopilote-design.md](../specs/2026-11-15-labo-banc-d-essai-autopilote-design.md), section 12. **Prérequis :** lots 3 (signaux v2) et 4 (suivi des pépites).

## Contraintes globales

- Interface, commentaires et messages de commit en français ; chaque message de commit se termine par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Fonctions pures testées dans `src/lib` ; `npx vitest run <fichier>`.
- Une règle du DCA ne change que si la simulation le justifie : meilleur TWR en contrôle sans baisse maximale supérieure de plus de 2 points à celle de `dca-btc` ; multiplicateurs de température changés seulement pour un gain de plus de 2 points de TWR annualisé sans baisse maximale supérieure.
- Option « Ancre Bitcoin et Ethereum » : part réglable, défaut 70 % de la base, activée par défaut pour les **nouveaux** paniers seulement si aucune variante ne bat `dca-btc`.
- Anciennes routes toujours valides ; aucune donnée utile perdue à la migration ; copie de précaution avant migration (comportement existant de `guardedStorage`).
- Fin de lot : `npm run typecheck`, `npm test`, `npx vite build`, `npm run build:runner`, essai de fumée de toutes les routes (anciennes comprises), entrée de version, publication.

## Points de vigilance

1. **Panier existant modifié par la mise à jour.** Attendu : ses réglages restent identiques ; une bannière propose le changement. Test en tâche 2.
2. **Lien enregistré vers une ancienne page (`/smart`, `/airdrops`, `/papier`, `/defi`).** Attendu : la page s'ouvre au bon onglet. Test en tâche 5.
3. **Appareil resté en 1.27 qui synchronise avec un appareil en 1.28.** Attendu : l'ancien passe en lecture seule (comportement existant), rien n'est détruit. Test en tâche 6.
4. **Utilisateur qui a encore des plans DCA « avancés ».** Attendu : ils restent visibles et utilisables. Test en tâche 3.
5. **Espérance d'un setup rendue négative par les frais d'une application.** Attendu : avertissement chiffré dans le calculateur. Test en tâche 4.

---

### Tâche 1 : variantes du DCA mesurées

**Fichiers :** modifier `src/lib/lab/strategies/dcaBoussole.ts` (paramètre `baseMode: 'top3' | 'cap' | 'anchor' | 'equal' | 'btc'` et `anchorPct`, défaut `'top3'` et 70) et son test ; `scripts/bench/main.ts` (commande `dca-variants`) ; produire `docs/bench/AAAA-MM-JJ-dca-variantes.md`.

**Interfaces — produit :** variantes (a) à (e) de la fiche 12.1, simulées en base seule dans les deux modes d'exécution, et trois tables de multiplicateurs de température (actuelle, plus plate `[1.5, 1.25, 1, 0.75, 0.5]`, plus pentue `[3, 2, 1, 0.33, 0]` aux mêmes seuils 20/40/60/80) sur Bitcoin et Ethereum avec réserve. Le rapport conclut par la variante retenue et la table retenue, selon les règles des contraintes globales.

- [ ] **Étape 1 : écrire les tests** de `baseMode` : `anchor` à 70 % → 70 % de la base en Bitcoin et Ethereum (75/25), le reste selon le signal ; `cap` → parts proportionnelles aux capitalisations de l'univers ; `equal` → 20 parts égales (arrondi au centime, montant minimal respecté) ; `btc` → Bitcoin seul.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 :** `npm run bench -- dca-variants` ; écrire la conclusion en tête du rapport.
- [ ] **Étape 6 : commit** — `DCA : variantes de la base et des multiplicateurs mesurées`.

### Tâche 2 : panier recalé sur la mesure

**Fichiers :** modifier `src/types.ts` (`BasketPlan.baseMode?`, `anchorPct?`), `src/lib/autoBasket.ts` (`buildAutoBasketPlan` applique `baseMode`), `src/lib/dca.ts` (table retenue, seulement si le rapport la change), `src/components/Basket.tsx`, `src/pages/Dca.tsx` ; tests dans `src/lib/autoBasket.test.ts`.

- Nouveaux paniers : `baseMode` par défaut = variante retenue par le rapport.
- Paniers existants (`baseMode` absent) : comportement actuel conservé ; bannière « Mesuré sur l'historique : <variante retenue> a fait <x> % contre <y> % pour ton réglage » avec bouton « Passer à cette règle ».
- « Rejouer mon panier » (page DCA) : `simulate` de la base avec les réglages du panier et ses frais, face au DCA Bitcoin simple, courbe et chiffres.
- Découverte : mention « non mesuré » sur la carte des découvertes tant que `pickPerformance(...).at90` est null ou ne bat pas Bitcoin.
- [ ] **Étape 1 : écrire les tests** — panier sans `baseMode` → mêmes ordres qu'avant la mise à jour ; nouveau panier → `baseMode` de la variante retenue.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Panier DCA : règle de base fondée sur la mesure, paniers existants intacts`.

### Tâche 3 : plans DCA « avancés »

**Fichiers :** modifier `src/pages/Dca.tsx`.

- Aucun plan : la section disparaît. Au moins un plan : section visible, mention « remplacé par le panier », création d'un nouveau plan toujours possible depuis la section.
- [ ] **Étape 1 : implémenter.**
- [ ] **Étape 2 : essai de fumée** avec et sans plan (`/dca`).
- [ ] **Étape 3 : commit** — `DCA : plans avancés masqués quand ils ne servent pas`.

### Tâche 4 : trading aligné sur les preuves

**Fichiers :** modifier `src/pages/Market.tsx` (vue « Setups détectés »), `src/pages/Trading.tsx`, `src/pages/CoinDetail.tsx`, `src/runner/cycle.ts` ; créer `src/lib/lab/tradeCheck.ts` et son test.

**Interfaces — produit :**
- `setupExpectancy(key: string, costs: CostModel): { expectancyR: number | null; winPct: number | null; warning: string | null }` — espérance mesurée moins les frais de l'aller-retour exprimés en R ; `warning` si elle devient négative (« Avec ces frais, ce setup perd en moyenne 0,12 R par trade. »).
- `journalVsBench(trades: TradeEntry[], key: string): { mine: { n: number; avgR: number | null }; bench: number | null }` → « toi : +0,4 R sur 6 trades ; historique : +0,2 R ».
- « Setups détectés » : triés par fiabilité, régime du moment en tête, setups non validés masqués par défaut.
- Calculateur : « Remplir » applique le plan v2 et affiche chances et espérance ; bouton « Tester sur papier » (calculateur et fiche) → `marketOrder` du lot 2 dans le portefeuille `manuel` avec stop et objectif attachés.
- Runner : stop ou objectif d'un trade ouvert du journal touché (bougies 1 heure) → message Telegram une fois (clé `trade:<id>:stop|target`).
- [ ] **Étape 1 : écrire les tests** — `setupExpectancy` négative avec les frais `app` sur un setup à +0,1 R ; `journalVsBench` ; « Tester sur papier » crée un ordre et deux ordres attachés ; message du runner envoyé une fois.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Trading : setups triés par fiabilité, test sur papier en un clic`.

### Tâche 5 : menu regroupé

**Fichiers :** modifier `src/components/Layout.tsx` (`NAV`), `src/App.tsx`, `src/pages/Gems.tsx` (onglets Smart money et Airdrops, et Narratives repris du Cockpit), `src/pages/Dashboard.tsx` (retrait de « Narratives du jour » et « Les plus recherchées ») ; créer `src/pages/More.tsx` (route `/plus`).

- Menu : Cockpit, Signaux, DCA, Wallet, Labo, Pépites, Trading, Copilote IA, Plus (Rendement & DeFi, Guide & profil, Réglages). Barre du bas : Cockpit, Signaux, DCA, Wallet, Labo.
- Routes conservées : `/smart` → Pépites onglet Smart money, `/airdrops` → Pépites onglet Airdrops, `/papier` → Labo, `/defi`, `/guide`, `/reglages`, `/ia` inchangées.
- [ ] **Étape 1 : écrire le test** de la table des redirections (`resolveRoute(path): { page: string; tab?: string }`).
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : essai de fumée** de toutes les routes, anciennes comprises, sur ordinateur et à la largeur d'un téléphone.
- [ ] **Étape 6 : commit** — `Menu regroupé en 9 entrées, anciennes adresses conservées`.

### Tâche 6 : données mortes (migration 4 → 5)

**Fichiers :** modifier `src/lib/backup.ts` (`DATA_VERSION = 5`, listes), `src/lib/sync/merge.ts` (retrait de `theses`, `checklist`, `paper`), `src/store/persistence.ts`, `src/store/useStore.ts`, `src/types.ts`, `src/hooks/useExitPlan.ts`, `src/components/ConsolidateCard.tsx`, `src/ai/context.ts`, `src/runner/evaluate.ts`, `src/pages/Guide.tsx`.

- Migration : supprime `theses`, `checklist` et la rubrique `paper` de l'état (la copie de précaution existante est faite avant).
- [ ] **Étape 1 : écrire les tests** — état v4 → v5 sans ces trois clés, tout le reste identique ; un faisceau distant encore porteur de `theses` est fusionné sans erreur (clés inconnues ignorées) ; un état v5 lu par un code v4 passe en lecture seule (`useStorageStatus` = `newer`).
- [ ] **Étape 2 à 4 : échec, implémentation, succès** ; `grep -rn "theses\|checklist" src` ne renvoie plus que la migration et ses tests.
- [ ] **Étape 5 : commit** — `Ménage : thèses, checklist et ancien réglage du papier supprimés (données v5)`.

### Tâche 7 : documents et publication 1.28.0

- [ ] **Étape 1 :** mettre à jour `README.md`, `docs/FONCTIONNALITES.md` (entrée « v1.28.0 — DCA et trading sur preuves, menu simplifié »), `docs/STRATEGIE.md` (retirer « thèse cassée = sortie » ; règles du DCA et de la température selon le rapport), `runner/README.md`.
- [ ] **Étape 2 :** `npm run typecheck && npm test && npx vite build && npm run build:runner`.
- [ ] **Étape 3 :** publier 1.28.0 (procédure habituelle) et rappeler à l'utilisateur de mettre à jour le runner.
