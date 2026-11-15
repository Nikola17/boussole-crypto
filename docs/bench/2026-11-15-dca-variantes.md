# Variantes du DCA (2026-11-15)

Fiche de conception, 12.1. Simulations du banc d’essai de 2019 à 2026-11-14, frais d’une plateforme d’échange (0,10 % + 0,05 % d’écart). Décision sur la période de contrôle (à partir du 01/01/2023) : meilleur TWR sans pire baisse supérieure de plus de 2 points à celle du DCA Bitcoin simple ; table de température changée seulement pour plus de 2 points de TWR annualisé sans pire baisse plus forte.

## Conclusion

- **Base du panier retenue : Bitcoin seul (`btc`)**, dans les deux modes d’exécution.
- Elle bat le DCA Bitcoin simple en contrôle : +286,1 % contre +285,9 %, un écart négligeable : elle fait jeu égal.
- La règle actuelle des paniers existants (trois meilleurs scores) fait +117,7 % en contrôle : les paniers existants ne changent pas d’office, une bannière propose la règle retenue.
- **Table de température : inchangée**.
- Limite : la règle « capitalisation » est pondérée par le volume médian sur 30 jours (pas de capitalisation historique gratuite) ; l’application en direct utilise la vraie capitalisation.

## Exécution à l’ouverture suivante

### Base du panier (DCA Boussole, base seule, 25 $ mardi et vendredi, température et réserve)

| Variante | TWR contrôle | par an | Pire baisse contrôle | TWR 2019-… | Pire baisse 2019-… |
|---|---|---|---|---|---|
| DCA Bitcoin simple (référence) | +285,9 % | +41,7 % | −53,0 % | +1577,7 % | −76,6 % |
| Trois meilleurs scores (`top3`) | +117,7 % | +22,2 % | −54,8 % | +1095,3 % | −77,6 % |
| Pondérée par la capitalisation (`cap`) | +201,4 % | +32,9 % | −55,7 % | +1477,3 % | −75,3 % |
| Ancre Bitcoin et Ethereum (`anchor`) | +186,1 % | +31,2 % | −53,6 % | +1413,9 % | −76,3 % |
| Parts égales sur le top 20 (`equal`) | +136,8 % | +24,9 % | −53,7 % | +839,0 % | −79,2 % |
| Bitcoin seul (`btc`) | +286,1 % | +41,7 % | −52,8 % | +1601,2 % | −76,1 % |

Retenue : **Bitcoin seul** (bat le DCA Bitcoin simple).

### Multiplicateurs de température (Investisseur : Bitcoin et Ethereum 75/25, réserve)

| Variante | TWR contrôle | par an | Pire baisse contrôle | TWR 2019-… | Pire baisse 2019-… |
|---|---|---|---|---|---|
| actuelle [2 ; 1.5 ; 1 ; 0.5 ; 0.25] | +132,8 % | +24,4 % | −52,9 % | +1561,8 % | −65,4 % |
| plate [1.5 ; 1.25 ; 1 ; 0.75 ; 0.5] | +125,8 % | +23,4 % | −52,2 % | +1487,4 % | −65,2 % |
| pentue [3 ; 2 ; 1 ; 0.33 ; 0] | +154,3 % | +27,2 % | −54,5 % | +1660,4 % | −66,6 % |

Retenue : **actuelle**.

## Exécution à la clôture suivante

### Base du panier (DCA Boussole, base seule, 25 $ mardi et vendredi, température et réserve)

| Variante | TWR contrôle | par an | Pire baisse contrôle | TWR 2019-… | Pire baisse 2019-… |
|---|---|---|---|---|---|
| DCA Bitcoin simple (référence) | +285,7 % | +41,7 % | −53,0 % | +1542,9 % | −76,6 % |
| Trois meilleurs scores (`top3`) | +117,8 % | +22,2 % | −54,8 % | +1042,7 % | −77,6 % |
| Pondérée par la capitalisation (`cap`) | +201,3 % | +32,9 % | −55,7 % | +1446,4 % | −75,3 % |
| Ancre Bitcoin et Ethereum (`anchor`) | +186,3 % | +31,2 % | −53,6 % | +1369,5 % | −76,3 % |
| Parts égales sur le top 20 (`equal`) | +136,8 % | +24,9 % | −53,7 % | +805,2 % | −79,1 % |
| Bitcoin seul (`btc`) | +285,8 % | +41,7 % | −52,8 % | +1567,6 % | −76,0 % |

Retenue : **Bitcoin seul** (bat le DCA Bitcoin simple).

### Multiplicateurs de température (Investisseur : Bitcoin et Ethereum 75/25, réserve)

| Variante | TWR contrôle | par an | Pire baisse contrôle | TWR 2019-… | Pire baisse 2019-… |
|---|---|---|---|---|---|
| actuelle [2 ; 1.5 ; 1 ; 0.5 ; 0.25] | +131,9 % | +24,3 % | −52,9 % | +1547,5 % | −65,2 % |
| plate [1.5 ; 1.25 ; 1 ; 0.75 ; 0.5] | +125,0 % | +23,3 % | −52,2 % | +1469,0 % | −65,0 % |
| pentue [3 ; 2 ; 1 ; 0.33 ; 0] | +153,2 % | +27,1 % | −54,5 % | +1648,7 % | −66,4 % |

Retenue : **actuelle**.
