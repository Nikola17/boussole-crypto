#!/usr/bin/env bash
# Boussole — installe le dashboard web en lecture seule sur le VPS (Ubuntu/Debian).
# Usage : sudo ./setup-dashboard.sh <domaine> <email> [dossier]
#   ex : sudo ./setup-dashboard.sh boussole.example.com toi@example.com /var/www/boussole
#
# Ce script ne contient AUCUN secret : le mot de passe basic-auth est demandé interactivement
# (ou via la variable BOUSSOLE_DASH_USER / BOUSSOLE_DASH_PASS lue hors du dépôt, jamais commitée).
# Le runner écrira status.json (données assainies) dans le dossier servi — règle : ajoute
#   "dashboardDir": "/var/www/boussole"   dans ~/.config/boussole/runner.json (chmod 600)
# ou exporte BOUSSOLE_DASHBOARD_DIR=/var/www/boussole dans l'environnement du service systemd.

set -euo pipefail

DOMAIN="${1:?domaine requis (ex : boussole.example.com)}"
EMAIL="${2:?email requis pour Let's Encrypt}"
DIR="${3:-/var/www/boussole}"
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "==> Installation de nginx + certbot"
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx apache2-utils

mkdir -p "$DIR"
cp "$REPO_DIR/scripts/vps/index.html" "$DIR/index.html"
chmod 644 "$DIR/index.html"

echo "==> Mot de passe d'accès (basic auth) — demandé ici, jamais stocké dans le dépôt"
USER_NAME="${BOUSSOLE_DASH_USER:-boussole}"
if [ -n "${BOUSSOLE_DASH_PASS:-}" ]; then
  htpasswd -cb /etc/nginx/.boussole-htpasswd "$USER_NAME" "$BOUSSOLE_DASH_PASS"
else
  htpasswd -c /etc/nginx/.boussole-htpasswd "$USER_NAME"
fi
chmod 640 /etc/nginx/.boussole-htpasswd

sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s|__DASHBOARD_DIR__|$DIR|g" \
  "$REPO_DIR/scripts/vps/nginx-boussole.conf" > /etc/nginx/sites-available/boussole
ln -sf /etc/nginx/sites-available/boussole /etc/nginx/sites-enabled/boussole
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Certificat HTTPS (Let's Encrypt)"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" || {
  echo "Certbot a échoué (DNS du domaine pas encore propagé ?). Le site reste en HTTP + basic auth."
  echo "Relance : sudo certbot --nginx -d $DOMAIN"
}

echo
echo "==> Terminé. Dashboard : https://$DOMAIN/ (identifiant : $USER_NAME)"
echo "    Le runner doit écrire dans $DIR : ajoute \"dashboardDir\": \"$DIR\" à ~/.config/boussole/runner.json"
echo "    puis : sudo systemctl restart boussole-runner"
echo "    Alternative sans domaine public : servez uniquement sur l'IP Tailscale (listen 100.x.y.z:443)."
