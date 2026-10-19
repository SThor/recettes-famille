# Recettes de famille

Petite web app mobile-first pour le livre de recettes de la famille : liste et affiche les recettes Cooklang (`.cook`) du vault Obsidian, et permet à la famille d'en proposer « à l'arrache » (texte libre + photos), mises au propre ensuite.

- Node + Express, rendu côté serveur, aucun build front. Parseur Cooklang maison (`src/cooklang.js`) : en-tête YAML, `@ingrédients`, `#ustensiles`, `~minuteurs`, notes `>`, commentaires `--`.
- Source des recettes : le dossier `Recettes/` du vault (sans `Archives/`). Photo du plat = image du même nom à côté du `.cook` ; fiches d'origine via la propriété `original`.
- Accès réservé à la famille ; réglages dans `.env` (voir `.env.example`).
- Dépôts : `data/a-moderer/<date>/` (un `.md`, un `recette.json`, les photos). Une fois traités : `data/traitees/` ou `data/archivees/` (jamais supprimés).
- Administration : propositions → `.cook` (éditeur avec aperçu, rôle de chaque photo), suivi des recettes (case « vérifiée » → `checked by: <prénom> <date>`), liste `À demander.md`, historique git.
- Relecture par la famille (page recette, colonne de droite) : connexion avec prénom, réponses aux questions (écrites dans le commentaire `--` : « ↳ Prénom : … »), case « Conforme à l'original », « Il y a une erreur ? ».
- Clés d'en-tête des personnes : `author` = la personne dont c'est la recette (« Recette de », clé standard Cooklang), `shared by` = qui l'a transmise si c'est quelqu'un d'autre (« Transmise par »), `source` = livre, magazine, fiche. Vérification : `checked by: <prénom> <date>`.
- Styles d'essai : `/essais/simple`, `/essais/pastel`, `/essais/vichy` (cookie, s'applique à tout le site).

## Local

```bash
npm install
RECIPES_DIR="<vault>/Recettes" npm run dev
```

## Tests

```bash
npm test
```

`node:test`, sans dépendance. Unitaires (parseur Cooklang, `À demander.md`, en-tête YAML), intégration HTTP sur un dépôt git jetable (accès, admin, éditeur, propositions, conflits), et script de synchro (fusion, conflit). GitHub Actions les lance à chaque push (et `deploy/deploy.sh` avant un déploiement manuel). Règle : on écrit les tests avant la fonctionnalité (voir CLAUDE.md).

## Recettes : synchro git dans les deux sens

Le dossier `Recettes/` du vault et `~/recettes-famille/recettes` sur le VPS sont deux copies d'un même dépôt git (branche `main`).

- Sur le VPS, le dépôt accepte les pushes directement dans son dossier (`receive.denyCurrentBranch=updateInstead`). Chaque écriture du site y est commitée aussitôt (auteur : `<prénom> (site)`), donc le dossier reste propre.
- Dans le vault, `deploy/sync-recettes.sh` commite les modifs locales, fait `git pull --rebase` (récupère celles du site) puis `git push`. En cas de conflit, il s'arrête sans rien écraser.
- Remote du vault : `origin = vps-touco:recettes-famille/recettes` (alias SSH dans `~/.ssh/config`).

## Propositions de la famille → vault

```bash
deploy/recuperer-propositions.sh   # depuis Git Bash sur le PC
```

Télécharge les propositions en attente (`data/a-moderer/`) et crée pour chacune `Propositions/<date> - <titre>/` dans le vault (note Obsidian `type: proposition` + photos), hors du dépôt git des recettes. Un dossier déjà présent n'est jamais écrasé. Les propositions récupérées sont rangées côté serveur dans `data/importees/` (listées à part dans l'administration). L'agent du vault les met ensuite au propre en `.cook`, puis `sync-recettes.sh` publie.

## VPS

`recettes.touco.top` → nginx → conteneur Docker sur `127.0.0.1:8081`. Dans `~/recettes-famille` : `.env` (non versionné), `recettes/` (dépôt git, monté en écriture), `data/` (propositions).

Déployer le code = `git push` sur `main` (dépôt public `SThor/recettes-famille`) : `.github/workflows/deploy.yml` lance les tests puis, s'ils passent, envoie l'archive du code (`deploy/archive-code.sh`) par SSH au VPS, où `~/bin/recettes-deploy.sh` (copie de `deploy/vps-recevoir.sh`) la décompresse et reconstruit le conteneur. La clé SSH de GitHub est dédiée et limitée à ce script (`restrict,command=` dans `authorized_keys`). Secrets du dépôt : `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS`.

```bash
deploy/deploy.sh          # secours : déploiement manuel du code (--skip-tests ; tests sautés s'ils ont déjà passé sur ce commit)
deploy/sync-recettes.sh   # recettes, dans les deux sens
```

Nginx : `~/infra-docs/nginx/recettes-famille` (HTTPS Certbot).
