# Recettes de famille

Petite web app mobile-first pour le livre de recettes de la famille : liste et affiche les recettes Cooklang (`.cook`) du vault Obsidian, et permet à la famille d'en proposer « à l'arrache » (texte libre + photos), mises au propre ensuite.

- Node + Express, rendu côté serveur, aucun build front. Parseur Cooklang maison (`src/cooklang.js`) : en-tête YAML, `@ingrédients`, `#ustensiles`, `~minuteurs`, notes `>`, commentaires `--`.
- Source des recettes : le dossier `Recettes/` du vault (sans `Archives/`). Photo du plat = image du même nom à côté du `.cook` ; fiches d'origine via la propriété `original`.
- Accès réservé à la famille ; réglages dans `.env` (voir `.env.example`).
- Dépôts : `data/a-moderer/<date>/` (un `.md`, un `recette.json`, les photos). Une fois traités : `data/traitees/` ou `data/archivees/` (jamais supprimés).
- Administration : propositions → `.cook` (éditeur avec aperçu, rôle de chaque photo), suivi des recettes (case « vérifiée » → `verifie: <prénom> <date>`), liste `À demander.md`, historique git.
- Styles d'essai : `/essais/simple`, `/essais/pastel`, `/essais/vichy` (cookie, s'applique à tout le site).

## Local

```bash
npm install
RECIPES_DIR="<vault>/Recettes" npm run dev
```

## Recettes : synchro git dans les deux sens

Le dossier `Recettes/` du vault et `~/recettes-famille/recettes` sur le VPS sont deux copies d'un même dépôt git (branche `main`).

- Sur le VPS, le dépôt accepte les pushes directement dans son dossier (`receive.denyCurrentBranch=updateInstead`). Chaque écriture du site y est commitée aussitôt (auteur : `<prénom> (site)`), donc le dossier reste propre.
- Dans le vault, `deploy/sync-recettes.sh` commite les modifs locales, fait `git pull --rebase` (récupère celles du site) puis `git push`. En cas de conflit, il s'arrête sans rien écraser.
- Remote du vault : `origin = vps-touco:recettes-famille/recettes` (alias SSH dans `~/.ssh/config`).

## VPS

`recettes.touco.top` → nginx → conteneur Docker sur `127.0.0.1:8081`. Dans `~/recettes-famille` : `.env` (non versionné), `recettes/` (dépôt git, monté en écriture), `data/` (propositions).

```bash
deploy/deploy.sh          # code seulement, rebuild du conteneur
deploy/sync-recettes.sh   # recettes, dans les deux sens
```

Nginx : `~/infra-docs/nginx/recettes-famille` (HTTPS Certbot).
