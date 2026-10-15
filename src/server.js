const path = require('path');
const { createApp } = require('./app');

const {
  PORT = 8081,
  RECIPES_DIR = path.join(__dirname, '..', 'recettes'),
  SUBMISSIONS_DIR = path.join(__dirname, '..', 'data', 'a-moderer'),
  FAMILY_PASSWORD = '',
  ADMIN_PASSWORD = '',
  SESSION_SECRET = 'dev',
} = process.env;

const { app, store, git } = createApp({ RECIPES_DIR, SUBMISSIONS_DIR, FAMILY_PASSWORD, ADMIN_PASSWORD, SESSION_SECRET });

git.init().catch(err => console.error('git :', err.message));

app.listen(PORT, () => {
  console.log(`Recettes de la Givellerie sur http://localhost:${PORT} — ${store.all().length} recettes dans ${RECIPES_DIR}`);
  if (!FAMILY_PASSWORD) console.warn('FAMILY_PASSWORD vide : le site est ouvert à tous.');
});
