# Lot 3 — Signaux refaits sur preuves : plan d'implémentation

> **Pour les agents :** sous-compétence requise : superpowers:subagent-driven-development (recommandée) ou superpowers:executing-plans, tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`).

**But :** remplacer les pondérations fixées à la main par des signaux dont chaque composant a passé le banc d'essai sur une période qui n'a pas servi à le régler (version 1.26.0, `SIGNALS_VERSION = 2`).

**Architecture :** les candidats sont des « extracteurs » de l'étude de signal du lot 1. On les mesure selon un protocole écrit, on garde ceux qui sont validés, puis on reconstruit les signaux investisseur et trader comme des tables de décision. Le contenu exact des tables dépend des mesures : ce plan fixe la méthode, la structure du code et les conditions de sortie.

**Pile :** TypeScript strict, Vitest, outil `npm run bench`.

**Fiche :** [docs/superpowers/specs/2026-11-15-labo-banc-d-essai-autopilote-design.md](../specs/2026-11-15-labo-banc-d-essai-autopilote-design.md), section 10. **Prérequis :** lot 1 ; lot 2B pour l'archivage automatique des autopilotes.

## Contraintes globales

- Interface, commentaires et messages de commit en français ; chaque message de commit se termine par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Période de réglage jusqu'au 31/12/2022 inclus ; période de contrôle à partir du 01/01/2023. Paramètres choisis sur la seule période de réglage, valeurs rondes, trois essais au plus par candidat ; chaque regard sur le contrôle inscrit dans `docs/bench/journal.md`.
- Un candidat entre dans les signaux seulement s'il est « validé » et si son effet a le même sens sur 60 % ou plus des actifs ayant au moins 5 épisodes. « Prometteur » : affichable comme information, sans effet sur un libellé.
- Conditions de sortie : fiche 10.5, à l'identique. Un libellé qui ne les atteint pas est retiré ou remplacé par « pas de signal fiable ».
- Fréquences visées en contrôle : « Accumuler fort » ≤ 5 % des jours, « Accumuler » ≤ 25 %.
- Fin de lot : `npm run typecheck`, `npm test`, `npx vite build`, essai de fumée, entrée de version, publication.

## Points de vigilance

1. **Régler en douce sur la période de contrôle.** Attendu : le journal liste chaque regard ; aucun candidat au-delà de trois essais. Vérifié par la tâche 7.
2. **Un candidat validé sur trois cryptos qui tirent la moyenne.** Attendu : règle des 60 % d'actifs dans le même sens. Test en tâche 2.
3. **Données manquantes pour un candidat (financement, pression acheteuse absents d'anciennes bougies).** Attendu : le candidat est muet ces jours-là, jamais compté comme « faux ». Test en tâche 1.
4. **« Prendre des profits » toujours inatteignable.** Attendu : atteignable sur un cas construit. Test en tâche 4.
5. **Autopilotes qui continuent avec les anciennes règles.** Attendu : archivés et relancés à la mise à jour. Vérifié en tâche 7.

---

### Task 1: pression acheteuse dans les bougies et extracteurs candidats

**Fichiers :** modifier `src/lib/indicators.ts` (`Candle.takerBuyQuote?: number`), `src/api/binance.ts` (`toCandle` lit le champ 10), `src/runner/market.ts`, `scripts/bench/fetch.ts` ; créer `src/lib/lab/candidates.ts` et son test.

**Interfaces — consomme :** `Extractor`, `ObsCtx`, `KeyMeta` (lot 1, `events.ts`).

**Interfaces — produit :** `CANDIDATES: { meta: KeyMeta; extract: Extractor; params: Record<string, number> }[]`, un élément par ligne du tableau de la fiche 10.3 (F1 à F14, variantes comprises), clés `cand:F3:h20v15` (numéro, puis paramètres). F11 lit l'historique de financement par une source injectée ; sans données, l'extracteur ne renvoie rien. F13 et F14 sont des variantes de `planR` (clés `plan:*`).

- [ ] **Étape 1 : écrire les tests** — un cas vrai et un cas faux construits à la main pour chaque candidat ; F4 sans `takerBuyQuote` → aucune clé ; F3 en variante 55 jours ne se déclenche pas sur une cassure à 20 jours.
- [ ] **Étape 2 à 4 : échec, implémentation, succès** ; les tests existants des bougies Binance restent verts.
- [ ] **Étape 5 : commit** — `Banc d'essai : candidats F1 à F14 et pression acheteuse`.

