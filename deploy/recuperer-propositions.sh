#!/usr/bin/env bash
# Récupère les recettes proposées par la famille (formulaire « Proposer » du site) dans le vault Obsidian,
# pour que l'agent du vault les mette au propre en Cooklang. À lancer depuis Git Bash sur le PC.
#  1. télécharge les propositions en attente (serveur : data/a-moderer/),
#  2. crée pour chacune « Propositions/<date> - <titre>/ » dans le vault : note .md + photos
#     (hors du dépôt git des recettes ; un dossier déjà présent n'est jamais écrasé),
#  3. range côté serveur les propositions récupérées dans data/importees/ (rien n'est supprimé).
set -euo pipefail
cd "$(dirname "$0")"

SSH="${PROPOSITIONS_SSH:-ssh vps-touco}"
DATA="${PROPOSITIONS_DATA:-recettes-famille/data}"
DEST="${PROPOSITIONS_DEST:-/c/Users/Paul/obsidian/main/Projets/Livre de recettes pour Maman/Propositions}"
TAR="tar --force-local"   # « C:/… » n'est pas un hôte distant

remote() { $SSH "$1"; }
q() { printf "'%s'" "${1//\'/\'\\\'\'}"; }   # protège un chemin pour la commande distante

ids=$(remote "ls -1 $(q "$DATA")/a-moderer 2>/dev/null || true")
if [ -z "$ids" ]; then
  echo "Aucune proposition en attente."
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
# Téléchargement de toutes les propositions en attente, d'un coup
remote "cd $(q "$DATA")/a-moderer && tar -cf - ." | $TAR -xf - -C "$work"

mkdir -p "$DEST"
count=0
for id in $ids; do
  [ -f "$work/$id/recette.json" ] || { echo "⚠ $id : incomplète, ignorée"; continue; }
  result=$(node proposition-md.js "$work/$id" "$DEST")
  case "$result" in
    importee*) echo "✓ ${result#importee }"; count=$((count + 1)) ;;
    deja-present*) echo "• ${result#deja-present } (déjà dans le vault, non écrasé)" ;;
    demande*) echo "· ${result#demande } : demande sans contenu, à rédiger dans l'admin (laissée sur le site)"; continue ;;
  esac
  # La copie est faite (ou était déjà là) : on range la proposition côté serveur.
  remote "mkdir -p $(q "$DATA")/importees && mv $(q "$DATA/a-moderer/$id") $(q "$DATA/importees/$id")"
done

if [ "$count" -eq 1 ]; then echo "1 proposition récupérée dans : $DEST"
else echo "$count propositions récupérées dans : $DEST"; fi
