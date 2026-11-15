# Banc d'essai — stratégies (2026-11-15)

Données jusqu'au 2026-11-14, simulation du 2019-01-01 à la veille. Exécution le lendemain de la décision, à l’ouverture (nextOpen) ou à la clôture (nextClose, variante pessimiste). Frais « plateforme d’échange » (0,10 % + 0,05 % d’écart par côté) ou « application » (1,5 % d’écart par côté). Référence : les mêmes apports en Bitcoin (stratégies à échéances), ou le capital en Bitcoin gardé (stratégies à trades).

| Stratégie | Règles | Exécution | Frais | Performance | Par an | Pire baisse | Référence | Trades | Espérance | Fenêtres 90 j (10ᵉ / 50ᵉ / 90ᵉ) |
|---|---|---|---|---|---|---|---|---|---|---|
| DCA Boussole | dca-boussole@1+signals1+cycle1+autoBasket1 | nextOpen | exchange | +1095,3 % | +37,0 % | -77,6 % | +1577,7 % | 2 | — | -28,5 / +3,2 / +71,5 % |
| DCA Boussole | dca-boussole@1+signals1+cycle1+autoBasket1 | nextOpen | app | +1020,8 % | +35,9 % | -77,7 % | +1476,2 % | 2 | — | -28,5 / +3,2 / +71,0 % |
| DCA Boussole | dca-boussole@1+signals1+cycle1+autoBasket1 | nextClose | exchange | +1042,7 % | +36,2 % | -77,6 % | +1577,7 % | 2 | — | -28,4 / +3,2 / +71,0 % |
| DCA Boussole | dca-boussole@1+signals1+cycle1+autoBasket1 | nextClose | app | +970,7 % | +35,1 % | -77,6 % | +1476,2 % | 2 | — | -28,6 / +3,2 / +70,3 % |
| DCA Bitcoin simple | dca-btc@1 | nextOpen | exchange | +1577,7 % | +43,0 % | -76,6 % | +1577,7 % | 0 | — | -26,4 / +8,2 / +68,4 % |
| DCA Bitcoin simple | dca-btc@1 | nextOpen | app | +1476,2 % | +41,9 % | -76,7 % | +1476,2 % | 0 | — | -26,4 / +8,0 / +68,3 % |
| DCA Bitcoin simple | dca-btc@1 | nextClose | exchange | +1542,9 % | +42,7 % | -76,6 % | +1577,7 % | 0 | — | -26,3 / +8,1 / +68,3 % |
| DCA Bitcoin simple | dca-btc@1 | nextClose | app | +1442,9 % | +41,5 % | -76,7 % | +1476,2 % | 0 | — | -26,4 / +7,9 / +68,2 % |
| Investisseur (température) | investisseur@1+cycle1 | nextOpen | exchange | +1561,8 % | +42,9 % | -65,4 % | +1577,7 % | 12 | — | -22,4 / +7,4 / +56,9 % |
| Investisseur (température) | investisseur@1+cycle1 | nextOpen | app | +1454,8 % | +41,7 % | -65,6 % | +1476,2 % | 12 | — | -22,5 / +7,4 / +56,8 % |
| Investisseur (température) | investisseur@1+cycle1 | nextClose | exchange | +1547,5 % | +42,7 % | -65,2 % | +1577,7 % | 12 | — | -22,3 / +7,6 / +56,7 % |
| Investisseur (température) | investisseur@1+cycle1 | nextClose | app | +1440,3 % | +41,5 % | -65,4 % | +1476,2 % | 12 | — | -22,4 / +7,4 / +56,6 % |
| Trader (setups avec stop) | trader@1+signals1 | nextOpen | exchange | -11,6 % | -1,6 % | -20,4 % | +1589,4 % | 99 | -0,10 R | -1,6 / 0,0 / 0,0 % |
| Trader (setups avec stop) | trader@1+signals1 | nextOpen | app | -22,0 % | -3,1 % | -24,3 % | +1589,4 % | 77 | -0,30 R | -4,0 / 0,0 / 0,0 % |
| Trader (setups avec stop) | trader@1+signals1 | nextClose | exchange | +73,7 % | +7,3 % | -20,5 % | +1589,4 % | 520 | +0,05 R | -5,1 / 0,0 / +12,1 % |
| Trader (setups avec stop) | trader@1+signals1 | nextClose | app | -3,5 % | -0,5 % | -20,4 % | +1589,4 % | 60 | -0,07 R | 0,0 / 0,0 / 0,0 % |

Une simulation flatte toujours un peu : seuls les résultats en direct comptent pour la confiance.
