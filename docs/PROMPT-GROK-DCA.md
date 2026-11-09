# Prompt Grok v2 — DCA automatisé avec tes vraies positions

Ton prompt actuel fonctionne, mais Grok ne connaît ni tes positions ni tes limites : il propose donc souvent un nouveau token au lieu de renforcer une ligne existante, et ne sait pas si le marché est chaud ou froid. La version 2 ajoute ce contexte et demande une réponse que Boussole sait relire et contrôler.

**Comment l'utiliser**

1. Dans Boussole : *DCA → ton panier → bouton « Grok » → onglet « 1. Préparer le prompt »*, puis « Copier le prompt ». L'application remplit toutes les zones `{{…}}` avec tes données du jour.
2. Colle-le dans Grok (ou garde-le comme tâche planifiée et recopie seulement le bloc « CONTEXTE »).
3. Reviens dans le même écran, onglet « 2. Coller la réponse », colle la réponse de Grok et clique « Analyser la réponse » : Boussole lit le bloc JSON final et contrôle chaque ordre avec tes règles (OK, avertissement ou à corriger). Si tu as passé les ordres de Grok, « Enregistrer les ordres de Grok » les ajoute au journal.

Boussole calcule déjà son propre ordre du jour. Grok devient un **second avis** : si les deux divergent, l'écran te montre pourquoi.

## Le prompt

```text
Tu es mon analyste de marché pour un DCA moyen et long terme (pas de trading court terme).
Réponds en français.

CONTEXTE (fourni par Boussole le {{date}})
- Marché : température {{temperature}}/100 ({{zone}}), Fear & Greed {{fng}}/100, Bitcoin à {{btc_prix}} $ ({{btc_sous_ath}} % sous son record).
- Budget de cette échéance : {{budget}} USDC. Part « découverte » maximale : {{decouverte_max}} % (réduite quand mes altcoins approchent de ma cible).
- Réserve USDC disponible : {{reserve}} USDC.
- Mes positions (valeur en USD · part du portefeuille) :
{{positions}}
- Panier « classique » (poids cibles) : {{classique}}.
- Liste « découverte » actuelle ({{nb_decouverte}} sur 5 maximum) : {{decouverte}}.

MES RÈGLES (non négociables)
1. Au plus 2 ordres par échéance : 1 « classique » et 1 « découverte ».
2. Un seul achat « découverte » par échéance. On finit une ligne avant d'en ouvrir une autre : une ligne doit peser au moins {{ligne_min}} % du portefeuille.
3. Aucune ligne « découverte » ne dépasse {{plafond_ligne}} % du portefeuille.
4. Pas d'achat d'un token qui a pris plus de 50 % en 7 jours.
5. Aucun ordre inférieur à {{ordre_min}} USDC.
6. Le token doit être disponible dans l'application Crypto.com. Si tu n'en es pas sûr, écris « disponibilité non vérifiée ».
7. J'exclus les tokens opaques, manipulables ou illiquides.
8. Si rien ne passe les critères, ne force pas l'achat : propose de mettre le montant en réserve.

RECHERCHE OBLIGATOIRE pour chaque token envisagé
1. Variation du prix sur 24 h, 7 j, 30 j, 200 j et 1 an.
2. Capitalisation, rang et volume sur 24 h.
3. Rapport volume / capitalisation.
4. Liquidité réelle et profondeur du carnet d'ordres.
5. Rapport FDV / capitalisation.
6. Calendrier des déblocages de tokens (dates et montants).
7. Concentration des principaux portefeuilles.
8. Activité des développeurs et évolution du protocole.
9. Revenus, frais, TVL ou utilisateurs, quand c'est pertinent.
10. Cotations sur les grandes plateformes centralisées et décentralisées.
11. Tendance de recherche et activité sur X.
12. Risques : piratage, inflation, déblocages, faible liquidité, valorisation excessive, centralisation, dépendance au battage médiatique.

FIABILITÉ
- N'invente aucune donnée. Si tu n'as pas la source, écris « non vérifié ».
- Distingue clairement les FAITS (avec la source), les ESTIMATIONS et les OPINIONS.
- Signale les désaccords entre sources.

FORMAT DE LA RÉPONSE
1. Analyse du marché en 5 lignes maximum.
2. Les ordres proposés, chacun avec la raison et les risques principaux.
3. Ma liste « découverte » mise à jour (5 tokens au plus).
4. Pour finir, un bloc JSON valide, et rien après lui :

```json
{
  "date": "AAAA-MM-JJ",
  "marche": "une phrase",
  "ordres": [
    { "jeton": "BTC", "type": "classique", "montant_usdc": 12.5, "raison": "…" },
    { "jeton": "SUI", "type": "decouverte", "montant_usdc": 12.5, "raison": "…" }
  ],
  "reserve_usdc": 0,
  "liste_decouverte": ["SUI", "…"],
  "alertes": ["…"],
  "non_verifie": ["…"]
}
```
```

## Ce que Boussole contrôle dans la réponse

Pour chaque ordre, l'application vérifie :

| Contrôle | Résultat |
|---|---|
| Plus de 2 ordres, ou plus d'un seul achat « découverte » | à corriger |
| Total au-dessus du budget de l'échéance et de ta réserve | à corriger |
| Total au-dessus du budget seul | avertissement (la différence est puisée dans la réserve) |
| Ordre sous le minimum | à corriger |
| Ligne « découverte » qui dépasserait le plafond de ton profil | à corriger |
| Ouverture d'une ligne de plus que le maximum autorisé | à corriger |
| Crypto à +50 % en 7 jours | à corriger |
| Ouverture d'une nouvelle ligne alors qu'une ligne est sous le poids minimal | avertissement |
| Crypto absente de la liste Crypto.com | avertissement |
| Crypto absente de ta liste, ou de ton cœur de panier | avertissement |
| Crypto inconnue de Boussole | avertissement (tu choisis la crypto à la main) |

Si la réponse n'a pas de bloc JSON exploitable, Boussole demande à l'IA configurée dans Réglages d'en extraire les ordres (environ 0,003 $ avec DeepSeek V4.1 Flash).
