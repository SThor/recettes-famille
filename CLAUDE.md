# Recettes de famille

Web app Node/Express du livre de recettes (voir README.md).

## Règles de dev
- **Tests d'abord** : pour toute nouvelle fonctionnalité ou correction, écrire d'abord le(s) test(s) qui échouent (`test/*.test.js`, `node:test`), les lancer pour constater l'échec, puis coder jusqu'à ce qu'ils passent. Pas de fonctionnalité sans test.
- `npm test` doit passer avant tout commit ; `deploy/deploy.sh` relance les tests et annule le déploiement en cas d'échec.
- Tests d'intégration : `test/helpers.js` (`startApp()`) démarre l'app sur un port libre avec un dépôt git de recettes jetable copié depuis `test/fixtures/recettes/`.
- Ne jamais perdre de données : écritures atomiques + commit git pour les recettes ; les propositions sont déplacées (`traitees/`, `archivees/`), jamais supprimées.
- Les recettes ne se déploient pas avec le code : synchro git via `deploy/sync-recettes.sh` (depuis Git Bash sur le PC).
