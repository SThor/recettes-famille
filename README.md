# Recettes de famille

Petite web app mobile-first pour le livre de recettes de la famille : liste et affiche les recettes Cooklang (`.cook`) du vault Obsidian, et permet à la famille d'en proposer « à l'arrache » (texte libre + photos), mises au propre ensuite.

- Node + Express, rendu côté serveur, aucun build front. Parseur Cooklang maison (`src/cooklang.js`) : en-tête YAML, `@ingrédients`, `#ustensiles`, `~minuteurs`, notes `>`, commentaires `--`.
- Source des recettes : le dossier `Recettes/` du vault (sans `Archives/`). Photo du plat = image du même nom à côté du `.cook` ; fiches d'origine via la propriété `original`.
- Accès réservé à la famille ; réglages dans `.env` (voir `.env.example`).
- Dépôts : `data/a-moderer/<date>/` (un `.md`, un `recette.json`, les photos).
- Styles d'essai : `/essais/simple`, `/essais/pastel`, `/essais/vichy` (cookie, s'applique à tout le site).

## Local

```bash
npm install
RECIPES_DIR="<vault>/Recettes" npm run dev
```

## VPS

`recettes.touco.top` → nginx → conteneur Docker sur `127.0.0.1:8081`. Code dans `~/recettes-famille`, avec `.env` (non versionné), `recettes/` (copie des `.cook`) et `data/` (dépôts).

```bash
deploy/deploy.sh            # code + recettes, rebuild
deploy/deploy.sh recettes   # recettes seulement, sans redémarrage
```

Nginx : `deploy/nginx-recettes-famille`, à copier dans `~/infra-docs/nginx/` et lier comme les autres sites, puis `sudo certbot --nginx -d recettes.touco.top`.
