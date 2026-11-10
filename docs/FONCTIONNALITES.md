# Boussole Crypto — vision produit et feuille de route

## Vision
Un copilote d'investissement crypto **personnel**, qui transforme les meilleures pratiques des grands investisseurs en **décisions simples au quotidien** : quand accumuler, quand alléger, quelles pépites étudier, combien miser, sans céder au FOMO ni à la panique.

Principes repris du framework [AI Berkshire](https://github.com/xbtlin/ai-berkshire) :
- **Faits plutôt qu'opinions** : chiffres sourcés, « donnée indisponible » plutôt qu'un chiffre inventé.
- **Deux côtés** : chaque argument est accompagné de son contre-argument.
- **Verdict tranché** et niveau de confiance (pas de « ça dépend »).
- **Inversion** (Munger) : d'abord comment l'idée peut échouer.
- **Discipline** : thèse en 5 phrases (test du miroir), lignes rouges, taille de position.
- **Biais d'information** : richesse A/B/C ; peu d'informations ≠ mauvais projet, mais plus d'incertitude.

## Utilisateur cible
Nico, investisseur particulier en France. Il fait du DCA, s'intéresse aux pépites et aux airdrops, trade ponctuellement, et veut un outil sur PC et sur téléphone qui le **guide** sans décider à sa place.

## Version 1.0 — livrée

| Épopée | Récits utilisateur couverts |
|---|---|
| **Cockpit** | Je vois en un coup d'œil la température du marché et ce que je dois faire aujourd'hui (DCA, rééquilibrage, prises de profits). |
| **Signaux** | Pour chaque crypto, je sais si c'est le moment d'accumuler ou d'alléger (investisseur) et s'il y a un setup (trader), avec l'explication de chaque facteur. |
| **Pépites** | Je repère des petites capis prometteuses et des tokens on-chain en traction, et je vérifie leur sécurité avant d'acheter. |
| **Wallet** | Je suis mes positions (journal et adresses publiques), ma répartition par rapport à ma cible, ma résistance à un krach et mon impôt estimé. |
| **DCA** | Je programme mes achats ; l'app m'indique le montant optimal selon le climat du marché, et je peux simuler la stratégie sur l'historique. |
| **Trading** | Je calcule ma taille de position, je trouve des setups, je tiens mon journal et l'IA me coache. |
| **Airdrops** | Je trouve les protocoles susceptibles de distribuer un token, je suis mes tâches et j'évite les arnaques. |
| **Copilote IA** | Je reçois un brief chaque jour, je pose mes questions, je fais étudier une crypto par un comité de 4 sages, je fais vérifier mes thèses. |
| **Guide** | Mon profil fixe mon allocation et mes règles de risque ; une checklist m'empêche d'acheter sur un coup de tête. |
| **Multiplateforme** | Une seule base de code pour Windows (.exe) et Android (.apk), avec sauvegarde et restauration entre les deux. |

## Version 1.1 — fournisseur d'IA économique
- **Nous Portal** (API compatible OpenAI) en plus de Claude, avec **DeepSeek V4.1 Flash** par défaut : environ 0,003 $ par brief, mesuré sur un vrai brief.
- Choix du modèle dans les Réglages (catalogue de ~400 modèles avec leurs prix), coût réel affiché sur chaque rapport.
- 11 modèles proposés d'emblée, dont ceux du classement Vending-Bench 2 (Grok 4.7, Claude Sonnet 5.5 / Opus 4.7 / Opus 5, Muse Wonder, Gemini 4 Argon, GPT-6 Sol, GPT-6 Astra). Attention : ce classement mesure la gestion autonome d'un distributeur simulé sur un an, pas la qualité d'un brief crypto. Gemini 4 Carbon et la variante « Full » de Muse Wonder ne sont pas au catalogue Nous.
- **Actualités réelles** (CoinDesk, Cointelegraph, Decrypt, The Block) fournies au modèle sans recherche web, avec interdiction d'inventer ; filtrage par crypto pour les analyses.
- Analyses IA bloquées tant que les données de marché et le portefeuille ne sont pas chargés (évite une position à 0 €).
- Correctif Android : barre de navigation du bas poussée hors de l'écran par un débordement horizontal.

## Versions 1.2 à 1.6.1 — de l'outil générique à ton vrai portefeuille

Point de départ : un Ledger (Bitcoin et Ethereum), un panier de 19 lignes sur Crypto.com alimenté par un DCA de 25 USDC deux fois par semaine, et l'envie de faire de la DeFi sur Phantom. Les règles par défaut sont décrites dans [STRATEGIE.md](STRATEGIE.md) ; le prompt Grok amélioré dans [PROMPT-GROK-DCA.md](PROMPT-GROK-DCA.md).

### v1.2 — Mon vrai portefeuille
- **Comptes** (Ledger, Crypto.com, Phantom…) : la blockchain fait foi pour les quantités d'un compte lié à un wallet, le journal ne sert plus qu'à connaître le prix d'achat ; rapprochement des deux ; transferts entre comptes (le prix d'achat suit).
- **Bitcoin du Ledger en entier** avec la clé publique étendue (xpub, ypub, zpub) : adresses dérivées localement (vecteurs officiels BIP44/49/84/86 vérifiés), lecture seule.
- **Import du CSV de l'application Crypto.com** : natures d'opération reconnues, natures inconnues à classer par toi, aucun doublon en cas de réimport. Le format est celui de l'application ; il n'a pas pu être vérifié sur un export réel.
- **Frais réels** : ton prix d'achat comparé au cours Binance de la même minute.
- **Badge « disponible sur Crypto.com »** (liste publique de l'Exchange) sur les signaux, les pépites et chaque fiche, avec confirmation manuelle.
- **Règles contre l'éparpillement** : nombre de lignes maximal, poids minimal d'une ligne, lignes « découverte » maximales.

### v1.3 — Mon DCA
- **Panier DCA** en USDC : jours d'achat, cœur (poids cibles) et liste « découverte » de 5 cryptos au plus.
- **Ordre du jour** : montant modulé par la température du marché, réserve d'USDC, une seule ligne découverte par échéance (on finit une ligne avant d'en ouvrir une autre), plafond par ligne, anti-FOMO, disponibilité Crypto.com. Confirmation avec la quantité réellement reçue.
- **Fiche des 12 critères** pour chaque crypto, sur données réelles ; « non vérifié » quand une donnée manque (calendrier des déblocages et réseaux sociaux ne sont pas disponibles gratuitement).
- **Pont avec Grok** : prompt prêt à copier avec tes positions, lecture de sa réponse, contrôle de chaque ordre avec tes règles.
- **Petites lignes à regrouper** vers Bitcoin, avec enregistrement au journal. Avis facultatif de l'IA sur l'ordre du jour.

