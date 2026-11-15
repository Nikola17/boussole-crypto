# Protocole du banc d'essai pour les nouveaux critères (lot 3)

Repris de la fiche de conception (`docs/superpowers/specs/2026-11-15-labo-banc-d-essai-autopilote-design.md`, 10.2).

1. Un candidat est une clé de l'étude de signal (`src/lib/lab/candidates.ts`), avec son intention (haussière, baissière ou neutre) et son horizon déclarés avant la mesure.
2. Ses paramètres se choisissent sur la seule période de réglage (jusqu'au 31/12/2022), avec des valeurs rondes et trois essais au plus par candidat : `npm run bench -- candidates`.
3. Chaque regard sur la période de contrôle (à partir du 01/01/2023) s'inscrit dans `docs/bench/journal.md` (date, candidat, paramètres, résultat) : `npm run bench -- candidates --control` écrit une ligne par candidat. C'est ce qui empêche de régler sans le dire sur la période censée juger.
4. Un candidat entre dans les signaux seulement s'il est « validé » et si son effet a le même sens sur 60 % ou plus des cryptos qui ont au moins 5 épisodes.
5. Un candidat « prometteur » peut s'afficher comme information, sans peser sur un libellé.

Conventions de mesure : celles du rapport des signaux (entrée à l'ouverture du lendemain, épisodes, référence de la même période, verdict jugé sur l'écart de médiane avec la référence).
