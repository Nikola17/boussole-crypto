# Banc d'essai — stratégies (2026-11-15)

Données jusqu'au 2026-11-14, simulation du 2019-01-01 à la veille. Exécution le lendemain de la décision, à l’ouverture (nextOpen) ou à la clôture (nextClose, variante pessimiste). Frais « plateforme d’échange » (0,10 % + 0,05 % d’écart par côté) ou « application » (1,5 % d’écart par côté). Référence : les mêmes apports en Bitcoin (stratégies à échéances), ou le capital en Bitcoin gardé (stratégies à trades).

| Stratégie | Règles | Exécution | Frais | Performance | Par an | Pire baisse | Référence | Trades | Espérance | Fenêtres 90 j (10ᵉ / 50ᵉ / 90ᵉ) |
|---|---|---|---|---|---|---|---|---|---|---|
| DCA Bitcoin simple | dca-btc@1 | nextOpen | exchange | +1577,7 % | +43,0 % | -76,6 % | +1577,7 % | 0 | — | -26,4 / +8,2 / +68,4 % |
| DCA Bitcoin simple | dca-btc@1 | nextOpen | app | +1476,2 % | +41,9 % | -76,7 % | +1476,2 % | 0 | — | -26,4 / +8,0 / +68,3 % |
| DCA Bitcoin simple | dca-btc@1 | nextClose | exchange | +1542,9 % | +42,7 % | -76,6 % | +1577,7 % | 0 | — | -26,3 / +8,1 / +68,3 % |
| DCA Bitcoin simple | dca-btc@1 | nextClose | app | +1442,9 % | +41,5 % | -76,7 % | +1476,2 % | 0 | — | -26,4 / +7,9 / +68,2 % |
| Investisseur (température) | investisseur@1+cycle1 | nextOpen | exchange | +1561,8 % | +42,9 % | -65,4 % | +1577,7 % | 12 | — | -22,4 / +7,4 / +56,9 % |
| Investisseur (température) | investisseur@1+cycle1 | nextOpen | app | +1454,8 % | +41,7 % | -65,6 % | +1476,2 % | 12 | — | -22,5 / +7,4 / +56,8 % |
| Investisseur (température) | investisseur@1+cycle1 | nextClose | exchange | +1547,5 % | +42,7 % | -65,2 % | +1577,7 % | 12 | — | -22,3 / +7,6 / +56,7 % |
| Investisseur (température) | investisseur@1+cycle1 | nextClose | app | +1440,3 % | +41,5 % | -65,4 % | +1476,2 % | 12 | — | -22,4 / +7,4 / +56,6 % |

Une simulation flatte toujours un peu : seuls les résultats en direct comptent pour la confiance.
