const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createStore, slugify } = require('./recipes');
const views = require('./views');
const { createGit } = require('./git');
const adminRouter = require('./admin');

const {
  PORT = 8081,
  RECIPES_DIR = path.join(__dirname, '..', 'recettes'),
  SUBMISSIONS_DIR = path.join(__dirname, '..', 'data', 'a-moderer'),
  FAMILY_PASSWORD = '',
  ADMIN_PASSWORD = '',
  SESSION_SECRET = 'dev',
} = process.env;

const store = createStore(RECIPES_DIR);
const git = createGit(RECIPES_DIR);
const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');

// --- Cookies (pas besoin d'une dépendance pour deux valeurs) ---
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)).filter(c => c[0]));
}
const YEAR = 365 * 24 * 3600 * 1000;
const cookieOpts = req => ({ maxAge: YEAR, httpOnly: true, sameSite: 'lax', secure: req.secure });
const familyToken = () => crypto.createHmac('sha256', SESSION_SECRET).update('famille:' + FAMILY_PASSWORD).digest('hex');
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

app.use((req, res, next) => {
  const c = cookies(req);
  req.theme = views.THEMES[c.theme] ? c.theme : 'simple';
  req.isFamily = !FAMILY_PASSWORD || safeEqual(c.famille || '', familyToken());
  next();
});

app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

// --- Accès famille : mot de passe partagé, ou lien secret /entrer?cle=... ---
function enter(req, res) {
  res.cookie('famille', familyToken(), cookieOpts(req));
  res.redirect('/');
}
app.get('/connexion', (req, res) => res.send(views.login({ theme: req.theme })));
app.post('/connexion', express.urlencoded({ extended: false }), (req, res) => {
  if (FAMILY_PASSWORD && safeEqual(String(req.body.motdepasse || '').trim(), FAMILY_PASSWORD)) return enter(req, res);
  res.status(401).send(views.login({ theme: req.theme, error: 'Ce n\'est pas le bon mot de passe.' }));
});
app.get('/entrer', (req, res) => {
  if (FAMILY_PASSWORD && safeEqual(String(req.query.cle || ''), FAMILY_PASSWORD)) return enter(req, res);
  res.redirect('/connexion');
});

// Revient sur la page d'où l'on vient (même site uniquement), sinon à l'accueil.
function backTo(req) {
  try {
    const ref = new URL(req.get('referer'));
    if (ref.host === req.get('host') && !ref.pathname.startsWith('/essais')) return ref.pathname + ref.search + ref.hash;
  } catch {}
  return '/';
}

// Styles d'essai : accessibles sans connexion pour pouvoir les comparer.
app.get('/essais', (req, res) => res.send(views.essais({ theme: req.theme })));
app.get('/essais/:theme', (req, res) => {
  if (!views.THEMES[req.params.theme]) return res.redirect('/essais');
  res.cookie('theme', req.params.theme, { ...cookieOpts(req), httpOnly: false });
  res.redirect(backTo(req));
});

// --- Suivi / modération (mot de passe admin, en Basic Auth) ---
app.use('/admin', adminRouter({ store, git, dataDir: path.dirname(SUBMISSIONS_DIR), adminPassword: ADMIN_PASSWORD, safeEqual }));
app.get('/moderation', (req, res) => res.redirect('/admin'));

// --- Tout le reste est réservé à la famille ---
app.use((req, res, next) => (req.isFamily ? next() : res.redirect('/connexion')));

app.get('/', (req, res) => res.send(views.home({ groups: store.grouped(), theme: req.theme })));

app.get('/recette/:slug', (req, res) => {
  const r = store.get(req.params.slug);
  if (!r) return res.status(404).send(views.notFound({ theme: req.theme }));
  res.send(views.recipe({ r, theme: req.theme }));
});

app.get('/photos/*', (req, res) => {
  const full = store.imagePath(req.params[0]);
  if (!full) return res.sendStatus(404);
  res.sendFile(full, { maxAge: '1d' });
});

// --- Dépôt de recettes « à l'arrache » ---
const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      fs.mkdirSync(req.submissionDir, { recursive: true });
      cb(null, req.submissionDir);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
      req.photoCount = (req.photoCount || 0) + 1;
      cb(null, `photo-${req.photoCount}${ext}`);
    },
  }),
  limits: { files: 12, fileSize: 25 * 1024 * 1024, fields: 10, fieldSize: 100 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

app.get('/proposer', (req, res) => res.send(views.proposeForm({ theme: req.theme })));
app.post('/proposer',
  (req, res, next) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    req.submissionId = `${stamp}-${crypto.randomBytes(3).toString('hex')}`;
    req.submissionDir = path.join(SUBMISSIONS_DIR, req.submissionId);
    next();
  },
  (req, res) => upload.array('photos')(req, res, err => {
    const values = req.body || {};
    const fail = msg => {
      fs.rmSync(req.submissionDir, { recursive: true, force: true });
      res.status(400).send(views.proposeForm({ theme: req.theme, error: msg, values }));
    };
    if (err) return fail(err.code === 'LIMIT_FILE_SIZE' ? 'Une des photos est trop lourde (25 Mo max).' : 'L\'envoi n\'a pas marché, réessaie.');
    const prenom = String(values.prenom || '').trim();
    const titre = String(values.titre || '').trim();
    const texte = String(values.texte || '').trim();
    const photos = (req.files || []).map(f => f.filename);
    if (!prenom || !titre) return fail('Il manque ton prénom ou le nom de la recette.');
    if (!texte && !photos.length) return fail('Écris la recette ou ajoute au moins une photo.');

    fs.mkdirSync(req.submissionDir, { recursive: true });
    const info = { prenom, titre, texte, anecdote: String(values.anecdote || '').trim(), photos, date: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) };
    fs.writeFileSync(path.join(req.submissionDir, 'recette.json'), JSON.stringify(info, null, 2));
    fs.writeFileSync(path.join(req.submissionDir, `${slugify(titre) || 'recette'}.md`),
      `# ${titre}\n\nProposée par ${prenom}, le ${info.date}\n\n${texte}\n${info.anecdote ? `\n> ${info.anecdote.replace(/\n/g, '\n> ')}\n` : ''}${photos.length ? `\nPhotos : ${photos.join(', ')}\n` : ''}`);
    console.log(`Nouvelle recette proposée : « ${titre} » par ${prenom} (${req.submissionId})`);
    res.send(views.thanks({ theme: req.theme, prenom }));
  }));

app.use((req, res) => res.status(404).send(views.notFound({ theme: req.theme })));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(views.layout({ title: 'Erreur', theme: req.theme, body: `<section class="form-page"><h1>Oups</h1><p class="error">${views.esc(err.message)}</p><p>Rien n'a été perdu : reviens en arrière pour réessayer.</p></section>` }));
});

git.init().catch(err => console.error('git :', err.message));

app.listen(PORT, () => {
  console.log(`Recettes de famille sur http://localhost:${PORT} — ${store.all().length} recettes dans ${RECIPES_DIR}`);
  if (!FAMILY_PASSWORD) console.warn('FAMILY_PASSWORD vide : le site est ouvert à tous.');
});
