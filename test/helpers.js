const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createApp } = require('../src/app');

const FIXTURES = path.join(__dirname, 'fixtures', 'recettes');
const ADMIN = 'admin-test';
const FAMILY = 'famille-test';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// Dépôt de recettes temporaire, initialisé comme sur le serveur.
function makeRecipesRepo(root) {
  const dir = path.join(root, 'recettes');
  fs.cpSync(FIXTURES, dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'Site recettes'], ['user.email', 'site@test'], ['core.autocrlf', 'false'], ['core.quotepath', 'false'], ['receive.denyCurrentBranch', 'updateInstead']]) git(dir, 'config', k, v);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'Import');
  return dir;
}

// Démarre l'app sur un port libre, avec un dossier de travail jetable.
async function startApp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recettes-test-'));
  const recipesDir = makeRecipesRepo(root);
  const submissionsDir = path.join(root, 'data', 'a-moderer');
  const { app, git: appGit } = createApp({
    RECIPES_DIR: recipesDir, SUBMISSIONS_DIR: submissionsDir,
    FAMILY_PASSWORD: FAMILY, ADMIN_PASSWORD: ADMIN, SESSION_SECRET: 'secret-test',
  });
  await appGit.init();
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const adminAuth = (user = 'Paul') => ({ Authorization: 'Basic ' + Buffer.from(`${user}:${ADMIN}`).toString('base64') });
  const req = (url, opts = {}) => fetch(base + url, { redirect: 'manual', ...opts });
  const admin = (url, opts = {}) => req(url, { ...opts, headers: { ...adminAuth(opts.user), ...opts.headers } });
  const form = data => new URLSearchParams(data);

  return {
    root, recipesDir, submissionsDir, base, req, admin, form, adminAuth,
    read: f => fs.readFileSync(path.join(recipesDir, f), 'utf8'),
    log: (n = 1) => git(recipesDir, 'log', `-${n}`, '--format=%an|%s'),
    status: () => git(recipesDir, 'status', '--porcelain'),
    close: () => new Promise(r => {
      server.close(() => { fs.rmSync(root, { recursive: true, force: true }); r(); });
      server.closeAllConnections(); // fetch garde les connexions ouvertes (keep-alive)
    }),
  };
}

module.exports = { startApp, makeRecipesRepo, git, FAMILY, ADMIN };
