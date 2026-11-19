# Plan — Binance & DeFi dans Boussole

> ✅ **Implémenté en v1.36.0 → v1.38.0** : les 10 idées ci-dessous sont livrées (voir `docs/FONCTIONNALITES.md`).


Rappel de la philosophie : Boussole est un **outil d'aide à la décision**, jamais un conseil. On ne branche **aucune clé avec droit d'ordre** : lecture seule + simulations + alertes. L'exécution reste chez toi (ou en paper trading).

## 1. Ce que la capture Binance montre (à couvrir)

| Fonction Binance | Ce que Boussole peut en faire (sans jamais trader pour toi) |
|---|---|
| Spot / Marge / Convert | Déjà couvert côté suivi (portefeuille, journal, drift). Rien à ajouter. |
| **Simple Earn** (flexible/lock) | Comparateur de rendement déjà en partie (onglet Earn). À compléter : tri par actif, niveau de risque, alertes « ton USDC dort à 2 % alors que 8 % ailleurs ». |
| **Advanced Earn** (dual investment, on-chain earn, etc.) | **Simulateur de payoff** : pour un actif, un prix d'exercice et une maturité, montrer le rendement annualisé réel et le scénario « le prix touche le strike ». Alertes quand un nouveau produit correspond à un actif suivi. |
| **Launchpool / Launchpad / Megadrop** | Calendrier des événements à venir + alertes J-7/J-1/J-0 + rappel des règles (lock de BNB, etc.). Historique des participations avec P&L réel. |
| **Copy trading** | **Watchlist de traders publics** (P&L 30 j, max drawdown, taille moyenne) — suivi statistique, jamais de copie automatique. Alerte si un suivi dévisse. |
| **Bots de trading** (grid, DCA bot) | **Backtest** des réglages de grid sur données historiques (on a déjà le banc d'essai) + alerte « ton grid est sous le range actuel ». |
| **Démo de trading** | Déjà le paper trading de Boussole — à enrichir avec les frais réalistes Binance. |
| **Alpha** (tokens early) | Radar de nouvelles paires Alpha avec les mêmes scans de sécurité que Pépites (GoPlus/RugCheck) + alerte listing. |
| **DEX / Binance Wallet** | Mêmes scans que les autres DEX (Jupiter/Orca/Raydium déjà suivis via DefiLlama). |
| API | Clés read-only déjà supportées (lot A). À documenter : scopes minimaux. |

## 2. DeFi externe (Jupiter, Orca, Raydium, Hyperliquid…)

| Source | Idée pour Boussole |
|---|---|
| Jupiter / Orca / Raydium (Solana) | Pools déjà suivis via DefiLlama (lot A). À ajouter : **calculateur de perte impermanente** pour tes positions LP + alerte « le pool X a perdu Y % de TVL en 7 j » (rugpull partiel). |
| Hyperliquid (perps DEX) | Données publiques (funding, OI) → déjà en partie dans le radar dérivés (lot B). À ajouter : alertes sur funding extrême de tes positions. |
| PancakeSwap / Uniswap (EVM) | Scan approvals déjà en place (lot C). Alertes de rendement de farm avec warning risque. |

## 3. Propositions concrètes, par priorité

1. **Comparateur Earn complet** (Simple + Advanced + pools DeFi) : meilleur rendement par actif suivi, avec tier de risque (protocol, TVL, audit, âge) — lecture seule. *(étend le lot A)*
2. **Simulateur Dual Investment** : « si tu places 500 USDC à strike −10 % sur 7 j, tu gagnes X % annualisé, ou tu récupères tes USDC convertis au strike » — rejouable avec les données du marché. *(lot « et si »)*
3. **Calendrier Launchpool/Launchpad** + alertes J-7/J-1/J-0 + bilan des participations. *(runner VPS, comme les unlocks)*
4. **Calculateur de perte impermanente** pour les LP (prix d'entrée vs maintenant, formule IL = …). *(pure, testable)*
5. **Watchlist copy-trading** (stats publiques uniquement, jamais de copie) + alerte drawdown. *(runner)*
6. **Backtest de grid bot** sur historique BTC/ETH (réutilise `docs/bench/`). *(labo)*
7. **Radar Alpha / nouvelles paires** avec scan sécurité systématique avant toute alerte. *(runner + app)*
8. **Alertes funding extrême** sur les perps que tu suis (Hyperliquid + Binance fapi, déjà en partie). *(runner)*
9. **Frais réalistes** dans le paper trading (maker/taker Binance selon ton VIP). *(labo)*
10. **Export « tout ce qui rapporte »** : rendement global de tes positions Earn/LP/farm dans le rapport mensuel (lot E déjà livré, à enrichir).

## 4. Règles de sécurité (non négociables)

- Jamais de clé API avec droit de retrait ou d'ordre — read-only uniquement, stockée chiffrée.
- Jamais de signature de transaction depuis l'app (les révoques d'approvals restent guidées, exécutées par toi sur revoke.cash).
- Toute alerte sur un nouveau token passe par le scan GoPlus/RugCheck + âge de la paire + warning « 98,6 % des tokens pump.fun sont des arnaques ».
- Le repo étant public : **aucun secret, aucune clé, aucune URL de webhook privée** dans le code ou la config VPS — secrets uniquement en variables d'environnement / fichiers chmod 600 hors dépôt.
