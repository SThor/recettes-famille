#!/usr/bin/env bash
# Synchronise les recettes dans les deux sens entre le vault Obsidian et le site, via git.
#  1. commite les modifs faites dans Obsidian,
#  2. récupère celles faites sur le site (admin, vérifications, recettes publiées) et rejoue les tiennes par-dessus,
#  3. renvoie le tout au serveur, qui met à jour son dossier aussitôt.
# En cas de conflit (même ligne modifiée des deux côtés), git s'arrête sans rien écraser.
set -euo pipefail

DIR="${RECIPES_DIR:-/c/Users/Paul/obsidian/main/Projets/Livre de recettes pour Maman/Recettes}"
[ -d "$DIR" ] || { echo "Dossier introuvable : $DIR (à lancer depuis Git Bash sur le PC)"; exit 1; }
cd "$DIR"

git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "Obsidian : $(date '+%Y-%m-%d %H:%M')"
  echo "→ Modifs du vault commitées"
fi

if ! git pull -q --rebase origin main; then
  echo
  echo "⚠ Conflit : la même recette a été modifiée dans Obsidian et sur le site."
  echo "  Rien n'est perdu. Dans $DIR :"
  echo "  corrige les fichiers marqués <<<<<<< / >>>>>>>, puis : git add -A && git rebase --continue"
  echo "  (ou git rebase --abort pour revenir en arrière), et relance ce script."
  exit 1
fi

git push -q origin main
echo "✓ Recettes synchronisées ($(git log -1 --format='%h %s'))"
