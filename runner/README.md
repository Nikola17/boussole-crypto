# Boussole Runner — surveillance 24/7 + alertes Telegram

Un petit service Node headless qui surveille Boussole **application fermée** : alertes de
prix, paliers de vente, brief quotidien sur Telegram. Il lit le même fichier de
synchronisation chiffré que le PC et le téléphone (dépôt GitHub privé), ne dépend d'aucune
base de données, et n'écoute sur **aucun port** — il ne fait que des requêtes sortantes.
Il n'a besoin de **rien installer** : Node ≥ 20 suffit (le bundle
`boussole-runner.mjs` est autonome).

## Ce qu'il fait

- toutes les 5 minutes (réglable) : lit la sync chiffrée, demande les prix à CoinGecko,
  envoie sur Telegram les alertes de prix atteintes et les paliers de vente atteints
  non vendus ;
- une alerte de prix envoyée est **consommée dans le fichier de synchronisation**
  (`triggeredAt`, `active: false`) : le PC et le téléphone la voient déclenchée à leur
  propre synchronisation et ne la re-notifient pas ;
- un palier atteint non vendu est envoyé **une seule fois** (même règle que le script
  d'arrière-plan Android) : il reste rappelé chaque jour dans le brief tant que la
  vente n'est pas enregistrée ;
- la **température du marché** (mêmes indicateurs que l'application : Fear & Greed,
  multiple de Mayer, RSI hebdomadaire, taux de financement) est calculée sur le
  serveur : un changement de zone (accumulation, chaleur, euphorie…) prévient sur
  Telegram, application fermée. Au premier passage, la zone est seulement mémorisée ;
- tous les messages (alertes, paliers) partent dans la **devise de l'utilisateur**
  (EUR via le taux du jour, ou USD), plus en dollars bruts ;
- **trois briefs de données par jour**, aux moments qui comptent pour le marché :
  le matin (8 h par défaut, fuseau du service : complet — marché et zone, échéances
  DCA, portefeuille au journal, paliers, alertes armées, actus, fraîcheur de la sync),
  puis l'**ouverture des marchés américains** (9 h 30, New York) et leur **clôture**
  (16 h, New York) sous forme courte (marché, portefeuille, paliers, échéances du
  jour, actus). Heures exactes calculées été comme hiver ; chaque créneau est
  désactivable (`briefUsOpen`, `briefUsClose`). Ce n'est pas le brief IA de l'application ;
- **veille presse** des cryptos suivies (positions du journal + alertes armées, sans
  BTC/ETH ni stablecoins) : flux Google News par crypto, rafraîchi toutes les 45 min ;
  une actu notée importante part en alerte Telegram, **résumée en 3 lignes par Mistral**
  si une clé est configurée (`mistralApiKey`, sinon heuristique de mots-clés), au plus
  3 par cycle et une seule fois par actu.

## Limites connues (voulu ainsi pour cette première version)

- Le runner ne relit pas les wallets blockchain (xpub du Ledger, adresse Phantom) : les
  paliers et la valeur du portefeuille sont calculés **depuis le journal** de
  l'application. Une ligne détenue bien au-delà du journal (chaîne > journa
  d'achat) peut être sous-estimée.
- Le cœur (BTC, ETH) n'a pas de paliers dans Boussole : le runner n'en envoie pas non
  plus.
- Si les notifications de l'application sont AUSSI activées (tray Windows, arrière-plan
  Android) sur un appareil ouvert, un même événement peut arriver deux fois (Telegram +
  notification native). Recommandé : choisir Telegram comme source principale et
  désactiver les notifications dans l'application.
- Le brief Telegram est un état des lieux en données ; le brief IA reste dans
  l'application (la clé du fournisseur d'IA ne quitte pas tes appareils).

## Installation (Ubuntu, user `ubuntu`)

```bash
# 1. Code : le dépôt est privé — clone avec un jeton d'accès GitHub en tête d'URL,
#    ou une clé de déploiement :
git clone https://github.com/Nikola17/boussole-crypto.git ~/boussole-crypto

# 2. Configuration (aucun secret dans le chat — saisis-les directement ici) :
mkdir -p ~/.config/boussole
cp ~/boussole-crypto/runner/runner.json.example ~/.config/boussole/runner.json
chmod 600 ~/.config/boussole/runner.json
nano ~/.config/boussole/runner.json   # remplir § « Secrets » ci-dessous

# 3. Le chat id Telegram (après avoir écrit /start au bot) :
node ~/boussole-crypto/runner/boussole-runner.mjs --discover

# 4. Diagnostic complet à blanc (rien n'est envoyé) :
node ~/boussole-crypto/runner/boussole-runner.mjs --check

# 5. Un vrai cycle (envoie ce qui est dû ; idéal pour valider) :
node ~/boussole-crypto/runner/boussole-runner.mjs --brief

# 6. Service permanent :
sudo cp ~/boussole-crypto/runner/boussole-runner.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now boussole-runner
journalctl -u boussole-runner -f         # suivre les cycles
```

### Secrets (à saisir sur le serveur, jamais dans le chat)

| Champ | Quoi |
|---|---|
| `syncRepo` | dépôt privé de synchronisation, ex. `Nikola17/boussole-sync` (créé côté application) |
| `syncToken` | jeton GitHub **fine-grained**, « Contents : Read and write », limité à CE SEUL dépôt |
| `passphrase` | la même phrase de passe que dans l'application (Réglages → Synchronisation) |
| `telegramToken` | jeton du bot (créé avec @BotFather) |
| `telegramChatId` | ton chat id (obtenu par `--discover`) |
| `coingeckoKey` | clé « Demo » gratuite CoinGecko (facultative mais recommandée) |

Chaque secret peut aussi venir de l'environnement du service :
`BOUSSOLE_SYNC_TOKEN`, `BOUSSOLE_PASSPHRASE`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
`COINGECKO_KEY` (voir `boussole-runner.service`).

### Commandes

```bash
node boussole-runner.mjs                          # boucle permanente
node boussole-runner.mjs --once                   # un seul cycle, en vrai
node boussole-runner.mjs --check                  # à blanc : rien envoyé, rien écrit
node boussole-runner.mjs --brief                  # envoie le brief maintenant
node boussole-runner.mjs --discover               # affiche le chat id
node boussole-runner.mjs --config <chemin>        # autre fichier de config
```

## Mise à jour après une évolution de l'application

```bash
cd ~/boussole-crypto && git pull
sudo systemctl restart boussole-runner
```

Le bundle `boussole-runner.mjs` est versionné avec l'application (aucun build à faire sur
le serveur). Pour le régénérer depuis les sources :
`npm ci && npm run build:runner` (esbuild), mais ce n'est utile que pour développer.

## Sécurité — résumé

- Le fichier de synchronisation est chiffré de bout en bout (AES-GCM 256, PBKDF2
  600 000 itérations) : GitHub n'en voit que du ciphertext, ce serveur ne l'écrit qu'à
  deux moments (consommation d'alerte, avec l'empreinte anti-écrasement).
- Aucun port entrant, aucune base de données, aucun webhook ; requêtes sortantes vers
  api.github.com, api.coingecko.com, api.alternative.me, api.telegram.org.
- `config.json` en chmod 600 ; alternative : secrets en variables d'environnement du
  service. Les journaux n'impriment jamais un secret.
- L'état local (`~/.local/state/boussole/runner-state.json`) ne contient que des dates
  et des clefs de dédoublonnage.
