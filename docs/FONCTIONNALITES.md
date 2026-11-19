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

### v1.7.0 — Plus simple, surtout sur téléphone
- **Menu réduit** : DCA remplace Pépites dans la barre du bas du téléphone ; Pépites et Trading passent dans Réglages, rubrique « Outils avancés » (tous les liens internes continuent de fonctionner).
- **Doublons viés** : le scanner de setups ne vit plus que dans Signaux ; l'onglet Comité du Copilote disparaît (le comité se lance depuis la fiche d'une crypto, ses rapports restent dans l'Historique).
- **DCA** : le panier est le parcours principal ; les plans à une seule crypto sont rangés en « Avancé » (plus un plan Bitcoin + un plan Ethereum en double du cœur).
- **Téléphone** : positions et transactions du Wallet s'affichent en cartes, plus en tableaux de 9 colonnes (tableaux conservés sur ordinateur).
- **Cohérence** : tous les montants de l'interface passent par `lib/format.ts` ; « Prix payé » du DCA affiche son unité ; la promesse du simulateur dit depuis quand chaque historique remonte.
- **Transparence IA** : écran « Voir ce qui part vers l'IA » dans Réglages (dossier exact envoyé au fournisseur : profil, positions, ordre du jour, marché) et option « Anonymiser » (pourcentages à la place des montants, pas de prénom). Les mentions « tes données restent sur ton appareil » sont corrigées dans l'application et dans le README.

### v1.8.0 — Synchronisation chiffrée PC ↔ téléphone
- **Modèle de données v2** : chaque élément (transactions, comptes, plans, thèses, alertes, paris…) porte sa date de dernière modification ; les rubriques sans identifiant (profil, watchlist, panier, enveloppe) sont datées dans `syncStamp` ; chaque appareil a son identifiant. Migration v1 → v2 automatique (registres amorcés à vide, sauvegarde de précaution avant).
- **Fusion pure et testée** : la version la plus récente de chaque élément l'emporte ; les suppressions se propagent (une modification postérieure à la suppression ressuscite l'élément) ; des horloges décalées ne perdent rien ; jamais synchronisés : clés API, jeton, phrase de passe, réglages propres à un appareil, rapports IA et conversations.
- **Chiffrement de bout en bout** : AES-GCM 256 bits, clé dérivée de la phrase de passe par PBKDF2-SHA256 (600 000 itérations). GitHub ne reçoit qu'un fichier illisible ; une phrase fautive est refusée explicitement.
- **Transport** : dépôt GitHub **privé** (ex : `boussole-sync`) + jeton fine-grained limité à ce seul dépôt (« Contents : Read and write ») + un seul fichier. L'écriture vérifie l'empreinte du fichier lu : une modification faite depuis l'autre appareil n'est jamais écrasée.
- **Rythme** : au lancement, après tes modifications (regroupées), toutes les 15 minutes ; état visible dans Réglages (« synchronisé il y a 2 min »). Un appareil vierge n'envoie rien.
- **Import manuel** : « Fusionner » devient le choix par défaut (les deux états combinés, sans rien effacer) ; « Remplacer tout » reste possible, avec copie de sécurité automatique.

