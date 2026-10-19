#!/usr/bin/env bash
# Déploiement manuel de secours (le déploiement normal = git push sur main, voir .github/workflows/deploy.yml).
# Déploie le code de l'app sur le VPS et reconstruit le conteneur.
# Les recettes ne passent PAS par ici : elles se synchronisent avec git (deploy/sync-recettes.sh).
# Les tests sont relancés, sauf avec --skip-tests ou s'ils ont déjà passé sur ce commit (arbre propre).
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${DEPLOY_HOST:-vps-touco}"
STAMP="$(git rev-parse --git-path recettes-tests-ok)"
COMMIT=""
[ -z "$(git status --porcelain --untracked-files=no)" ] && COMMIT="$(git rev-parse HEAD)"

if [ "${1:-}" = "--skip-tests" ]; then
  echo "→ Tests sautés (--skip-tests)"
elif [ -n "$COMMIT" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$COMMIT" ]; then
  echo "→ Tests déjà passés sur ${COMMIT:0:7}"
else
  echo "→ Tests"
  npm test --silent > /tmp/recettes-tests.log 2>&1 || { tail -40 /tmp/recettes-tests.log; echo "✖ Tests en échec : déploiement annulé."; exit 1; }
  [ -n "$COMMIT" ] && echo "$COMMIT" > "$STAMP"
fi

echo "→ Code vers $HOST, build et redémarrage"
deploy/archive-code.sh | ssh "$HOST" "~/bin/recettes-deploy.sh"
