# 🧭 Boussole Crypto — ton copilote d'investissement

Tableau de bord personnel pour investir en cryptomonnaies avec méthode : **signaux d'achat/vente expliqués**, **détecteur de pépites** avec scan anti-arnaque, **panier DCA** (cœur + une ligne découverte, réserve d'USDC, règles contre l'éparpillement), **plan de sortie par paliers**, **comptes** (Ledger, Crypto.com, Phantom) sans double comptage, **rendement et staking**, **trading**, **airdrops**, **fiscalité française** et un **copilote IA** qui rédige ton analyse quotidienne.

Disponible en **application Windows (.exe)** et **Android (.apk)** à partir d'une seule base de code. L'IA fonctionne avec **Nous Portal** (modèles économiques comme DeepSeek, quelques centimes par jour) ou avec **Claude** (Anthropic), au choix dans les Réglages.

La méthode d'analyse s'inspire du projet open source [AI Berkshire](https://github.com/xbtlin/ai-berkshire) (Buffett, Munger, Duan Yongping, Li Lu), adapté aux cryptoactifs : faits sourcés plutôt qu'opinions, deux côtés à chaque argument, verdict tranché, inversion (« comment ça peut échouer ? »), thèse écrite avant d'acheter.

> ⚠️ Outil d'aide à la décision et d'éducation, **pas un conseil en investissement**. Aucun indicateur ni aucune IA ne prédit le marché. N'investis que ce que tu peux te permettre de perdre.

---

## Installer

| Plateforme | Fichier | Installation |
|---|---|---|
| Windows | `release/Boussole-Crypto-Setup-1.7.0.exe` | Double-clic → installe l'app et crée un raccourci. Windows SmartScreen peut afficher « éditeur inconnu » (app non signée) : *Informations complémentaires → Exécuter quand même*. |
| Windows (sans installation) | `release/Boussole-Crypto-Portable-1.7.0.exe` | Se lance directement, par exemple depuis une clé USB. |
| Android | `release/Boussole-Crypto-1.7.0.apk` | Copie le fichier sur le téléphone (câble, Drive, e-mail) → ouvre-le → autorise « installer des applications inconnues » pour l'app utilisée. |

Au premier lancement : accepte l'avertissement, puis remplis ton **profil investisseur** (2 minutes). Ensuite, dans **Réglages** :
1. **Clé API pour l'IA** : choisis ton fournisseur. *Nous Portal* (par défaut, économique) : clé créée sur [portal.nousresearch.com](https://portal.nousresearch.com), modèle **DeepSeek V4.1 Flash** proposé par défaut. *Claude (Anthropic)* : clé créée sur [console.anthropic.com](https://console.anthropic.com/settings/keys). Colle la clé, puis clique sur *Tester la connexion*.
2. **Clé CoinGecko « Demo »** (gratuite, recommandée) : [coingecko.com/fr/api/pricing](https://www.coingecko.com/fr/api/pricing). Sans elle, l'API publique limite fortement le nombre de requêtes et certaines pages se chargent lentement.

Pour retrouver tes données sur le PC et le téléphone : *Réglages → Exporter* sur un appareil, *Importer* sur l'autre (l'import remplace les données après confirmation et copie de sécurité). Une sauvegarde automatique est aussi faite chaque jour (PC : `Documents\Boussole\sauvegardes` ; Android : `Documents/Boussole`).

Pour que les alertes (paliers de vente, échéances du panier, marché) arrivent même fenêtre fermée : sous Windows, laisse l'option *Rester actif en arrière-plan* activée (Boussole se réduit près de l'horloge ; « Quitter » dans le menu de son icône l'arrête) ; sous Android, autorise les notifications et désactive l'optimisation de batterie pour Boussole.

---

## Ce que fait l'application

| Module | Ce que tu y trouves |
|---|---|
| **Cockpit** | Température du marché (0-100), « Que faire aujourd'hui ? » (échéance du panier, paliers de vente, éparpillement), portefeuille, Bitcoin, Fear & Greed, dominance, saison des altcoins, brief IA, signaux de tes cryptos, **bilan de la semaine**, narratives du jour, tendances. |
| **Signaux** | Pour chaque crypto du top 50/100, de ta watchlist ou de tes positions : un signal **Investisseur** (tendance de fond, multiple de Mayer, RSI hebdo, cycle) et un signal **Trader** (momentum, MACD, RSI, Bollinger, cassures avec volume). Chaque facteur est expliqué. |
| **Fiche crypto** | Graphique en chandeliers (MM50/MM200, volume, RSI), plan d'action (zone d'accumulation, entrée, stop ATR, objectifs 1,5 R et 3 R), taille de position adaptée à ton profil, fondamentaux, ta thèse, analyses IA. |
| **Wallet** | Journal de transactions (coût moyen, plus-values latentes et réalisées), **comptes** (Ledger, Crypto.com, Phantom) reliés à tes wallets sans double comptage et rapprochés de la blockchain, **import du CSV Crypto.com**, **frais réels** (écart de prix de l'application), suivi d'**adresses publiques** et de **clés publiques étendues (xpub)** Bitcoin / EVM (7 réseaux) / Solana, répartition par poche de risque vs ta cible, **plan de sortie** par paliers, comparaison « tout en Bitcoin », petites lignes à regrouper, test de résistance, **fiscalité française** (formule 150 VH bis, seuil de 305 €, flat tax 31,4 %). Sur téléphone, positions et transactions s'affichent en cartes. Le panier DCA est dans la barre du bas ; Pépites et Trading sont dans Réglages, rubrique « Outils avancés ». |
| **DCA** | **Panier** en USDC (jours d'achat, cœur, liste découverte, réserve) avec **ordre du jour** calculé selon le marché et tes règles, **pont avec Grok** (prompt prêt à copier, réponse contrôlée), plans avancés à une seule crypto (classique, Fear & Greed, multiple de Mayer, température), bouton « J'ai passé ces ordres » qui alimente le journal, rappels, **simulateur** sur l'historique réel (depuis 2017 pour Bitcoin et Ethereum, moins pour les cryptos plus récentes). |
| **Trading** (Réglages → Outils avancés) | Calculateur de taille de position (risque %, levier, liquidation), journal avec statistiques (taux de réussite, R moyen, profit factor, courbe), alertes de prix, coaching IA. Le scanner de setups reste dans Signaux. |
| **Pépites** (Réglages → Outils avancés) | Petites capitalisations scorées (activité, momentum sain, dilution FDV, décote), tokens on-chain tendance (Solana, Base, Ethereum, BNB, Arbitrum) avec **scan de sécurité** (honeypot, taxes, mint, liquidité verrouillée, concentration), DeFi sous-évaluée (capitalisation vs TVL et revenus), narratives, tokens suivis. |
| **Rendement & DeFi** | Rendement du staking et du prêt de stablecoins à ta taille (« pas la peine » sous 10 € par an), risques et mode d'emploi ; **enveloppe DeFi** pour tes paris sur Solana : plafond, achat maximal, mise retirée à ×2, pause après −50 %, contrôle avant achat d'un token. |
| **Airdrops** | Tracker de farming (tâches quotidiennes/hebdomadaires, coûts, échéances), radar DefiLlama des protocoles sans token, éclaireur IA (recherche web des campagnes actives), règles de sécurité anti-arnaque. |
| **Copilote IA** | Brief quotidien (automatique si tu l'actives), conseiller en conversation qui connaît ton dossier, **comité des 4 sages** (4 analystes en parallèle + un président), vérification de thèse, « pourquoi ça bouge ? », historique et coût de chaque analyse. |
| **Guide** | Questionnaire de profil (Prudent → Audacieux) qui fixe l'allocation cible et les règles de risque, les 10 règles de la méthode, checklist avant achat, glossaire. |

### L'IA en pratique
Deux fournisseurs au choix dans *Réglages* :

| | **Nous Portal** (par défaut) | **Claude (Anthropic)** |
|---|---|---|
| Modèles | 11 proposés dans Réglages avec leur prix en direct : DeepSeek V4.1 Flash (défaut), Claude Haiku 5.5, DeepSeek V4 Pro, Grok 4.7, Claude Sonnet 5.5 / Opus 4.7 / Opus 5, Muse Wonder, Gemini 4 Argon, GPT-6 Sol, GPT-6 Astra — ou n'importe quel modèle du catalogue Nous (« Autre modèle… ») | Opus 5.5, Sonnet 5.5, Haiku 5.5 |
| Coût mesuré | **≈ 0,003 $ par brief**, ≈ 0,001 $ par analyse rapide (DeepSeek V4.1 Flash) | ≈ 0,15 à 0,40 $ par brief avec Opus 5.5 (estimation, non mesurée) |
| Actualités | Pas de recherche web : l'app fournit au modèle les derniers titres de CoinDesk, Cointelegraph, Decrypt et The Block, et lui **interdit d'inventer** une actualité (« non vérifié (pas d'accès web) ») | Recherche web côté serveur, sources listées sous chaque rapport |
| Éclaireur d'airdrops | Indisponible (il a besoin du web) : utilise le Radar DeFi | Disponible |

- Le coût réel de chaque analyse est affiché sur le rapport quand le fournisseur le renvoie.
- Un modèle sans accès web invente volontiers des « actualités » périmées si on ne le lui interdit pas : c'est pourquoi l'app ajoute cette consigne et injecte de vraies actualités.
- Avec Claude, un repli automatique côté serveur est activé (`fallbacks: "default"`) : si le modèle décline une requête légitime, l'API la relance sur un modèle de secours.

---

## Données et confidentialité
- **Tes données sont stockées sur ton appareil** : transactions, wallets, plans, journal, rapports IA. Il n'y a ni serveur Boussole ni compte à créer. Les seules données qui sortent de l'appareil : le dossier résumé envoyé à ton fournisseur IA pour les analyses (contenu exact visible dans *Réglages → Voir ce qui part vers l'IA*), et les adresses publiques requises pour lire tes wallets.
- **Option « Anonymiser »** (*Réglages*) : le dossier IA part sans ton prénom et sans montants, remplacés par des pourcentages. Le reste de l'analyse est inchangé.
- Les wallets sont lus en **lecture seule** à partir d'adresses publiques ou de clés publiques étendues (xpub). L'app ne demande jamais de phrase secrète ni de clé privée, et refuse une clé privée étendue (xprv) si tu la colles par erreur.
- Ton fichier CSV Crypto.com est lu sur l'appareil ; seuls les noms des cryptos peuvent être recherchés en ligne.
- Ta clé API (Nous Portal ou Anthropic) est stockée localement, n'est envoyée qu'à l'adresse de l'API choisie et n'est jamais incluse dans les sauvegardes exportées. La sauvegarde automatique d'Android est désactivée et le débogage du WebView aussi.
- Sources : CoinGecko, Binance (données publiques), liste publique de Crypto.com Exchange, alternative.me (Fear & Greed), DefiLlama (TVL, frais, rendements), GeckoTerminal, DexScreener, GoPlus, RugCheck, mempool.space, Jupiter, nœuds publics PublicNode, flux RSS de CoinDesk / Cointelegraph / Decrypt / The Block.

---

## Développer

Prérequis : Node.js 20+.

```bash
npm install
npm run dev          # version navigateur sur http://localhost:5173
npm test             # tests des calculs (indicateurs, DCA, fiscalité, risque…)
npm run typecheck    # vérification TypeScript
```

### Construire l'application Windows (.exe)
```bash
npm run build:exe    # → release/Boussole-Crypto-Setup-x.y.z.exe et …-Portable-x.y.z.exe
```

### Construire l'application Android (.apk)
Prérequis : SDK Android (installé avec Android Studio) et **JDK 21** (par exemple dans `~/.jdks`, détecté automatiquement, ou via la variable `BOUSSOLE_JDK`).
```bash
npm run build:apk    # → release/Boussole-Crypto-x.y.z.apk (signé)
```
Au premier build, une clé de signature est créée dans `android/boussole-release.jks` avec `android/keystore.properties`. **Conserve ces deux fichiers** : sans eux, tu ne pourras pas installer une mise à jour par-dessus l'app existante (il faudrait la désinstaller).

Pour une nouvelle version : augmente `version` dans `package.json`, puis relance les deux commandes.

### Icônes
`npx electron scripts/make-icons.cjs` régénère l'icône Windows et les icônes et écrans de démarrage Android à partir du logo vectoriel.

### Structure
```
src/
  lib/        calculs purs et testés (indicateurs, signaux, cycle, DCA, panier, comptes, import Crypto.com, xpub, plan de sortie, rendement, enveloppe DeFi, fiscalité, risque, pépites)
  api/        sources de données (CoinGecko, Binance, DefiLlama, DEX, sécurité, wallets)
  ai/         clients IA (Claude et API compatible OpenAI), prompts (méthode AI Berkshire adaptée), tâches (brief, comité, chat…)
  hooks/      données de marché, portefeuille, conseils du jour, brief
  pages/      les 12 écrans
  components/ interface (cartes, graphiques, formulaires, rapports IA)
electron/     application Windows
android/      application Android (Capacitor)
docs/         vision produit et feuille de route
```