### v1.4 — Quand vendre, être prévenu
- **Plan de sortie** : paliers (×2, ×3, ×5) sur ton prix de revient pour les altcoins, allègement par tranches de 5 à 10 % en euphorie pour Bitcoin et Ethereum.
- **Alertes application fermée** : sous Windows, Boussole reste dans la zone de notification (option) ; sous Android, un script d'arrière-plan vérifie les alertes de prix et les paliers de vente toutes les 30 minutes environ, et les rappels du panier et du bilan sont programmés.
- **Comparaison « et si tout avait été en Bitcoin ? »** pour le portefeuille et la poche découverte.
- **Bilan de la semaine** (Cockpit) avec résumé IA facultatif, rappel le dimanche à 18 h.

### v1.5 — Rendement et DeFi
- **Rendement et staking** : neuf options reconnues (Lido, ether.fi, Rocket Pool, Jito, Marinade, Jupiter, Kinetiq, Aave, Maple), rendement lu sur DefiLlama, gain à ta taille, risques et mode d'emploi. « Pas la peine » sous 10 € par an.
- **Enveloppe DeFi** : plafond en % du portefeuille, achat maximal, mise retirée à ×2, pause d'un mois après −50 %, contrôle avant achat d'un token Solana (sécurité, liquidité, âge, concentration), journal des paris.

