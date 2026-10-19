#!/usr/bin/env bash
# Sur le VPS, installé dans ~/bin/recettes-deploy.sh (hors du dossier déployé).
# Commande forcée de la clé de déploiement GitHub (authorized_keys : restrict,command="..."), aussi utilisée par deploy.sh.
# Reçoit sur l'entrée standard l'archive de deploy/archive-code.sh, la décompresse dans ~/recettes-famille
# (seulement les entrées attendues) et reconstruit le conteneur.
set -euo pipefail
DEST="$HOME/recettes-famille"
mkdir -p "$DEST/data"
tar -xzf - -C "$DEST" --no-same-owner \
  package.json package-lock.json Dockerfile .dockerignore docker-compose.yml .env.example src public deploy
cd "$DEST"
sudo docker compose up -d --build
sudo docker image prune -f >/dev/null
echo "✓ Déployé"