### v1.8.1 — Clés protégées, application fiabilisée
- **Clés chiffrées par le système (Windows)** : les clés API (IA, CoinGecko), le jeton de synchronisation et la phrase de passe ne sont plus jamais écrits en clair dans le stockage de l'application — Windows les chiffre pour l'utilisateur en cours (safeStorage/DPAPI) et elles sont rangées à part. Un secret indéchiffrable (autre session Windows, machine changée) est simplement retapé. Android : à ce jour, la clé reste dans le stockage de l'application (choix d'un plugin Keystore Capacitor à faire).
- **Installeur allégé** : plus un seul fichier `node_modules` dans l'application empaquetée (l'interface est déjà entièrement compilée par Vite) ; l'icône de la zone de notification est désormais embarquée.
- **Electron durci** : fuses activés (pas de `--node-options`, inspections désactivées, chargement uniquement depuis l'archive asar), `ELECTRON_START_URL` ignoré dans l'application installée, navigation restreinte aux fichiers de l'application, filet CORS limité à la liste des sources de données de Boussole.
- **Android** : suppression des permissions de localisation qu'ajoute le plugin d'arrière-plan (Boussole ne localise jamais).
- **Transparence** : l'écran Wallet précise que le suivi d'une xpub Bitcoin interroge mempool.space adresse par adresse, ce qui relie tes adresses à ton adresse IP.
- **Qualité** : code mort supprimé (`useStablecoins`, `Grid`, `deriveAddresses`), les quatre `eslint-disable` obsolètes sont retirés, et les utilitaires critiques sans tests en ont (formatage, `extractJson`).

### v1.8.2 — La synchronisation n'écrit plus quand rien n'a changé
- **Correctif de tempête d'écritures** : l'application comparait son faisceau local au fichier distant *avec* les champs de plomberie (appareil écrivain, date) que le distant porte en plus — elle voyait donc « une différence » à chaque lecture et réécrivait le dépôt GitHub en continu (une écriture toutes les ~5 secondes tant qu'elle était ouverte). Conséquence en cascade : l'autre appareil, heurtant l'empreinte à chaque tentative, finissait par renoncer (« l'autre appareil a synchronisé trois fois de suite ») et ne synchronisait jamais.
- Désormais, seule le **contenu synchronisé** décide d'une réécriture (`sameSyncBundle`), et un changement de l'état ne déclenche la synchronisation groupée que si une **rubrique synchronisée** a réellement changé (un cycle d'horloge ou un rafraîchissement de marché ne compte pas).

### Lot 9 (v1.8.2) — Runner serveur : surveillance 24/7 + alertes Telegram (idées 6-8 du plan des 50)

- **Un service headless sur ton VPS** (`runner/` du dépôt, un seul fichier Node autonome, aucune dépendance à installer, aucun port ouvert) : il lit le même fichier de synchronisation chiffré que le PC et le téléphone, et veille application fermée.
- **Alertes de prix sur Telegram** : contrôle toutes les 5 minutes réglables ; une alerte envoyée est consommée dans le fichier de synchronisation (l'application la voit déclenchée, elle n'est jamais re-notifiée ni coté PC ni sur le téléphone) ; l'empreinte du fichier (anti-écrasement) est respectée, un conflit passe au cycle suivant.
- **Paliers de vente sur Telegram** : recalculés depuis le journal, les paliers atteints et pas vendus sont rappelés une fois par semaine. Limitation documentée : les wallets blockchain ne sont pas relus par le runner, et BTC/ETH (le cœur) n'ont pas de paliers.
- **Brief quotidien sur Telegram** à l'heure choisie (8 h par défaut) : Fear & Greed et Bitcoin, valeur du portefeuille au journal, échéances DCA/panier du jour ou à venir, paliers atteints non vendus, alertes armées, fraîcheur des données de synchronisation. C'est un brief de données ; le brief IA reste dans l'application.
- **Fiabilité du runner, testée de bout en bout** (faux GitHub, faux Telegram, prix simulés) : un échec d'envoi ne consomme jamais rien, un échec réseau retente au cycle suivant, le brief ne part qu'une fois par jour et retente tant qu'il n'est pas parti, `--check` déroule toute la chaîne à blanc, `--discover` trouve le chat id.
- **Secrets** : jeton GitHub fine-grained (ce seul dépôt, « Contents : Read and write »), phrase de passe de synchronisation et jeton du bot — saisis sur le serveur (fichier chmod 600 ou variables d'environnement du service systemd), jamais dans le chat, jamais dans les journaux.
- Documentation d'installation pour un VPS Ubuntu : `runner/README.md`, service systemd `runner/boussole-runner.service`.

### v1.9.0 — Alertes au cordeau (lot 10)

- **Devise de l'utilisateur partout** : alertes de prix et paliers notifiés en euros (ou selon ton réglage) avec le taux du jour — sur PC, sur Telegram et sur Android — plus en dollars bruts.
- **Un palier atteint ne sonne qu'une fois** : fini la re-notification hebdomadaire ; le palier reste rappelé chaque jour dans le brief Telegram tant que la vente n'est pas enregistrée (app, runner VPS et script Android alignés).
- **Identifiants de notification Android sans collision** : plage dédiée élargie (les notifications ne s'écrasent plus entre elles).
- **Changement de zone de marché calculé sur le VPS** : le runner calcule la température (mêmes indicateurs que l'application) et prévient sur Telegram quand le marché change de zone (accumulation, chaleur, euphorie…), application fermée. Au premier passage, la zone est seulement mémorisée ; un allers-retour rapide ne re-sonne pas avant une semaine.
- **Thèse libre** : la contrainte « 5 phrases » disparaît de l'application (rédaction libre, une phrase ou une page), de l'IA et des règles du profil.
- Vérifié au passage : la lecture d'une xpub couvre bien 20 adresses de suite sans historique (gap limit BIP44).

### v1.10.0 — Veille presse et briefs aux moments clés (lot 11)

- **Veille presse par crypto** : pour chaque crypto suivie (positions du journal + alertes armées, hors BTC/ETH et stablecoins), le runner lit l'actualité (Google News, flux rafraîchi toutes les 45 minutes). Une actu importante arrive sur Telegram — résumée en 3 lignes par Mistral si une clé API est configurée, sinon filtrée par heuristique de mots-clés. Au plus 3 alertes par cycle, une seule fois par actu ; un échec de l'IA ne consomme rien.
- **Trois briefs de données par jour** : le matin (complet : marché et zone, échéances, portefeuille, paliers, alertes armées, actus, fraîcheur de la sync), puis à l'ouverture des marchés américains (9 h 30, New York) et à leur clôture (16 h) sous forme courte avec les actus du moment. Heures exactes été comme hiver ; chaque créneau se désactive dans la configuration (briefUsOpen, briefUsClose).
- **Configuration runner enrichie** : newsEnabled, mistralApiKey (ou variable d'environnement MISTRAL_API_KEY), mistralModel. Sans clé, tout marche quand même, en heuristique.
### v1.11.0 — DCA aiguisé et calendrier macro (lot 12)

- **Température du marché plus juste** : le MVRV Bitcoin (source gratuite, ~7 jours de retard, sous 1 gelé / au-delà de 3 en surchauffe) et la part des stablecoins dans la capitalisation totale (la poudre sèche installée) pèsent désormais dans la stratégie DCA « acheter plus quand c'est froid, moins quand c'est chaud ». Le panier du jour suit, et l'explique.
- **Position dans le cycle de halving** : distance au prochain halving estimé ; la température du marché en tient compte.
- **Carte « À l'horizon » sur le Cockpit** : les prochains rendez-vous — FOMC (dates officielles 2026), CPI américain (dates 2026 mesurées, signalées comme telles), échéances trimestrielles des dérivés Bitcoin (dernier vendredi de mars, juin, septembre, décembre), halving. Chaque événement dit quoi faire (« jour d'échéance : volatilité possible, n'achète pas dans la précipitation », etc.).
- **Anticipation J-1** : la veille d'un événement important, notification dans l'application (si activées) et alerte Telegram depuis le serveur, avec le conseil.
- **Brief enrichi (VPS)** : ligne « À l'horizon » + conseil si l'échéance est imminente, compte à rebours du prochain halving, MVRV et part stablecoins dans la ligne Marché.
- Correctif testé par la même occasion : la formule des derniers vendredis du trimestre était fausse (été comme hiver, année bissextile comprise).

### v1.12.0 — Portefeuille papier, le profil « expérimentations » (lot 13)

- **Page « Papier »** : 1000 USDC fictifs au départ, des ordres fictifs aux prix réels du marché avec 0,1 % de frais simulés. Tester une stratégie ou un timing sans risquer un euro.
- **Bilan en temps réel** : cash restant, positions valorisées aux prix du moment, P&L. Ordres impossibles refusés avec la raison (pas assez de cash papier, ou tu ne détiens pas assez de la crypto vendue). Une ligne sans prix connu n'affiche jamais 0.
- **Comparaison honnête avec Bitcoin** : le même montant investi en BTC aux mêmes dates aurait donné tel résultat — le vrai test d'une stratégie, pas juste « j'ai gagné en bull market ».
- **Profil séparé du vrai journal** : le Wallet n'est jamais touché. Le papier se synchronise entre appareils (clés « paperTrades » et « paper ») et est inclus dans les sauvegardes.
- **Le serveur suit aussi** : le brief Telegram ajoute la ligne « Papier (expérimentations) » avec sa valorisation ; les coins papier comptent dans l'évaluation du cycle.

### v1.13.0 — Smart money (1/2) : suivi de wallets et sécurité enrichie (lot 14)

- **Page « Smart money »** : suis des wallets publics connus pour leurs résultats (fonds, initié, KOL) sur Solana, Ethereum et Base — adresse publique seulement, aucune clé API nécessaire. La liste se synchronise entre appareils (clé « smartWallets ») et fait partie des sauvegardes.
- **Lecture de leurs mouvements** : achats/ventes nets (RPC Solana public, Blockscout ETH/Base) — déplacements entre leurs propres comptes ignorés, allers-retours annulés, jamais de mouvement inventé sur une donnée manquante.
- **Alertes Telegram via le serveur** : un wallet suivi qui ACHÈTE un token de ta liste (tokens DEX suivis, positions du journal, alertes armées) prévient ; sa VENTE est mise en avant — le signal « relis ta thèse de sortie ». Curseur de lecture par wallet, dédoublonnage par mouvement, un échec Telegram ne consomme rien, au plus 3 alertes par cycle.
- **Brief du matin** : ligne « Wallets suivis » avec leurs mouvements des 24 dernières heures.
- **Scan de sécurité enrichi** : antécédent de honeypot du créateur, part de l'offre détenue par le créateur et le propriétaire du contrat.

### v1.14.0 — Pépites émergentes (2/2) : jeunes paires Solana/Base en traction (lot 15)

- **Onglet « Émergentes » du détecteur de pépites** : nouvelles paires Solana/Base de quelques heures à 7 jours, en traction réelle — liquidité suffisante pour sortir (≥ 25 k $), volume réel (≥ 75 k $/24 h), achats dominants (≥ 15 % d'écart), journée positive, assez de transactions pour juger. Score de traction 0-100, critères visibles.
- **Lien smart money** : le badge « wallets suivis en position » montre quels wallets suivis détiennent déjà la candidate — une piste, jamais un feu vert.
- **Fiche habituelle au clic** : scan de sécurité (GoPlus/RugCheck enrichi de la 1.13.0), suivi du token, avis de l'IA.
- **Digest du matin (Telegram)** : le serveur scanne les nouveaux pools, retient les candidates en traction, passe chacune au scan, note les wallets suivis entrés, envoie au plus 3 lignes (« des pistes à vérifier, jamais des conseils d'achat ») ; désactivable (emergingEnabled).

### v1.15.0 — Discipline & coaching + découverte automatique (lot 16)

- **Découverte automatique du panier DCA** : le mode « Boussole choisit » prend ses candidates dans le scan des pépites (petites capis, classées par score), et toutes les règles du panier gardent la barrière : plafond par pépite, FOMO 7 j écarté, une ligne finie avant d'en ouvrir une autre, disponibilité sur la plateforme d'achat. L'utilisateur ne règle plus que la part « découverte » — plus de liste à remplir.
- **Journal à chaud** : bouton « Noter » sur une alerte déclenchée (attendu/acheté/vendu/partiel + pourquoi), pris sur le moment, synchronisé.
- **Discipline du mois** (Cockpit) : score honnête 0-100 — régularité des échéances (50 pts), achats maîtrisés hors impulsions (30 pts, une impulsion −6), journal à chaud tenu (20 pts).
- **Mode vacances** : veille critique uniquement (alertes de prix, paliers), sur l'app et le serveur, jusqu'à la date choisie ; rappels, actus, smart money et digest émergentes en pause.
- **Historique daté des réglages** : chaque modification de profil ou de règle tracée (avant → après, quand).

### v1.16.0 — Android : widget + coffre matériel (lot 17)

- **Widget d'écran d'accueil** : température du marché + zone, valeur du portefeuille, rafraîchis à chaque relevé (30 min au pire par le système). Plugins natifs Capacitor (BoussoleWidget, AppWidgetProvider, préférences privées).
- **Secrets sous keystore Android** : clés API et phrases de passe chiffrées AES-256-GCM par une clé qui ne quitte pas le matériel (plugin BoussoleKeychain), comme le fait Windows avec DPAPI ; l'existant est rescellé au premier démarrage.

### v1.17.0 — Chantier qualité (lot 18)

- **Découpage du grand fichier d'interface** : les 529 lignes de ui.tsx deviennent sept familles dans src/components/uikit/ (structure, boutons, badges, jauges, formulaires, retours, tableaux), ré-exportées par un barrel — aucun écran changé, aucun import cassé.
- **Vérifié au passage** : pas de SDK IA embarqué (appels directs en fetch, pages déjà à la demande), garde-fous hors navigateur du pont des secrets.

### v1.17.1 — Nouveau logo « Nuit & or »

- **Logo** : un anneau de boussole ouvert, une courbe qui monte et une pointe d'aiguille dorée qui sort de l'anneau, sur fond bleu nuit. Affiché dans l'en-tête et l'écran d'accueil de l'application.
- **Toutes les plateformes** : Windows (.ico de 16 à 256 px avec une version simplifiée pour les petites tailles, icône près de l'horloge), Android (icône adaptative vectorielle, version monochrome pour les icônes à thème d'Android 13+, écrans de démarrage, icône des notifications), macOS (.icns) et iOS (clair, sombre, teinté) prêts pour plus tard.
- **Un seul script** (scripts/make-icons.cjs) régénère tout à partir de la définition du logo ; charte et fichiers dans branding/.

### v1.18.0 — Le gardien (lot 19)

- **Silence nocturne et messages regroupés (VPS)** : entre `quietStart` et `quietEnd` (23 h → 8 h par défaut, heures du serveur), aucune alerte Telegram ne part. Elles attendent en file (regroupées par clé, une alerte persistante n’occupe qu’une seule ligne) et arrivent en UN message le matin, avec l’heure réelle de chaque événement. Un échec d’envoi du digest ne perd rien : il repart au cycle suivant. La file survit à un redémarrage du service. Deux heures identiques dans `runner.json` coupent le silence.
- **Délai de réflexion de 24 h (règle anti-FOMO)** : un achat du jour, hors panier/dépôt, sur une crypto qui a pris +50 % ou plus en 7 jours ne s’enregistre plus dans la minute — le formulaire propose « Poser le délai de 24 h​». L’attente est visible dans Guide → profil (carte « Attentes de 24 h », avec la variation constatée et l’heure de déblocage), synchronisée entre appareils. Passées les 24 h, l’achat redevient possible ; sans donnée de marché, la règle ne bloque pas ce qu’elle ne peut pas constater.
- **Œil du gardien (supervision du VPS)** : le runner pousse toutes les 10 min un petit fichier non chiffré `heartbeat.json` (« j’existe ») dans le dépôt de sync. Une GitHub Action du dépôt de code le relit toutes les 20 min : 45 min de silence → message Telegram « le serveur veilleur n’a plus donné signe de vie » (au plus une fois toutes les 2 h), puis « il est de retour » à la reprise. Le VPS peut tomber : c’est GitHub qui veille sur lui.
- **Dans l’application (Réglages → Synchronisation)** : une ligne « Serveur veilleur » affiche le dernier pointage du VPS et passe en orange au-delà de 45 min.

### v1.19.0 — Rapidité (lot 20)

- **Thèses fantômes** : « j’aurais acheté X ici » se note en deux champs (crypto, montant d’envie) sur la page Papier. Valorisation aux prix réels à chaque relevé, bilan en pourcentage, clôture en un bouton — sans toucher au cash papier ni aux positions. Le brief du matin en récite les verdicts. FOMO tué par les chiffres.
- **Verrou biométrique (Android)** : Réglages → « Verrou à l’ouverture » — empreinte, visage ou code de l’appareil exigé à chaque ouverture de Boussole. Réglage propre à chaque téléphone, jamais synchronisé. Masque complet de l’appli tant que l’authentification n’est pas réussie.
- **Détection de mise à jour (PC et Android)** : chaque publication écrit latestVersion.json dans le dépôt de synchronisation ; l’application ouverte affiche un bandeau « Boussole X.Y.Z est disponible » avec un bouton Télécharger qui ouvre la page des releases (À partir de la 1.19.0 ; un dépôt privé ne permet pas le téléchargement silencieux sans embarquer un jeton — le bouton reste le chemin le plus court).

### v1.20.0 — Mise à jour depuis l’application (lot 21)

- **Répertoire de code public** : audit complet de l’historique avant ouverture (aucun jeton, mot de passe, IP ni donnée personnelle n’y ont jamais été commis), nettoyage du chat id Telegram d’un vieux fichier de test et réécriture de la totalité de l’historique. Le dépôt de synchronisation et ses données chiffrées restent privés.
- **Installer depuis l’application (Windows)** : le bandeau « Boussole X.Y.Z est disponible » télécharge l’installeur dans l’application (pourcentage en direct), le lance, et l’assistant d’installation fait le reste. Seules les URL des releases du dépôt Boussole sont acceptées ; un installeur incomplet n’est jamais exécuté.
- **Installer depuis l’application (Android)** : le bandeau télécharge l’APK et ouvre l’installeur système. La première fois, Android demandera d’autoriser Boussole à installer des mises à jour ; ensuite, une simple confirmation à chaque version. La signature étant identique, l’installation se fait par-dessus l’existante et les données restent.
- **Dans le navigateur** (version de développement) : le bouton ouvre la page des releases, la détection reste identique.

### v1.20.1 — Correctif du verrou à l’ouverture

- **Le verrou bloquait l’application alors qu’il était désactivé** (condition inversée), y compris sur Windows, où il n’existe pas : il ne s’affiche plus que si l’option est activée, et seulement sur Android.
- **Écran de verrouillage transparent** (couleur de fond inexistante dans le thème) : il masque de nouveau tout le contenu.
- **« Verrou indisponible » à chaque essai** : le plugin ouvrait la fenêtre d’empreinte hors du fil de l’interface, ce qu’Android refuse ; il bascule maintenant sur le fil principal et renvoie la vraie raison d’un échec.
- **Jamais enfermé** : si le téléphone n’a plus aucun code ni empreinte, Boussole s’ouvre au lieu de rester bloquée.

### v1.21.0 — DCA automatique, Trading et Pépites de retour, appli plus publique

- **DCA automatique** : un montant, tes jours d’achat, une part base / découverte, et c’est tout. À chaque échéance, Boussole dit exactement quoi acheter et combien : jusqu’à 3 cryptos parmi les 20 premières hors stablecoins (classées par signal investisseur ; « Alléger » écartée) et jusqu’à 3 découvertes (pépites, milieu de classement ou les deux). Garde-fous conservés : modulation par la température du marché et réserve d’USDC, découverte réduite puis coupée en marché chaud, anti-FOMO, disponibilité Crypto.com, plafond par pépite, pas de nouvelle ligne au-delà de ton maximum. Le mode personnalisé (cœur + liste) reste disponible.
- **Supprimer un DCA** : « Modifier ou supprimer » → « Supprimer ce DCA ». Ses échéances partent avec lui ; ses achats restent au journal (ils ont eu lieu), sauf si tu demandes leur retrait. Toutes les échéances sont visibles et supprimables une à une.
- **Wallets recommandés** (Smart money) : dix adresses publiques vérifiées (étiquette Etherscan ou nom ENS) — Fondation Ethereum, Vitalik Buterin, Uniswap, Wintermute, Jump, DWF Labs, a16z, Justin Sun, Machi — classées selon ce que tu détiens, en un clic. Aucune adresse Solana ou Base n’a pu être attribuée de façon fiable : la liste n’en devine pas.
- **Pépites et Trading reviennent dans le menu.** Trading : le calculateur se remplit depuis une crypto (cours, stop sous le support ou à 2 × la volatilité, objectif à 2 R) et ouvre le trade dans le journal ; les positions ouvertes sont suivies au cours du moment (résultat latent, R, stop franchi, objectif atteint, clôture au cours) ; nouvelles statistiques : pire série de pertes et baisse maximale.
- **Correctif** : la page Papier plantait (« Maximum update depth exceeded ») à cause d’un sélecteur qui recréait une liste à chaque lecture.
- **Plus orientée public** : plus de thèses (écriture, vérification par l’IA, règle « thèse cassée »), plus de checklist avant achat, plus de pont Grok ; « Thèses fantômes » devient « Achats fantômes » ; le Copilote ne cite plus de modèle ; plus de mention de fichiers ou de comptes personnels (dépôt de synchronisation à renseigner soi-même).

### v1.22.0 — Mistral AI, DCA × IA, transactions modifiables partout

- **Mistral AI comme fournisseur d’IA** (Réglages → Intelligence artificielle) : une clé de console.mistral.ai, et tous les modèles de conversation de ton compte sont lus en direct (Mistral Large, Medium, Small, Magistral… et les modèles d’autres éditeurs que Mistral propose), sans liste figée. Même client que Nous Portal (API compatible OpenAI, appels directs depuis l’application, CORS vérifié). La clé est chiffrée par le système comme les autres et n’est jamais exportée ni synchronisée. Mistral ne renvoyant pas de coût, les rapports affichent les jetons consommés.
- **DCA × IA** : en mode automatique, « Optimiser avec l’IA » envoie l’ordre calculé par tes règles ET les autres candidates qui ont passé ces mêmes règles ; l’IA garde chaque ligne ou la remplace par une candidate du même côté, avec l’actualité et le contexte du projet. Elle ne change jamais un montant ; toute proposition hors liste, d’un autre côté, en doublon ou peu sûre (confiance < 3/5) est écartée et affichée. Option « Optimiser l’ordre avec l’IA à chaque échéance » : l’analyse part seule le jour de l’échéance, une fois par ordre (mise en cache). « J’ai passé l’ordre optimisé » enregistre la version de l’IA.
- **Transactions modifiables partout** : les échéances du panier (montant dépensé, quantité reçue par ligne) et des plans avancés (montant, prix, quantité) se corrigent ; leurs transactions du journal et la réserve d’USDC suivent. Sur téléphone, toute la carte d’une transaction s’ouvre pour la modifier. Une transaction dont on change la date prend le taux EUR/USD de sa nouvelle date.

### v1.22.1 — L’échéance validée ne se recalcule plus

- **Après « J’ai passé ces ordres », le panier reproposait d’autres cryptos** : il recalculait l’ordre avec le portefeuille d’après l’achat (les lignes achetées comptent alors comme détenues, la réserve a bougé) et l’affichait comme un nouvel ordre. La carte montre maintenant l’échéance validée telle qu’enregistrée (cryptos, montants, quantités) ; l’aperçu de la prochaine échéance est replié et présenté comme indicatif, sans bouton ni optimisation IA. Le brief du jour reçoit lui aussi l’échéance passée au lieu de l’ordre recalculé, et ne propose plus d’autre achat DCA avant la prochaine.

### v1.28.0 — Le Labo : banc d'essai, papier complet, autopilotes, signaux sur preuves

Une seule version regroupe les cinq lots de la fiche `docs/superpowers/specs/2026-11-15-labo-banc-d-essai-autopilote-design.md`.

**Banc d'essai (lot 1)**
- **Chaque signal affiche sa fiabilité mesurée** : sous le libellé (fiche d'une crypto) et au survol (liste Signaux), « Depuis 2019 : vu 383 fois. En hausse 90 jours après dans 60 % des cas (un jour quelconque : 44 %). Verdict : validé. » Les setups que l'historique ne soutient pas sont regroupés à part, sous « Peu fiables d'après l'historique ».
- **Page Labo** (remplace « Papier ») : onglets Papier, Achats fantômes et Banc d'essai — le tableau de tous les signaux mesurés, « Rejouer sur une crypto » sur son seul historique, et la méthode avec ses limites.
- **Outil `npm run bench`** : rejoue les signaux et les stratégies sur l'historique Binance depuis 2017 (une centaine de cryptos, paires retirées comprises), écrit des rapports datés dans `docs/bench/` et la table embarquée `src/data/reliability.json`. Réglage jusqu'à fin 2022, verdict sur 2023 et après.
- **Signaux figés une fois par jour** : calculés sur les bougies closes, comme ce que mesure le banc d'essai (le cours affiché reste celui du moment).
- **Correctif** : un ordre papier payait 10 % de frais au lieu de 0,1 % ; les anciens ordres sont corrigés automatiquement.

**Papier complet et autopilotes (lot 2)**
- **Plusieurs portefeuilles papier** : un « Papier manuel » repris de l'ancien papier, et autant d'autres que tu veux. Ordres au marché en montant ou en quantité, achats limites, stops et objectifs (liés, valables 90 jours) exécutés sur les bougies 1 heure, même application fermée grâce au serveur veilleur. Frais réalistes au choix (plateforme d'échange : 0,10 % + 0,05 % d'écart ; application grand public : 1,5 % d'écart ; personnalisés), courbe de valeur face à la même mise en Bitcoin, statistiques, et le résultat « avec les frais d'une application ».
- **Autopilotes** : un portefeuille papier qui suit seul une stratégie de Boussole — DCA Bitcoin simple (la référence), Investisseur (température), DCA Boussole (le panier automatique), Trader (setups validés, stop jugé à la clôture, objectif à 3 R, pause après −20 %). Décision sur les bougies closes de la veille, exécution chaque jour à 8 h (heure de Paris) au prix de cette heure-là : copiable par un humain réveillé. Les jours manqués sont rattrapés à l'identique ; PC, téléphone et serveur écrivent les mêmes journaux.
- **Verdict de confiance**, calculé sur le seul direct, frais compris : en observation (moins de 90 jours ou de 30 trades / 20 échéances), insuffisant, encourageant, fiable jusqu'ici, ou confiance retirée (baisse maximale dépassée, ou 10 points de retard sur la référence en 60 jours). Taille conseillée pour copier : 5 % puis 15 % du portefeuille réel. Seuils réglables (Labo → Classement → Règles de confiance).
- **Classement** des autopilotes (30, 90, 180 jours, depuis le direct, pire baisse, écart avec Bitcoin), carte « Autopilotes » sur le Cockpit, simulation « ce qu'elle aurait fait depuis un an » (pointillé) pour les stratégies rejouables. Un autopilote dont les règles changent est archivé et recréé : son verdict repart de zéro.
- **Serveur veilleur** : mêmes autopilotes calculés application fermée, ordres, stops et objectifs sur Telegram, une ligne par autopilote dans le brief du matin (`autopilotEnabled`, `autopilotTelegram`).
- **Mesuré sur 2019-2026** (`docs/bench/2026-11-15-strategies.md`) : la température seule fait jeu égal avec le DCA Bitcoin simple, avec une pire baisse plus faible (−65 % contre −77 %) ; le panier automatique (base seule) fait moins bien que Bitcoin ; Trader v2 gagne peu (+0,26 R par trade à l'ouverture suivante, +0,13 R avec les frais d'une application). À confirmer en direct : c'est le rôle des autopilotes.

**Signaux sur preuves (lot 3)**
- **Seize critères candidats mesurés** selon un protocole écrit (`docs/bench/protocole.md`) : paramètres choisis sur 2019-2022, jugés sur 2023 et après, chaque regard inscrit au journal (`docs/bench/journal.md`), trois essais au plus, et un effet de même sens sur 60 % des cryptos au moins. Décisions : `docs/bench/2026-11-15-candidats.md`.
- **Méthode corrigée en cours de route** : comparer des épisodes à des jours faisait paraître presque tout signal meilleur qu'un jour quelconque. Les taux se calculent désormais sur tous les jours, la marge d'erreur sur les épisodes, et un test garantit qu'un état et son complément ne peuvent plus battre tous deux la référence.
- **Signal investisseur v2**, en table de décision : « Accumuler » (température sous 40, ou tendance, valorisation et cycle alignés : 49 % de hausses à 90 jours contre 41 % au contrôle), « Alléger » (excès — RSI hebdomadaire au-dessus de 80 ou prix à plus de 2 fois sa moyenne 200 jours — ou altcoin en marché chaud : 21 % contre 41 %), « Prendre des profits » (euphorie), « Conserver ». « Accumuler fort » a manqué sa condition de sortie (+7,4 points au lieu de +8) : il rejoint « Accumuler ».
- **Signal trader v2** : seule la cassure des plus hauts 20 jours avec du volume est validée (« Achat », et « Achat fort » avec un volume double) ; aucun signal de vente n'est validé, le trader reste « Neutre » le reste du temps. Plan : stop jugé à la clôture, objectif à 3 R (+0,32 R par trade au contrôle, nul sur 2025-2026).
- **Setups** : seuls la cassure avec volume, la relance MACD et la survente avec rebond restent ; repli en tendance haussière et surachat (inversés), croisements, cassure baissière et compression (sans effet) disparaissent.
- **Chaque signal explique pourquoi** (la condition mesurée) sous son libellé, avec sa fiabilité ; l'IA reçoit la fiabilité de chaque signal cité et a pour consigne de ne jamais le présenter comme plus fiable qu'elle ne le dit.
- **Conditions de sortie** documentées une par une (`docs/bench/2026-11-15-signaux-v1-v2.md`) : quatre atteintes, une partielle (la stratégie Trader v2 est meilleure par trade, moins rentable au total en exécution à la clôture). Les autopilotes créés avec les règles v1 sont archivés et recréés.

**Suivi et copie en réel (lot 4)**
- **Courbe du vrai portefeuille** (Wallet) : reconstituée d'après le journal (achats, ventes, transferts neutres, dépôts et retraits), puis fidèle aux relevés quotidiens enregistrés à chaque lancement. Face aux versements cumulés et à « tout en Bitcoin », sur 1 mois, 3 mois, 1 an ou tout ; performance pondérée par le temps, rendement annuel de ton argent, pire baisse, meilleur et pire mois.
- **Alertes de signal** : une fois par jour, le serveur veilleur prévient quand une crypto détenue, suivie ou du top 20 passe à « Alléger » ou « Prendre des profits », en sort, ou montre un setup validé — une alerte par épisode, trois au plus, rien en vacances, avec la fiabilité mesurée. L'application prend le relais en notification quand le serveur est muet depuis 45 minutes (`signalAlertsEnabled`).
- **Copier un autopilote en réel** : bouton « J'ai copié en réel » sur chaque ordre (confirmation tant que le verdict n'est pas « encourageant »), formulaire réel prérempli, puis rapport « Copie en réel : 12 ordres sur 15. Écart moyen à l'exécution : −0,8 %. Résultat réel +3,1 % ; papier, sur les mêmes ordres, +4,6 %. » et montant conseillé (part du portefeuille plafonnée par le risque au stop).
- **Wallets suivis notés** (Smart money) : chaque mouvement est rejugé à 7 et 30 jours (achat gagnant si le prix a monté, vente gagnante si elle a évité une baisse) : « 14 mouvements suivis, 9 gagnants à 30 jours », et « historique défavorable » sous 40 % de gagnants sur 10 mouvements.
- **Pépites suivies en avant** : chaque semaine, les 10 meilleures petites capis et les découvertes du panier sont notées avec leur prix ; la carte « Ce que valaient les scores » (Pépites) montre leur rendement à 30 et 90 jours face à Bitcoin, à partir de 8 semaines de recul.

**DCA et trading sur preuves, menu simplifié (lot 5)**
- **Règle de la base du panier mesurée** (`docs/bench/2026-11-15-dca-variantes.md`) : trois meilleurs scores, capitalisation, ancre Bitcoin et Ethereum, parts égales, Bitcoin seul, simulés sur l'historique. « Bitcoin seul » fait jeu égal avec le DCA Bitcoin simple (+286 % depuis 2023) quand les trois meilleurs scores ont fait +118 % : c'est la règle des nouveaux paniers. Un panier existant n'est jamais modifié d'office : une bannière montre la mesure et propose de changer en un clic. La règle se choisit dans l'éditeur, chiffres à l'appui.
- **Multiplicateurs de température inchangés** : une table plus pentue gagne 2,8 points par an mais creuse la pire baisse.
- **« Rejouer mon panier »** (DCA) : la base de ton panier depuis 2023, avec tes réglages et tes frais, face au DCA Bitcoin simple.
- **Découvertes « non mesuré »** tant que le suivi en avant des pépites ne bat pas Bitcoin à 90 jours.
- **Plans sur une seule crypto** : la section disparaît s'il n'y en a aucun ; les plans existants restent utilisables (« remplacés par le panier »).
- **Trading** : setups détectés triés par fiabilité mesurée, régime du moment en tête, non validés masqués par défaut ; calculateur avec le plan v2, chances et espérance selon les frais (avertissement chiffré si elles deviennent négatives) ; « Tester sur papier » depuis le calculateur ou la fiche d'une crypto ; journal comparé au banc d'essai ; le serveur prévient quand le stop ou l'objectif d'un trade ouvert du journal est touché.
- **Menu de 13 à 9 entrées** : Cockpit, Signaux, DCA, Wallet, Labo, Pépites (avec Smart money et Airdrops en onglets), Trading, Copilote IA, Plus (Rendement & DeFi, Guide & profil, Réglages). « Narratives du jour » et « Les plus recherchées » passent du Cockpit à Pépites → Narratives. Les anciennes adresses restent valides.
- **Données v5** : thèses, checklist et ancien réglage du papier sont retirés (copie de précaution avant migration) ; les paliers de vente des thèses deviennent des paliers personnalisés. Un appareil resté en 1.27 passe en lecture seule jusqu'à sa mise à jour.

### v1.37.0 — Labo réaliste : backtest de bot grid + frais VIP Binance dans le paper

- **Backtest de bot grid** (Labo → Banc d'essai) : grille [bas, haut] × N lignes testée sur l'historique réel BTC/ETH (bougies journalières Binance publiques) — trades, P&L, comparaison buy & hold, indicateur « sorti de la grille ».
- **Frais réalistes** : réglage « niveau VIP Binance » + « frais en BNB −25 % » (Réglages → Plateformes) ; le preset « plateforme d'échange » du paper trading (portefeuilles manuels ET autopilotes) applique désormais le taux taker de ton VIP.
- 766 tests, typecheck 0 erreur.

### v1.36.0 — Rendement : comparateur multi-sources, simulateur Dual Investment, perte impermanente, rapport enrichi

- **Comparateur de rendements** (DeFi → onglet « Comparateur & outils ») : Binance Simple Earn (API publique) + pools Aave/Lido/Spark/Morpho/Compound/Benqi + Jupiter/Orca/Raydium/Hyperliquid (DefiLlama), triés par APY avec **tier de risque** (audit, TVL, stablecoin, IL, exposition) et gain annuel estimé sur tes lignes détenues.
- **Simulateur Dual Investment** : montant, strike %, durée, APY, scénario de prix → intérêts, quantité reçue si converti, P&L réel du scénario.
- **Calculateur de perte impermanente** : ratio de prix → IL % et valeur LP vs HODL.
- **Rapport mensuel « tout ce qui rapporte »** : P&L des paris DeFi ouverts + rendement annuel estimé du staking/Earn, dans la carte et l'export Markdown.
- 758 tests, typecheck 0 erreur.

### v1.35.0 — Lots F & G complets + côté serveur (VPS)

- **Lot F — ouverture au public** : i18n (FR par défaut, **anglais automatique** hors France + sélecteur Langue dans Réglages ; shell, navigation, Cockpit et réglages traduits, le reste retombe sur le FR), **widget Windows** (petite fenêtre toujours-au-dessus : BTC, Fear & Greed, valeur du portefeuille, alertes armées, échéance du jour — bascule depuis Réglages ou le menu de l'icône de la zone de notification), **projet iOS Capacitor versionné** (`npm run build:ios`, build sur Mac — `docs/BUILD-IOS.md`), page GitHub Pages (v1.34.0).
- **Lot G — copilote** : **simulations « et si ? »** (nouvel onglet du portefeuille : rejoue tes achats/ventes du journal avec les prix d'aujourd'hui — ce qu'une vente t'a coûté vs garder, ce qu'un achat t'a rapporté), **brief VPS actionnable ligne par ligne** (section « À faire aujourd'hui » numérotée : panier, DCA, paliers atteints, événement macro imminent ; sinon « ne rien exécuter, aucune vente hors plan »).
- **VPS (config publique, zéro secret)** : **alerte Telegram J-1 puis J-0** sur chaque déblocage de token suivi (veille critique, envoyée même en mode vacances), **dashboard web en lecture seule** (`scripts/vps/` : nginx + HTTPS Let's Encrypt + basic auth, page statique + `status.json` assaini écrit par le runner à chaque cycle — test prouvant qu'aucun secret n'y figure).
- 746 tests, typecheck 0 erreur.

### v1.34.0 — Correctifs + lots F/G : mise à jour réparée, autopilote trader élargi, circuit breaker anti-panique, site public

- **Mise à jour depuis l'app réparée/durcie** : Android suit manuellement les redirections cross-host (github.com → release-assets.githubusercontent.com) que `HttpURLConnection` ne suivait pas ; Windows vérifie la taille exacte (content-length), l'en-tête PE « MZ », et renvoie l'erreur exacte (HTTP + hôte) dans la bannière. Testé : l'URL de release répond 200 après redirection et stream correctement.
- **Autopilote Trader élargi (v3)** : l'univers des autopilotes passe de top 20 à **top 100** (comme l'univers du banc d'essai), côté app ET côté serveur (les deux calculent les mêmes jours). Vérifié en rejouant 15 jours avec les vraies données : entrées sur cassure 20 j + volume validée (achat) et sorties au stop — là où top 20 ne donnait strictement rien. Les autopilotes v2 existants sont archivés automatiquement (empreinte changée).
- **Circuit breaker anti-panique (lot G)** : en Fear & Greed < 25, une vente hors plan de sortie est bloquée 24 h dans le formulaire (attente synchronisée, comme l'anti-FOMO des achats) ; bannière « mode krach » sur le Cockpit. Les paliers prévus au plan de sortie restent gérables normalement.
- **Lot F — site public** : GitHub Pages activé depuis `/docs` → [nikola17.github.io/boussole-crypto](https://nikola17.github.io/boussole-crypto/) (page d'accueil, fonctionnalités, avertissement, lien releases). iOS : projet versionné en v1.35.0 (build sur Mac). i18n anglais livré en v1.35.0.
- 730 tests, typecheck 0 erreur.

### v1.33.0 — Lot E « Sans friction » : webhook sortant + rapport mensuel exportable

- **Webhook HTTPS optionnel** (Réglages → Données & affichage) : à chaque alerte déclenchée par l'app (prix, signal v2, palier de vente, alerte intelligente), un POST JSON part vers ton URL (événement, titre, détail, données associées). Uniquement `https://`, délai borné à 8 s, aucune erreur ne bloque l'app, aucun secret n'est envoyé. Tes autres outils (scripts perso, domotique, etc.) peuvent s'y brancher.
- **Rapport mensuel** (Plus) : pour chaque mois ayant des relevés quotidiens complets — valeur début/fin, variation %, investi, cédé, frais payés, nombre de transactions et d'échéances DCA exécutées — avec export Markdown (`boussole-rapport-AAAA-MM.md`) pour archivage ou partage.
- 727 tests, typecheck 0 erreur.

### v1.32.0 — Lot B « Radar dérivés & réseau Bitcoin » (Cockpit)

- **Carte « Radar dérivés & réseau »** : open interest BTCUSDT (en BTC et ≈ Md $), dernier funding 8 h + annualisé (moyenne des 3 derniers taux), ratio long/short des comptes Binance (1 j), mempool (nb de tx, volume en Mo, frais fastest en sat/vB) — sources Binance fapi et mempool.space, toutes publiques, lectures dégradées en « — » si indisponible.
- **Interprétation heuristique affichée comme telle** : funding extrême (≥ ±0,01 %/8 h) → risque de liquidations en cascade ou squeeze ; ratio très long/short → levier concentré d’un côté ; mempool congestionné (≥ 50 sat/vB ou ≥ 100 Mo) → transferts plus chers et plus lents ; OI ≥ 60 Md $ → marché levier-heavy. Seuils indicatifs, pas des signaux (les signaux mesurés du Labo restent inchangés).
- Non retenue : les flux ETF (Farside) sont derrière Cloudflare et illisibles depuis l’app ; les unlocks Tokenomist/DefiLlama nécessitent une clé payante ou ont disparu — d’où le suivi manuel des déblocages (v1.31.0).
- 720 tests, typecheck 0 erreur.

### v1.31.0 — Lot C « Sécurité proactive » : approvals à révoquer + déblocages de tokens

- **Scanner d'approvals EVM sans clé API** (Wallet → « Autorisations de tes wallets ») : transactions sortantes lues sur Blockscout (v2), filtrées sur le sélecteur `approve` (0x095ea7b3) pour retrouver (token, spender), puis allowance courante lue en `eth_call` sur le RPC public. Sont signalées « À révoquer » : les autorisations actives, illimitées (≥ 2^255) ou > 1 M d'unités, vers un contrat **hors liste des routeurs connus** (Uniswap, 1inch, 0x, Permit2, Paraswap). Limite documentée : ~150 dernières transactions sortantes. Boussole ne signe jamais de révocation — lien vers revoke.cash, la signature vient de ton wallet.
- **Déblocages de tokens suivis manuellement** (Cockpit) : aucun agrégateur gratuit fiable (Tokenomist = clé payante, DefiLlama unlocks = endpoint retiré en 2026), donc saisie manuelle synchronisée entre appareils, avec badges J-7 / J-1 dans les 30 jours. L'alerte Telegram J-1 côté serveur reste une idée de suite.
- 714 tests, typecheck 0 erreur.

### v1.30.0 — Lot D « Fiscalité FR » : export 2086 et moins-values

- **Export CSV de chaque année fiscale** (bouton sur la carte « Mes années fiscales », Wallet) : cessions détaillées (date, actif, prix de cession, fraction imputée A×C/V, plus/moins-value, valeur du portefeuille) + ligne TOTAL, en CSV point-virgule prêt à être repris dans le formulaire 2086, avec BOM UTF-8 pour Excel.
- **Moins-values signalées** : une année en moins-value nette affiche le montant reportable sur les 10 années suivantes (à déclarer aussi).
- Rappel corrigé dans l'onglet Earn : depuis 2023, les échanges crypto→crypto ne sont pas imposables en France — seules les conversions en monnaie classique le sont (le calcul 150 VH bis du journal applique déjà cette règle via les indicateurs `toFiat`/`fromFiat`).
- Tests du calcul 150 VH bis (imputation A×C/V, exonération ≤ 305 €, neutralité crypto→crypto, CSV) — 708 tests au total.

### v1.29.0 — Lot A « Connaissance de toi » + écosystème Binance / DeFi

- **Connexion Binance en lecture seule** : clé API + secret dans Réglages → « Plateformes — lecture seule » (créée sur Binance avec UNIQUEMENT « Enable Reading », IP restreinte si possible). Les deux champs sont chiffrés par le système comme les autres secrets : jamais en clair, jamais dans les sauvegardes ni la synchronisation. Bouton « Tester la connexion » (nombre d'actifs lus, ou l'erreur exacte : IP non autorisée, clé invalide…), puis « Lier à un compte Binance » : le compte apparaît dans le portefeuille et **ses soldes font foi** (comme un wallet) — le journal ne sert plus que pour le coût d'acquisition, avec rapprochement habituel. Prix lus sur les paires USDT Binance, id CoinGecko retrouvé via le top marché ; un actif sans paire conocida affiche « prix inconnu », jamais 0.
- **Carte « Écarts à ta cible » (Cockpit)** : dérive poche par poche vs ton profil, calculée par tes règles uniquement — renforcer / alléger / « orienter le DCA » (le cœur ne se vend pas hors euphorie), limites par ligne dépassées, poussières sous `minLinePct` à regrouper.
- **Carte « Risque du portefeuille » (Wallet)** : concentration (HHI), plus grosse ligne et top 3, corrélation moyenne au Bitcoin sur 7 jours (sparkline), répartition par plateforme (risque de contrepartie : Ledger / Crypto.com / Binance / Phantom…), scénarios de krach (BTC −30 % / −50 %, les alts amplifient via les bêtas par poche).
- **Onglet « Earn & plateformes » (Rendement & DeFi)** : Simple Earn flexible Binance (taux lus sur l'API publique, retirable à tout moment), top pools DefiLlama de Jupiter, Orca, Raydium et Hyperliquid, et la correspondance fonction par fonction entre Binance (Spot, Earn, Démo, Bots, Copy trading, API, DEX/Alpha, Marge, Convert/P2P) et l'endroit où Boussole le couvre déjà.
- **Tests** : HMAC-SHA256 (vecteur connu), mapping des soldes Binance, dérives, métriques de risque — 703 tests au total.

## Idées pour la suite (priorisées)

### Priorité haute
1. **Import CSV des autres plateformes** (Binance, Coinbase, Kraken, Bitpanda) sur le modèle de l'import Crypto.com.
2. Alertes plus complètes (changement de zone du marché, euphorie) : LIVRÉES en v1.9.0 — calculées par le runner du VPS, elles arrivent sur Telegram même application fermée.
3. **Calendrier des déblocages de tokens** (Tokenomist) sur les positions et la watchlist, avec alerte J-7 : aucune source gratuite fiable aujourd'hui.

### Priorité moyenne
4. **Suivi des « smart money »** : wallets publics de fonds et de traders réputés, avec alerte quand ils achètent un token.
5. **Backtest des signaux** Boussole sur chaque crypto (performance de la stratégie vs achat-conservation).
6. **Délai de réflexion de 24 h** obligatoire avant un achat hors panier sur une crypto à +50 % en 7 jours (le panier applique déjà la règle).
7. **Révocation des approbations** : détection des autorisations à risque sur les wallets EVM suivis.

### Pour plus tard
8. Lecture des positions DeFi (prêts, pools de liquidité, staking) sur les wallets suivis.
9. Widget Android (température du marché et valeur du portefeuille sur l'écran d'accueil).
10. Rapport mensuel PDF (performance, respect des règles).
11. Version iOS (Capacitor la permet, mais il faut un Mac pour compiler).

## Limites connues
- La synchronisation tourne quand l'application est ouverte (au lancement, après tes modifications, toutes les 15 minutes) : une saisie faite hors ligne sur un appareil n'arrive sur l'autre qu'au prochain cycle des deux côtés. La phrase de passe et le jeton ne sont pas récupérables : garde-les (coffre-fort de mots de passe).
- Les API gratuites (surtout CoinGecko sans clé) limitent le nombre de requêtes : ajoute une clé « Demo » gratuite.
- Le runner VPS veille en plus de l'application : si les notifications de l'application restent actives, un même événement peut arriver deux fois (Telegram + notification native). Choisis une source principale ; avec Telegram, désactive les notifications dans l'application.
- Alertes application fermée : sous Windows, elles exigent que Boussole reste dans la zone de notification (option activée par défaut). Sous Android, le script d'arrière-plan couvre les alertes de prix et les paliers de vente (vérification toutes les 30 minutes environ, au bon vouloir du système et des économiseurs de batterie) ; les autres alertes (marché, euphorie) n'arrivent que lorsque l'application est ouverte.
- Le CSV Crypto.com est lu d'après le format connu de l'application : un export réel peut contenir des natures d'opération inédites, que Boussole te demande alors de classer.
- Le suivi des wallets EVM lit le solde natif et une liste de tokens courants, plus tes tokens personnalisés ; ce n'est pas un indexeur complet.
- Les signaux techniques sont des probabilités, pas des prédictions. L'IA peut se tromper ; vérifie les sources citées.