### v1.5.1 — Ne plus rien perdre
- **Sauvegarde automatique quotidienne** (PC : `Documents\Boussole\sauvegardes`, 14 fichiers gardés ; Android : `Documents/Boussole`), sans clé API. Réglages indique la dernière sauvegarde ; le Cockpit rappelle au-delà de 7 jours.
- **Import sûr** : le fichier est vérifié (éléments illisibles ignorés), un résumé « sur cet appareil / dans le fichier » demande confirmation, une copie « avant import » est faite, et ni les clés API ni le serveur d'IA ne sont jamais repris d'un fichier.
- **Stockage protégé** : migrations de format prévues, copie de précaution avant toute migration, bandeau si le stockage est plein ou si les données viennent d'une version plus récente (lecture seule, rien n'est écrasé).
- **Écran de secours** : une erreur d'affichage ne laisse plus un écran blanc ; export, suppression des rapports IA ou réinitialisation proposés. Le JSON renvoyé par l'IA est remis en forme avant stockage et affichage.
- Export : la clé CoinGecko n'est plus incluse. Plafonds réduits (25 rapports IA, 60 messages de chat).
- Importeur Crypto.com : une date seule ne crée plus d'heure fictive à minuit.

### v1.6.0 — Des conseils fidèles, des chiffres justes
- **Profil « Ma stratégie »** (Guide & profil) : BTC 65 %, ETH 20 %, altcoins 15 %, règles de `STRATEGIE.md`. Revalider le profil ne l'écrase plus.
- **Le cœur n'est jamais « à alléger » hors euphorie** : un excès de Bitcoin se corrige en orientant le DCA. Les tranches allégées en euphorie sont mémorisées (30 jours entre deux), pas de palier sous 20 $ ni sur une ligne à regrouper. La règle « vendre 20 à 30 % partout » n'existe plus.
- **« Que faire aujourd'hui ? » est toujours calculé par tes règles** ; l'avis de l'IA s'affiche en dessous. Le brief reçoit l'ordre du jour du panier et attend que le portefeuille soit complètement chargé.
- **Panier** : la ligne découverte est décidée d'abord, ce qu'elle ne dépense pas revient au cœur (plus de budget à moitié investi en peur extrême) ; sans température, l'ordre est calculé à ×1 avec un avertissement.
- **Signaux** : pas d'« Accumuler » sans 200 jours d'historique, confiance affichée partout, volume mesuré sur la dernière bougie close, stablecoins exclus, plan d'entrée seulement si le signal trader est haussier. Seuils Fear & Greed, zones de température et anti-FOMO unifiés (`src/lib/thresholds.ts`).
- **Règles de STRATEGIE.md signalées** : thèse cassée = sortie, altcoin sous Bitcoin depuis environ 6 mois, achat hors DCA sans réserve ni peur.
- **Garde-fous** : le scan de sécurité dit « Données insuffisantes » (jamais vert) quand il n'a presque rien reçu, un avertissement retire le « Plutôt sain », une liquidité verrouillée sous 30 % est un danger. Enveloppe DeFi : une donnée manquante bloque l'achat, plancher de liquidité de 25 000 $, « Ajouter » marque l'achat « hors règles ».
- **Réponses de l'IA** : plus aucune image ; le vrai domaine de chaque lien est affiché, avec confirmation avant d'ouvrir un site inconnu.
- **Import Crypto.com** : tes saisies manuelles déjà présentes dans le fichier sont proposées au remplacement (plus de doublons avec « J'ai passé ces ordres »), et les ventes sans stock déclenchent une saisie du solde d'ouverture.
- **Chiffres** : calcul du portefeuille extrait et testé ; plus de double comptage pendant la lecture d'un Ledger, wallet à relier détecté ; prix moyen calculé sur la part qui a un historique ; poids par crypto ; « prix indisponible » au lieu de 0 € ; soldes de tokens illisibles signalés (ce n'est pas un solde nul) ; comparaison avec Bitcoin qui compte dépôts et retraits ; taux EUR/USD du jour de l'opération pour une saisie passée ; DCA toutes les deux semaines insensible au changement d'heure ; annuler une échéance du panier ou du DCA retire aussi ses transactions.

