const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createApp } = require('../src/app');

const FIXTURES = path.join(__dirname, 'fixtures', 'recettes');
const ADMIN = 'admin-test';
const FAMILY = 'famille-test';

// Git for Windows active core.fsmonitor par défaut : `git add` lance alors un démon qui garde parfois
// la sortie ouverte, et execFileSync attend indéfiniment (blocage intermittent des tests). On le coupe
// pour tous les git lancés pendant les tests (helpers, app, scripts shell testés).
Object.assign(process.env, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'false' });

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// Diagnostic : TRACE_TESTS=<fichier> trace chaque étape du démarrage / de l'arrêt de l'app de test.
const trace = process.env.TRACE_TESTS
  ? msg => fs.appendFileSync(process.env.TRACE_TESTS, `${new Date().toISOString()} ${process.pid} ${path.basename(process.argv[1] || '')} ${msg}\n`)
  : () => {};

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
  trace(`start ${root}`);
  const recipesDir = makeRecipesRepo(root);
  trace('repo ok');
  const submissionsDir = path.join(root, 'data', 'a-moderer');
  const { app, init } = createApp({
    RECIPES_DIR: recipesDir, SUBMISSIONS_DIR: submissionsDir,
    FAMILY_PASSWORD: FAMILY, ADMIN_PASSWORD: ADMIN, SESSION_SECRET: 'secret-test',
  });
  await init();
  trace('init ok');
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  trace('listen ok');
  const base = `http://127.0.0.1:${server.address().port}`;

  const adminAuth = (user = 'Paul') => ({ Authorization: 'Basic ' + Buffer.from(`${user}:${ADMIN}`).toString('base64') });
  const req = (url, opts = {}) => fetch(base + url, { redirect: 'manual', ...opts });
  const admin = (url, opts = {}) => req(url, { ...opts, headers: { ...adminAuth(opts.user), ...opts.headers } });
  const form = data => new URLSearchParams(data);

  return {
    root, recipesDir, submissionsDir, base, init, req, admin, form, adminAuth,
    read: f => fs.readFileSync(path.join(recipesDir, f), 'utf8'),
    log: (n = 1) => git(recipesDir, 'log', `-${n}`, '--format=%an|%s'),
    status: () => git(recipesDir, 'status', '--porcelain'),
    close: () => new Promise(r => {
      trace('close start');
      server.close(() => {
        trace('server closed');
        // Sous Windows, un fichier encore ouvert (antivirus, git) peut faire échouer la suppression (EBUSY) :
        // on réessaie, et la fermeture se termine dans tous les cas (sinon le test resterait bloqué).
        try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
        catch (err) { console.warn(`Dossier de test non supprimé (${err.code}) : ${root}`); }
        trace('rm done');
        r();
      });
      server.closeAllConnections(); // fetch garde les connexions ouvertes (keep-alive)
    }),
  };
}

module.exports = { startApp, makeRecipesRepo, git, FAMILY, ADMIN };
