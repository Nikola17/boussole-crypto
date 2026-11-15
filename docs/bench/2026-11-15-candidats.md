# Candidats du lot 3 — décisions (15 novembre 2026)

> **Méthode corrigée (même jour).** Le premier passage comparait des épisodes (un par série de jours) à une référence de jours : n'importe quel état qui change souvent paraissait meilleur qu'un jour quelconque (« Conserver » et ses compléments battaient tous la référence). Les taux et médianes se calculent désormais sur tous les jours actifs, la marge d'erreur sur le nombre d'épisodes ; un test vérifie qu'un état et son complément ne peuvent plus battre tous deux la référence. Les mêmes candidats ont été remesurés au contrôle (`2026-11-15-candidats-controle-retenus.md`, inscrit au journal) ; **les décisions ci-dessous sont celles de la méthode corrigée**. Le tableau d'origine est conservé plus bas pour mémoire.

## Décisions (méthode corrigée)

| Candidat | Décision | Raison chiffrée (contrôle, pondération par jour) |
|---|---|---|
| F3 · cassure 20 jours, volume ×1,5 | **Retenu** (« Achat ») | 51,1 % contre 43,1 % ; cohérence 66,3 % |
| F3 · cassure 20 jours, volume ×2 | **Retenu** (« Achat fort ») | 52,7 % contre 43,1 % ; cohérence 68,1 % |
| F10 · excès (RSI hebdo > 80 ou Mayer > 2) | **Retenu** (« Alléger ») | 33,2 % contre 41,2 % ; médiane −24,9 % contre −9,0 % ; cohérence 75 % |
| F8 · altcoins en « Marché chaud » (60 à 80) | **Retenu** (« Alléger », hors Bitcoin) | 18,9 % contre 41,2 % ; médiane −31,8 % ; cohérence 89,4 % |
| F8 · altcoins en « Peur extrême » (< 20) | **Retenu** (« Accumuler ») | 56,7 % contre 41,2 % ; médiane +5,6 % contre −9,0 % ; cohérence 77,6 % |
| Zone 20 à 40 (libellé « Accumuler », toutes cryptos) | **Retenu** | le libellé lui-même : 46,5 % contre 41,2 % au contrôle (rapport des signaux v2) ; le candidat F8 restreint aux altcoins est « sans effet » (borne d'erreur) |
| F13 · plan, stop jugé à la clôture, objectif 3 R | **Retenu** (plan v2) | +0,32 R par trade, frais compris (entrées du signal trader v2) ; meilleure variante au contrôle |
| F14 · stop à 1,5 ou 2 × la volatilité, objectif 3 R | Abandonné | validés (+0,19 et +0,24 R) mais moins bons que F13 |
| F12 · tendance hebdomadaire et signal trader | Information seulement | validé, cohérence 58,9 % (sous 60 %) |
| F4 · pression acheteuse, F6 · survente avec rebond | Information seulement | prometteurs |
| F1 · régime Bitcoin, F2 · tendance 200 jours, F7 · Mayer < 0,8, F9 · compression puis baisse | Abandonnés | sans effet au contrôle |
| F5, F9 hausse, F4 > 55 %, F6 en tendance, F11 | Abandonnés ou non mesurés | comme ci-dessous |

## Premier passage (pondération par épisode, abandonné)


Mesures : `2026-11-15-candidats-reglage.md` (période de réglage seule, tous les candidats) et `2026-11-15-candidats-controle.md` (période de contrôle, variantes retenues sur le réglage). Chaque regard sur le contrôle est inscrit dans `journal.md`. Règle d'entrée : verdict « validé » et même sens sur 60 % ou plus des cryptos ayant au moins 5 épisodes (protocole, point 4).

| Candidat | Décision | Raison chiffrée (contrôle, sauf mention) |
|---|---|---|
| F3 · cassure des plus hauts 20 jours, volume ×1,5 | **Retenu** | 50,1 % de hausses à 30 j contre 43,1 % ; médiane +0,1 % contre −3,5 % ; même sens sur 69,5 % des cryptos |
| F3 · cassure des plus hauts 20 jours, volume ×2 | **Retenu** (« Achat fort ») | 51,6 % contre 43,1 % ; médiane +1,0 % ; 68,1 % des cryptos |
| F8 · altcoins, température « Accumulation » (20 à 40) | **Retenu** | 52,6 % de hausses à 90 j contre 41,2 % ; médiane +2,4 % contre −9,0 % ; 77,7 % des cryptos |
| F4 · pression acheteuse > 52 % sur 7 jours | Information seulement | prometteur : 47,0 % contre 44,5 % à 14 j |
| F6 · survente et clôture en hausse | Information seulement | prometteur : 48,6 % contre 44,5 % à 14 j |
| F7 · multiple de Mayer sous 0,8 | Information seulement | prometteur : 42,6 % contre 41,2 % à 90 j |
| F8 · altcoins, température « Peur extrême » (< 20) | Information seulement | prometteur : médiane −5,4 % contre −9,0 % à 90 j, mais 40,1 % de hausses contre 41,2 % |
| F9 · compression puis cassure baissière | Information seulement | prometteur (baissier) : 41,7 % contre 44,5 % à 14 j ; cohérence 52,5 % |
| F1 · Bitcoin au-dessus d'une moyenne 200 jours en hausse | Abandonné | très bon au réglage (65,9 %), sans effet au contrôle (42,3 % contre 44,5 %) |
| F2 · prix au-dessus d'une moyenne 200 jours en hausse | Abandonné | sans effet : 36,3 % contre 41,2 % |
| F10 · excès (RSI hebdomadaire > 80 ou Mayer > 2) | Abandonné | sans effet : 39,1 % contre 41,2 % ; la pire baisse est plus profonde (−17,1 % contre −9,0 % en médiane) mais pas assez pour un verdict |
| F12 · tendance hebdomadaire et signal trader | Abandonné | sans effet ; cohérence 39,6 % |
| F8 · altcoins, température « Marché chaud » | Abandonné | sans effet ; cohérence 38,8 % |
| F13 · plan, stop jugé à la clôture | Abandonné | +0,37 R au réglage, −0,03 R au contrôle |
| F14 · plan, stop à 1,5 ou 2 × la volatilité, objectif 3 R | Abandonné | +0,31 R au réglage, +0,03 et +0,04 R au contrôle |
| F5 · force relative face à Bitcoin | Abandonné sans regarder le contrôle | défavorable au réglage (44,0 % contre 48,4 %), comme à la mesure du 14 novembre |
| F9 · compression puis cassure haussière | Abandonné sans regarder le contrôle | défavorable au réglage (46,9 % contre 49,1 %) |
| F4 > 55 %, F6 en tendance haussière | Abandonnés sans regarder le contrôle | trop peu de cas au réglage (56 et 5 épisodes) |
| F11 · taux de financement | Non mesuré | historique des contrats perpétuels non chargé par le banc d'essai |

**Ce que cela implique pour les signaux v2.** Aucun critère baissier n'est validé : ni « Alléger », ni « Vente », ni « Vente forte » ne reposent sur une mesure. Aucune variante de plan de trade n'a d'espérance positive après frais sur la période de contrôle. Les signaux v2 n'affichent donc que ce qui est soutenu.
