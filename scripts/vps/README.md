# Dashboard web du VPS (lecture seule)

Le runner écrit toutes les 5 minutes un fichier `status.json` **assaini** (aucun secret : voir
`src/runner/dashboard.ts` — seuls des champs énumérés y figurent) dans `dashboardDir`.
nginx sert ce dossier en HTTPS + basic auth, sur un domaine (Let's Encrypt) ou uniquement sur Tailscale.

## Installation (sur le VPS, une fois)

```bash
cd ~/boussole-crypto
sudo ./scripts/vps/setup-dashboard.sh boussole.example.com toi@example.com /var/www/boussole
# puis dans ~/.config/boussole/runner.json (chmod 600, hors dépôt) :
#   "dashboardDir": "/var/www/boussole"
sudo systemctl restart boussole-runner
```

## Ce qui est exposé (et c'est tout)

- état du runner (ok/erreur), alertes armées, zone de marché, Fear & Greed, température, BTC
- prochains déblocages suivis (J-x)
- dernier brief par créneau, fraîcheur de la synchronisation

**Jamais** : tokens, phrase de passe, chat id Telegram, contenu du faisceau chiffré, clés API.
Le test `src/runner/dashboard.test.ts` vérifie que seules ces clés figurent dans le JSON.

## Sans domaine public

Remplacez le bloc nginx par un `listen 100.x.y.z:443 ssl;` (IP Tailscale du VPS) : le dashboard
n'est alors joignable que depuis vos appareils connectés au tailnet. Le certificat peut rester
Let's Encrypt (DNS) ou un certificat Tailscale (`tailscale cert`).

## Fichiers

- `nginx-boussole.conf` — template de site (placeholders `__DOMAIN__`, `__DASHBOARD_DIR__`)
- `index.html` — page statique qui lit `status.json` (actualisation 60 s)
- `setup-dashboard.sh` — installation nginx + certbot + htpasswd (aucun secret en dur)
