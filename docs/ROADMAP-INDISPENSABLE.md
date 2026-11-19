# Feuille de route — rendre Boussole indispensable (novembre 2026)

> Outil d'aide à la décision, pas un conseil en investissement.

## ✅ Livré (v1.29.0 → v1.33.0, release GitHub du 19 nov. 2026)

- **Lot A** (v1.29.0) : connexion Binance lecture seule + compte « Binance » intégré au portefeuille, carte « Écarts à ta cible », carte « Risque » (HHI, corrélation BTC, contrepartie, stress tests), onglet « Earn & plateformes » (Simple Earn Binance + pools DefiLlama Jupiter/Orca/Raydium/Hyperliquid + correspondance Binance ↔ Boussole).
- **Lot D** (v1.30.0) : export CSV 2086 par année, moins-values reportables.
- **Lot C** (v1.31.0) : scanner d'approvals EVM sans clé (Blockscout + RPC, « À révoquer »), déblocages de tokens suivis (J-7/J-1, sync).
- **Lot B** (v1.32.0) : radar dérivés & réseau BTC (OI, funding, long/short, mempool) sur le Cockpit.
- **Lot E** (v1.33.0) : webhook HTTPS sur les alertes, rapport mensuel exportable (Markdown).

## Reste à faire

- Lot F : i18n anglais, page GitHub Pages, iOS (build Mac), widget Windows.
- Lot G : circuit breakers anti-panique, brief IA actionnable ligne par ligne, simulations « et si ».
- Côté serveur (VPS) : alerte Telegram J-1 sur les déblocages saisis, dashboard web en lecture seule (nginx + HTTPS).
- Import CSV des autres plateformes (Binance, Kraken, Coinbase) sur le modèle Crypto.com.

## Diagnostic : ce que le projet fait déjà très bien

- **Une mesure honnête** : le banc d'essai (`docs/bench/`) a montré que la plupart des signaux "malins" ne battent pas le hasard, que la température seule fait jeu égal avec le DCA Bitcoin, et que le trader v2 gagne +0,26 R avant frais. C'est une force rare : l'app ne promet pas de battre le marché, elle mesure.
- **La discipline automatisée** : DCA automatique modulé, anti-FOMO 24 h, paliers de vente, mode vacances, score de discipline.
- **La connaissance de ton portefeuille** : journal, comptes, wallets (xpub, EVM, Solana), courbe de valeur vs versements et vs Bitcoin.
- **La veille 24/7** : runner VPS (alertes, briefs, smart money, émergence, autopilotes), œil du gardien, silence nocturne.
- **La protection** : scans de sécurité, verrou biométrique, secrets chiffrés, sync chiffrée, mises à jour intégrées.

## La leçon du banc d'essai (2019-2026)

| Stratégie | vs DCA Bitcoin simple |
|---|---|
| DCA Bitcoin simple | référence (+1577 % depuis 2019, pire baisse −77 %) |
| Investisseur (température) | jeu égal en performance, **pire baisse −65 %** au lieu de −77 % |
| Panier automatique Boussole | **moins bien** que Bitcoin seul (+1095 % vs +1577 %) |
| Trader v2 (setups validés) | +0,26 R par trade avant frais, +0,13 R avec frais d'appli |

**Conclusion** : l'edge ne viendra pas de "meilleurs signaux" magiques. Il viendra de (1) **mieux exécuter** ce qui marche déjà, (2) **ne pas faire les erreurs bêtes** (FOMO, arnaques, ventes panique, éparpillement), (3) **savoir exactement où on en est** (fiscalité, risque, performance réelle), et (4) **des données que personne n'a** — les tiennes.

## Ce qui rend une app "indispensable"

1. Elle connaît **ton** portefeuille, pas le marché générique → alertes et conseils personnalisés.
2. Elle intervient **au bon moment**, même app fermée.
3. Elle te **protège** (arnaques, approvals, unlocks, pertes bêtes).
4. Elle **prouve** son utilité par des chiffres (déjà le cas, à creuser).
5. Elle enlève des **frictions concrètes** (imports, fiscalité, rapports).

## Feuille de route proposée (par lots)