### Task 2: protocole, journal et règle des 60 %

**Fichiers :** créer `docs/bench/protocole.md` (fiche 10.2, recopiée), `docs/bench/journal.md` (en-tête : date, candidat, paramètres, période regardée, résultat) ; modifier `src/lib/lab/events.ts` et son test, `scripts/bench/main.ts` (commande `candidates [--control]`).

**Interfaces — produit :** `consistencyPct(stats: AssetKeyStats[]): number` (part des actifs ayant au moins 5 épisodes dont l'effet a le sens attendu) ; `studySignals` renvoie aussi `byAsset: Record<string, AssetKeyStats[]>`. La commande `candidates` mesure sur la période de réglage seule ; avec `--control`, elle mesure aussi le contrôle **et ajoute une ligne au journal**.

- [ ] **Étape 1 : écrire les tests** — `consistencyPct` sur 10 actifs dont 7 dans le bon sens et 2 sous 5 épisodes → 7 ÷ 8 ; la commande avec `--control` ajoute exactement une ligne au journal (test sur la fonction `appendJournal`).
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Banc d'essai : protocole, journal des essais, cohérence entre actifs`.

### Task 3: mesurer et décider

**Fichiers :** produire `docs/bench/AAAA-MM-JJ-candidats.md` ; compléter `docs/bench/journal.md`.

- [ ] **Étape 1 :** `npm run bench -- candidates` (réglage seul) ; pour chaque candidat, choisir au plus trois jeux de paramètres d'après le réglage.
- [ ] **Étape 2 :** `npm run bench -- candidates --control` une fois par jeu retenu.
- [ ] **Étape 3 :** écrire en tête du rapport la liste de décision : « retenu », « information seulement » (prometteur), « abandonné », avec la raison chiffrée. F5 : abandonné s'il échoue encore. F11 : « non mesurable » si l'historique de financement est inaccessible.
- [ ] **Étape 4 : commit** — `Banc d'essai : mesure des candidats et décisions`.

### Task 4: signal investisseur en table de décision

**Fichiers :** modifier `src/lib/signals.ts` (`SIGNALS_VERSION = 2`) et `src/lib/signals.test.ts`.

**Interfaces — produit :**
- `interface InvestorFeatures` : un booléen ou un nombre par candidat retenu (noms en clair, par ex. `trendUp`, `deepValue`, `excess`, `zone`).
- `investorFeatures(window: Candle[], ctx: AnalysisContext): InvestorFeatures`
- `INVESTOR_TABLE: { label: string; tone: Tone; strength: 0 | 1 | 2; when: (f: InvestorFeatures) => boolean; why: (f: InvestorFeatures) => string }[]` — évaluée dans l'ordre, première ligne vraie ; dernière ligne « Conserver ». Règles de la fiche 10.4 : « Accumuler » et « Accumuler fort » seulement sur condition haussière retenue ; « Alléger » = état de risque (F10 ou euphorie) ; « Prendre des profits » atteignable ; libellé sans condition retenue → « pas de signal fiable ».
- `analyze()` garde sa signature ; `SignalResult.factors` liste les conditions de la ligne choisie avec leur phrase de fiabilité ; `score` ne sert plus qu'au tri (somme des seuls facteurs retenus).

- [ ] **Étape 1 : écrire les tests** — un cas par ligne de la table ; « Prendre des profits » sur une série construite (Mayer > 2, RSI hebdomadaire > 80, euphorie) ; fréquence de chaque libellé sur le jeu d'essai embarqué (`src/lib/__fixtures__/` : 400 jours de deux cryptos) dans les plafonds visés.
- [ ] **Étape 2 à 4 : échec, implémentation, succès.**
- [ ] **Étape 5 : commit** — `Signal investisseur v2 : table de décision fondée sur les mesures`.

### Task 5: signal trader et plan de trade

**Fichiers :** modifier `src/lib/signals.ts`, `src/lib/signals.test.ts`.

- « Achat » exige un setup haussier retenu, et un régime favorable si F1 est retenu ; « Vente » exige un setup baissier retenu ; sinon « Neutre ». « Achat fort » : deux setups retenus ou setup + régime.
- `detectSetups` ne produit plus que les setups retenus (les autres disparaissent de `SETUP_KEYS`).
- Plan : variante de F13/F14 à la meilleure espérance en contrôle (stop, objectif, sortie à la clôture si elle l'emporte) ; `TradePlan` reçoit `exitOnClose?: boolean`.

- [ ] **Étape 1 : écrire les tests** — « Achat » impossible sans setup retenu ; régime défavorable → « Neutre » si F1 est retenu ; setup retiré absent de la sortie ; plan conforme à la variante choisie.
- [ ] **Étape 2 à 4 : échec, implémentation, succès** ; les stratégies du registre (`trader`) passent leurs tests, mis à jour si une clé de setup a disparu.
- [ ] **Étape 5 : commit** — `Signal trader v2 : les setups validés d'abord`.

### Task 6: textes, IA et écrans

**Fichiers :** modifier `src/pages/Market.tsx` (« Comment lire ces signaux »), `src/pages/Guide.tsx`, `src/pages/CoinDetail.tsx`, `src/ai/context.ts`, `src/ai/prompts.ts`.

- Chaque facteur affiché cite sa mesure (phrase de fiabilité du lot 1).
- `ai/context.ts` transmet, pour chaque signal cité, `{ libelle, fiabilite: reliabilityPhrase(...) }` ; les consignes de `ai/prompts.ts` interdisent de présenter un signal sans sa fiabilité.
- [ ] **Étape 1 : implémenter.**
- [ ] **Étape 2 : vérifier** `npx vitest run src/ai` et la vue « Voir ce qui part vers l'IA » (Réglages) contient le champ `fiabilite`.
- [ ] **Étape 3 : commit** — `Signaux v2 : textes, Guide et contexte de l'IA`.

### Task 7: conditions de sortie, régénération et publication 1.26.0

- [ ] **Étape 1 :** `npm run bench -- signals` et `npm run bench -- strategies` ; `src/data/reliability.json` porte `rulesVersion: 2`.
- [ ] **Étape 2 :** `npm run bench -- compare trader@1 trader@2` et idem pour `dca-boussole` (base seule) ; rapport `docs/bench/AAAA-MM-JJ-signaux-v1-v2.md` reprenant les cinq conditions de la fiche 10.5 une par une, atteintes ou non. Toute condition non atteinte → retour à la tâche 4 ou 5 pour retirer le libellé concerné.
- [ ] **Étape 3 :** vérifier dans `docs/bench/journal.md` qu'aucun candidat ne dépasse trois essais.
- [ ] **Étape 4 :** essai de fumée : les autopilotes existants sont archivés (« anciennes règles ») et relancés au premier lancement ; aucun setup « sans effet » ou « inversé » visible ; `/marche`, `/coin/bitcoin`, `/labo?tab=banc` sans écran d'erreur.
- [ ] **Étape 5 :** entrée « v1.26.0 — Signaux sur preuves » dans `docs/FONCTIONNALITES.md`, `README.md` ; `npm run typecheck && npm test && npx vite build && npm run build:runner` ; publier 1.26.0.
