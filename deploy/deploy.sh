#!/usr/bin/env bash
# Déploie le code de l'app sur le VPS et reconstruit le conteneur.
# Les recettes ne passent PAS par ici : elles se synchronisent avec git (deploy/sync-recettes.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${DEPLOY_HOST:-vps-touco}"
REMOTE="recettes-famille"

echo "→ Code vers $HOST:~/$REMOTE"
tar -czf - package.json package-lock.json Dockerfile .dockerignore docker-compose.yml .env.example src public deploy \
  | ssh "$HOST" "mkdir -p ~/$REMOTE/data && tar -xzf - -C ~/$REMOTE"

echo "→ Build et redémarrage"
ssh "$HOST" "cd ~/$REMOTE && sudo docker compose up -d --build && sudo docker image prune -f >/dev/null"
echo "✓ Fait"