### Lot A — Connaissance totale de ton portefeuille (priorité haute)
- **Connexion read-only des plateformes** (Binance, Coinbase, Kraken, Crypto.com via clés API en lecture seule, stockées chiffrées) : soldes et historique importés seuls, plus de saisie manuelle. L'import CSV existe pour Crypto.com — l'étendre aux autres (idée #1 de la liste) puis le rendre automatique.
- **Alertes de drift personnalisées** : « ta ligne SOL fait maintenant 23 % du portefeuille, ta cible est 15 % — rééquilibrage suggéré », « 3 lignes sous 1 % à regrouper », « ta part stablecoins dépasse X % ».
- **Stress test du portefeuille** : « si BTC −50 % et tes alts −70 %, voici la valeur et la pire baisse ; voici ce que vendent tes paliers ».
- **Métriques de risque** : corrélation au BTC, concentration (HHI), VaR simplifiée, part du portefeuille sur chaque plateforme/chaîne (risque de contrepartie : "30 % chez Crypto.com, 60 % sur Ledger").

### Lot B — Précision macro et on-chain (priorité haute)
Sources gratuites ou peu coûteuses à ajouter à côté de Fear & Greed, MVRV, part stablecoins :
- **Flux ETF Bitcoin** (Farside, données publiques) : entrées/sorties nettes quotidiennes — un vrai signal de demande institutionnelle.
- **Funding rate moyen et open interest** (Binance fapi, déjà en partie) : detecte l'exès de levier (funding extrême = top local) et les liquidations en cascade.
- **Métriques on-chain BTC gratuites** (bitcoin-data.com déjà utilisé, mempool.space) : SOPR, NUPL, réserve des mineurs, frais de transaction (activité réseau) — enrichissent la température et le cycle.
- **Alertes on-chain sur TES tokens** : gros transferts de tes positions vers des exchanges (mempool/DEX) = souvent avant une vente ; wallets smart money qui sortent d'un token que tu détiens.
- **Détection de régime** (tendance/haussier/baissier/range) sur BTC hebdo, affichée dans le Cockpit, et utilisée pour moduler les signaux.

### Lot C — Sécurité proactive (priorité haute)
- **Scanner de révocations** (idée #7) : pour chaque wallet EVM suivi, lister les approvals à risque (illimités, contrats non vérifiés) via les RPC/Blockscout, avec bouton "révoquer" guidé (idea: revoke.cash en référence, jamais de signature depuis l'app).
- **Calendrier des unlocks** (idée #3, Tokenomist ou source gratuite) : alerte J-7, J-1 sur les déblocages des tokens que tu détiens ou suis, avec % de la supply concernée.
- **Alertes contrat** : changement de owner, mint activé, honeypot basculé, taxe modifiée sur un token de ton portefeuille (GoPlus/RugCheck déjà utilisés, à pousser en surveillance continue via le runner).
- **Rappel anti-arnaque contextuel** : 98,6 % des tokens pump.fun sont des arnaques — avertissement renforcé à l'achat d'une paire < 7 jours.

### Lot D — Fiscalité française automatisée (priorité haute pour un utilisateur FR)
- **Rapport de cessions 2026** : chaque vente crypto→crypto ou crypto→fiat calculée (prix de cession − prix d'acquisition au taux du jour), plus/moins-value, abattement si applicable.
- **Export formulaire 2086 / 3VG pré-rempli** (PDF ou CSV importable), récapitulatif annuel, et alerte « tu as réalisé X € de moins-values déclarables ».
- **Rapport mensuel PDF** (idée #10) : performance, respect des règles, décisions du mois, frais payés, à archiver.

### Lot E — Exécution et suivi sans friction (priorité moyenne)
- **Attribution de performance** : quelles décisions t'ont coûté de l'argent (journal à chaud + rejoué des signaux) — "tes 3 achats impulsifs ont coûté X %".
- **Préparation d'ordres** : depuis l'app, générer le récapitulatif copier-coller pour passer l'ordre sur Crypto.com/Binance (montant, prix limite suggéré, stop).
- **Dashboard web sur le VPS** : ouvrir un port + nginx + HTTPS (Let's Encrypt) pour consulter valeur du portefeuille, température, alertes depuis n'importe quel navigateur, en lecture seule, protégé par Tailscale ou un mot de passe.
- **Webhooks sortants** : Boussole peut notifier tes autres outils (TradingView via webhook, un script perso) quand un signal perso se déclenche.

### Lot F — Ouverture au public (priorité moyenne)
- **i18n anglais** (le dépôt est public depuis la 1.20) : toute l'interface traduisible, anglais par défaut hors France.
- **Page d'accueil web** (GitHub Pages depuis le dépôt) avec captures, téléchargement, FAQ.
- **Version iOS** (idée #11) : Capacitor le permet, build sur Mac nécessaire.
- **Widget Windows** (comme le widget Android de la 1.16).

### Lot G — Le "copilote parfait" (vision long terme)
- **Brief IA qui agit sur TON cas** : "tu as 200 USDC de réserve, Fear & Greed à 24, ton panier est à jour — voici exactement quoi faire aujourd'hui, ligne par ligne" (déjà en partie via l'ordre du jour + optimisation IA).
- **Circuit breakers anti-panique** : en krach (F&G < 20), l'app affiche « voici ta thèse, voici tes règles, aucune vente n'est prévue aujourd'hui" et bloque (délai 24 h) toute vente impulsive hors plan de sortie.
- **Simulation "et si"** : rejouer n'importe quelle décision passée avec les données d'aujourd'hui ("et si j'avais vendu à ce palier ?").

## Ce qui est déjà livré et qu'il ne faut PAS casser

Signaux mesurés avec fiabilité affichée, autopilotes avec verdict de confiance, copie en réel suivie, sync chiffrée, runner VPS + œil du gardien, mises à jour intégrées, verrou biométrique, widget Android, banc d'essai rejouable (`npm run bench`).

## Ordre conseillé

A (connaissance de toi) → D (fiscalité) → C (sécurité) → B (macro on-chain) → E (frictions) → F (public) → G (vision).

Pourquoi cet ordre : A et D ne demandent aucune donnée externe et créent la valeur la plus personnelle (on ne trouve ça nulle part ailleurs) ; C protège ; B améliore la précision du marché mais le banc d'essai dit que ça ne fera pas de miracles seul.
