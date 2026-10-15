#!/usr/bin/env bash
# Déploie l'app et/ou les recettes sur le VPS.
#   deploy/deploy.sh            → code + recettes, puis rebuild du conteneur
#   deploy/deploy.sh recettes   → recettes seulement (pris en compte en ~5 s, sans redémarrage)
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${DEPLOY_HOST:-vps-touco}"
REMOTE="recettes-famille"
RECIPES_SRC="${RECIPES_SRC:-/c/Users/Paul/obsidian/main/Projets/Livre de recettes pour Maman/Recettes}"
[ -d "$RECIPES_SRC" ] || RECIPES_SRC="/mnt/c/Users/Paul/obsidian/main/Projets/Livre de recettes pour Maman/Recettes"

sync_recipes() {
  echo "→ Recettes depuis $RECIPES_SRC"
  # Tout sauf les archives ; on remplace le dossier pour propager les suppressions.
  tar -C "$RECIPES_SRC" --exclude=Archives -czf - . \
    | ssh "$HOST" "rm -rf ~/$REMOTE/recettes.new && mkdir -p ~/$REMOTE/recettes.new && tar -xzf - -C ~/$REMOTE/recettes.new \
        && rm -rf ~/$REMOTE/recettes.old && { [ -d ~/$REMOTE/recettes ] && mv ~/$REMOTE/recettes ~/$REMOTE/recettes.old || true; } \
        && mv ~/$REMOTE/recettes.new ~/$REMOTE/recettes && rm -rf ~/$REMOTE/recettes.old"
}

if [ "${1:-}" != "recettes" ]; then
  echo "→ Code vers $HOST:~/$REMOTE"
  tar -czf - package.json package-lock.json Dockerfile .dockerignore docker-compose.yml .env.example src public deploy \
    | ssh "$HOST" "mkdir -p ~/$REMOTE/data && tar -xzf - -C ~/$REMOTE"
fi

sync_recipes

if [ "${1:-}" != "recettes" ]; then
  echo "→ Build et redémarrage"
  ssh "$HOST" "cd ~/$REMOTE && sudo docker compose up -d --build && sudo docker image prune -f >/dev/null"
fi
echo "✓ Fait"
