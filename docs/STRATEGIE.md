# Ma stratégie — les règles que Boussole applique par défaut

Ces règles viennent du diagnostic fait le 8 novembre 2026 sur ta situation réelle : un Ledger (≈ 0,05 BTC et 0,40 ETH), un panier de 19 lignes sur crypto.com alimenté par un DCA de 25 USDC deux fois par semaine, et l'envie de faire un peu de DeFi sur Phantom. Boussole les reprend dans ses écrans (Panier DCA, plan de sortie, règles de profil) : choisis le profil « Ma stratégie » dans Guide & profil. Tu peux tout modifier dans l'application.

> Outil d'aide à la décision, pas un conseil en investissement. Aucune règle ne garantit un gain.

## 1. Photo du portefeuille (8 nov. 2026, ≈ 5 250 $)

| Poche | Valeur | Part |
|---|---|---|
| Bitcoin (Ledger + crypto.com) | ≈ 3 920 $ | 75 % |
| Ethereum | ≈ 980 $ | 19 % |
| HYPE, SUI, SOL | ≈ 240 $ | 4,6 % |
| 14 autres lignes | ≈ 111 $ | 2,1 % (10 lignes sous 8 $) |

- **Le socle est sain** : 93 % en BTC/ETH, et sur un Ledger.
- **Le vrai problème, c'est l'éparpillement** : un ×10 sur une ligne de 7 $ rapporte 67 $, soit 1,3 % du portefeuille, et chaque ordre de 3 à 6 $ paie le spread de l'application.
- **Les pourcentages affichés par crypto.com sont faux** (+51 370 % sur ETH, +9 475 302 % sur SOL) : il manque un coût d'achat. Ne t'en sers pas pour décider ; Boussole recalcule ton prix moyen à partir de ton historique.

## 2. Méthode DCA

- **Budget constant : 50 USDC par semaine**, sur 2 échéances, avec **1 ou 2 ordres par échéance** (jamais 5).
- **La base est modulée par la température du marché** (×2 sous 20, ×1,5 de 20 à 40, ×1 de 40 à 60, ×0,5 de 60 à 80, ×0,25 au-delà) :
  - marché chaud : tu investis moins, le reste va dans une **réserve en USDC** ;
  - marché qui a peur : tu puises dans cette réserve ;
  - tu n'as jamais besoin de vendre pour avoir des munitions.
  - Mesuré sur 2023-2026 (`docs/bench/2026-11-15-dca-variantes.md`) : une table plus pentue gagne un peu plus mais creuse la pire baisse ; la table reste donc celle-ci.
- **Règle de la base, mesurée sur l'historique** : « Bitcoin seul » fait jeu égal avec le DCA Bitcoin simple (+286 % depuis 2023) ; choisir chaque semaine les trois meilleurs scores parmi le top 20 a fait +118 %. Les nouveaux paniers démarrent en « Bitcoin seul » ; un panier existant garde sa règle tant que tu ne la changes pas (bannière dans le DCA).
- **Découverte** (la part « pépites ») :
  - 5 tokens au plus dans ta liste, **un seul acheté par échéance** ;
  - on **finit une ligne avant d'en ouvrir une autre** : une ligne vaut au moins 1 % du portefeuille ;
  - plafond par ligne : celui de ton profil ;
  - la part découverte **baisse toute seule** quand tes altcoins approchent de ta cible ;
  - pas d'achat après +50 % en 7 jours (anti-FOMO) ;
  - marché chaud (température ≥ 60) : la part découverte est réduite, et coupée à partir de 80.
- **Achat hors DCA** : uniquement avec la réserve, et seulement quand le marché a peur (température < 30).
- **Un token doit être disponible sur crypto.com** pour entrer dans le panier. Boussole affiche un badge et filtre les listes.

## 3. Quand vendre

- **BTC et ETH** : seulement en euphorie (température ≥ 80), par tranches de 5 à 10 %, jamais tout, avec au moins 30 jours entre deux tranches. Un excès de Bitcoin se corrige en orientant le DCA, jamais en vendant. Aujourd'hui (Fear & Greed à 28, BTC à −40 % de son record) : rien à vendre.
- **Altcoins** :
  - paliers à ×2, ×3 et ×5, 25 % de la position à chaque palier, les 25 % restants courent ;
  - 6 mois sous Bitcoin sans progrès = bascule vers Bitcoin.
- **Poussières sans conviction** : regroupe-les vers BTC (un échange crypto contre crypto).

## 4. Staking et rendement

À ta taille, le gain total est d'environ **30 $ par an**, dont 22 à 30 $ pour l'ETH.

| Protocole | Actif | Rendement annuel (DefiLlama, 8 nov.) |
|---|---|---|
| Lido | ETH | 2,25 % |
| ether.fi | ETH | 3,04 % |
| Jito | SOL | 4,96 % |
| Kinetiq | HYPE | 1,86 % |

- **BTC : rien.** Il n'y a pas de staking natif, et les « rendements BTC » ajoutent un risque de contrepartie.
- **ETH : facultatif.** Si tu le fais, Lido depuis Ledger Live, sans rien de plus exotique.
- **SOL, HYPE, SUI… : pas la peine** sous ≈ 500 $ par ligne.
- **Règle : n'achète jamais un token pour son rendement.**

## 5. DeFi sur Phantom

- Selon le rapport de Solidus Labs, **98,6 % des tokens lancés sur pump.fun** entre janvier 2024 et mars 2025 étaient des arnaques (rug pulls) ou des pump-and-dumps.
- Le swap intégré à Phantom prend **0,85 %** par opération, plus le slippage et les frais de priorité.
- Si tu y vas :
  - enveloppe **≤ 3 % du portefeuille** (≈ 150 $) ;
  - **un compte Phantom séparé** : ne connecte jamais ton Ledger à ces sites ;
  - scan de sécurité avant chaque achat ;
  - tu retires ta mise à ×2 ;
  - **pause d'un mois** si l'enveloppe perd 50 %.

## 6. À faire dès maintenant

1. **Vérification d'identité (KYC) crypto.com** : fais-la dans l'application officielle, jamais par un lien reçu par e-mail ou SMS. Sinon tes achats risquent d'être bloqués.
2. **Exporte l'historique CSV de crypto.com** et garde-le : c'est ta preuve des prix d'achat, et Boussole sait l'importer.
3. **Plus de nouvelles lignes** : la découverte sert à renforcer tes meilleures convictions.
