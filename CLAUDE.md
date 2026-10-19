# Recettes de famille

Web app Node/Express du livre de recettes (voir README.md).

## Règles de dev
- **Tests d'abord** : pour toute nouvelle fonctionnalité ou correction, écrire d'abord le(s) test(s) qui échouent (`test/*.test.js`, `node:test`), les lancer pour constater l'échec, puis coder jusqu'à ce qu'ils passent. Pas de fonctionnalité sans test.
- `npm test` doit passer avant tout commit ; `deploy/deploy.sh` relance les tests et annule le déploiement en cas d'échec.
- Tests d'intégration : `test/helpers.js` (`startApp()`) démarre l'app sur un port libre avec un dépôt git de recettes jetable copié depuis `test/fixtures/recettes/`.
- Ne jamais perdre de données : écritures atomiques + commit git pour les recettes ; les propositions sont déplacées (`traitees/`, `archivees/`), jamais supprimées.
- Les recettes ne se déploient pas avec le code : synchro git via `deploy/sync-recettes.sh` (depuis Git Bash sur le PC).

## Économie (limite d'usage de Paul)
« Déployer » = `git push` sur `main` si un workflow GitHub Actions existe, sinon `deploy/deploy.sh` ; dans les deux cas les tests sont relancés.
- **Déployer moins souvent** : regrouper les changements ; déployer en fin de sujet ou quand Paul le demande, pas après chaque retouche. Ne pas lancer `npm test` juste avant un déploiement qui relance déjà les tests.
- **Vérifier sans images d'abord** : texte de la page, structure, styles calculés (`getComputedStyle`) via les outils du navigateur. Capture seulement pour un vrai changement de mise en page, à échelle réduite, pas une par thème si les valeurs mesurées suffisent.
- **Page de test des composants** (à créer si absente) : elle affiche les composants dans les trois thèmes ; l'utiliser autant que possible pour valider les changements graphiques (composants, règles de style), et n'en capturer que les parties modifiées.
- **Sorties courtes** : filtrer la sortie des tests (`grep` sur le résumé) ; ne relire d'un fichier que la partie utile.
- **Sessions courtes** : une session par sujet ; ce fichier et la mémoire suffisent pour reprendre.
- Ne pas rouvrir les décisions déjà prises (voir README.md).