### v1.6.1 — Une application qui tient la distance
- **Hors ligne ou CoinGecko saturé** : les dernières données de marché (prix, cycle, Fear & Greed, taux de change) sont gardées d'un lancement à l'autre (IndexedDB) et affichées avec un bandeau « Données d'aujourd'hui à 18:31 » plutôt qu'un écran vide à 0 €. Une seule couche de nouvelles tentatives (délais bornés, une erreur 429 ne bloque plus les autres requêtes pendant une minute).
- **Erreurs visibles** : un scan dont toutes les analyses échouent affiche l'erreur et « Réessayer » (au lieu de « Ajoute des cryptos à ta watchlist »), « données partielles » quand une partie échoue, plus de « Chargement… » sans fin au Copilote IA et sur la fiche crypto, la comparaison avec Bitcoin dit pourquoi elle manque. « Actualiser » recharge les données sans relancer l'application.
- **Application ouverte plusieurs jours** : l'échéance du panier, du DCA et le bilan suivent le calendrier (changement de jour à minuit), les alertes intelligentes sont réévaluées toutes les 30 minutes (bilan du dimanche 18 h), le cycle et le Fear & Greed se rafraîchissent toutes les heures. L'échéance du jour n'est plus comptée « manquée » dès le matin.
- **Démarrage plus léger** : le brief automatique n'est préparé que s'il est activé et qu'une clé d'IA est configurée.
- **Alertes de prix** : sur ordinateur, les alertes sur une petite crypto (hors top 250) sont vérifiées. Sur Android, le script d'arrière-plan lit les erreurs de CoinGecko, utilise ta clé « Demo », ne « consomme » une alerte qu'une fois sa notification programmée, réessaie son envoi au lancement, et Réglages affiche « dernier contrôle réussi il y a … ». Désactiver les notifications arrête vraiment la surveillance et annule les rappels programmés.
- Android : l'état du script d'arrière-plan n'est plus renvoyé à chaque redessin de l'écran (batterie).

## Idées pour la suite (priorisées)

### Priorité haute
1. **Synchronisation automatique PC ↔ téléphone** chiffrée de bout en bout, à la place de l'export/import manuel.
2. **Import CSV des autres plateformes** (Binance, Coinbase, Kraken, Bitpanda) sur le modèle de l'import Crypto.com.
3. **Alertes Android plus complètes** (changement de zone du marché, euphorie) : elles demandent de porter le calcul de la température dans le script d'arrière-plan.
4. **Calendrier des déblocages de tokens** (Tokenomist) sur les positions et la watchlist, avec alerte J-7 : aucune source gratuite fiable aujourd'hui.

### Priorité moyenne
5. **Suivi des « smart money »** : wallets publics de fonds et de traders réputés, avec alerte quand ils achètent un token.
6. **Backtest des signaux** Boussole sur chaque crypto (performance de la stratégie vs achat-conservation).
7. **Délai de réflexion de 24 h** obligatoire avant un achat hors panier sur une crypto à +50 % en 7 jours (le panier applique déjà la règle).
8. **Révocation des approbations** : détection des autorisations à risque sur les wallets EVM suivis.

### Pour plus tard
9. Lecture des positions DeFi (prêts, pools de liquidité, staking) sur les wallets suivis.
10. Widget Android (température du marché et valeur du portefeuille sur l'écran d'accueil).
11. Rapport mensuel PDF (performance, respect des règles).
12. Version iOS (Capacitor la permet, mais il faut un Mac pour compiler).

## Limites connues
- Les API gratuites (surtout CoinGecko sans clé) limitent le nombre de requêtes : ajoute une clé « Demo » gratuite.
- Alertes application fermée : sous Windows, elles exigent que Boussole reste dans la zone de notification (option activée par défaut). Sous Android, le script d'arrière-plan couvre les alertes de prix et les paliers de vente (vérification toutes les 30 minutes environ, au bon vouloir du système et des économiseurs de batterie) ; les autres alertes (marché, euphorie) n'arrivent que lorsque l'application est ouverte.
- Le CSV Crypto.com est lu d'après le format connu de l'application : un export réel peut contenir des natures d'opération inédites, que Boussole te demande alors de classer.
- Le suivi des wallets EVM lit le solde natif et une liste de tokens courants, plus tes tokens personnalisés ; ce n'est pas un indexeur complet.
- Les signaux techniques sont des probabilités, pas des prédictions. L'IA peut se tromper ; vérifie les sources citées.
