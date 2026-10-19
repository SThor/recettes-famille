const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createStore, slugify, normValue, asList, peopleOf } = require('./recipes');
const views = require('./views');
const { createGit } = require('./git');
const adminRouter = require('./admin');
const { fontsRouter } = require('./fonts');
const { answerQuestion, reportError, cleanName, REVIEW_STATES, reviewStateOf } = require('./revue');
const { setField } = require('./frontmatter');
const { writeAtomic, today } = require('./files');


// Construit l'application (sans l'écouter) : utilisé par server.js et par les tests.
function createApp({
  RECIPES_DIR,
  SUBMISSIONS_DIR,
  FAMILY_PASSWORD = '',
  ADMIN_PASSWORD = '',
  SESSION_SECRET = 'dev',
}) {
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
    // Prénom donné à la connexion (ou dans un formulaire) : signe les réponses, vérifications, signalements.
    req.prenom = cleanName(c.prenom);
    req.account = req.isFamily ? { prenom: req.prenom } : null;
    next();
  });

  app.use('/static/fonts', fontsRouter());
  app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

  // --- Accès famille : mot de passe partagé, ou lien secret /entrer?cle=... ---
  function enter(req, res) {
    res.cookie('famille', familyToken(), cookieOpts(req));
    res.redirect('/');
  }
  const rememberName = (req, res, prenom) => res.cookie('prenom', prenom, cookieOpts(req));
  app.get('/connexion', (req, res) => res.send(views.login({ theme: req.theme })));
  app.post('/connexion', express.urlencoded({ extended: false }), (req, res) => {
    const prenom = cleanName(req.body.prenom);
    if (!(FAMILY_PASSWORD && safeEqual(String(req.body.motdepasse || '').trim(), FAMILY_PASSWORD))) {
      return res.status(401).send(views.login({ theme: req.theme, prenom, error: 'Ce n\'est pas le bon mot de passe.' }));
    }
    if (!prenom) return res.status(400).send(views.login({ theme: req.theme, error: 'Indique ton prénom : il signe tes réponses et tes vérifications.' }));
    rememberName(req, res, prenom);
    enter(req, res);
  });
  // Déconnexion (appareil partagé, couple…) : on oublie l'accès et le prénom.
  app.post('/deconnexion', (req, res) => {
    const { maxAge, ...opts } = cookieOpts(req);
    res.clearCookie('famille', opts);
    res.clearCookie('prenom', opts);
    res.redirect('/connexion');
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
  app.get('/essais', (req, res) => res.send(views.essais({ theme: req.theme, account: req.account })));
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

  // Accueil, éventuellement filtré sur une étiquette (?tag=…) et/ou un régime (?regime=…),
  // comparaisons sans casse ni espaces superflus.
  // + durée maximum (?duree=minutes), sur le temps total ou sur la préparation seule (?temps=prep).
  app.get('/', (req, res) => {
    const param = name => (typeof req.query[name] === 'string' ? req.query[name].trim() : '');
    // Étiquettes : ?tag=a&tag=b → recettes qui ont toutes ces étiquettes (doublons et casse ignorés).
    const selectedTags = [];
    for (const v of [].concat(req.query.tag || [])) {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s && !selectedTags.some(x => normValue(x) === normValue(s))) selectedTags.push(s);
    }
    const regime = param('regime');
    const personne = param('personne');
    const relecture = REVIEW_STATES.some(([k]) => k === param('relecture')) ? param('relecture') : '';
    const duree = /^\d{1,4}$/.test(param('duree')) && Number(param('duree')) > 0 ? Number(param('duree')) : null;
    const temps = param('temps') === 'prep' ? 'prep' : 'total';
    const has = (values, wanted) => values.some(x => normValue(x) === normValue(wanted));
    const base = r => selectedTags.every(tg => has(r.tags, tg)) && (!regime || has(asList(r.meta.diet), regime)) && (!personne || has(peopleOf(r), personne))
      && (!relecture || reviewStateOf(r) === relecture);
    const minutes = r => (temps === 'prep' ? r.durations.prep : r.durations.total);
    // Les recettes hors durée restent dans la page, masquées : le curseur peut les réafficher en direct.
    const groups = store.grouped(base);
    const fits = r => !duree || (minutes(r) != null && minutes(r) <= duree);
    // Recettes écartées faute de durée renseignée (signalées sous le bandeau).
    const unknown = duree ? store.all().filter(r => base(r) && minutes(r) == null).length : 0;
    // Paramètres de filtre actuels, dans l'ordre de l'URL (pour construire les liens).
    // (une clé répétée, comme tag, donne une entrée par valeur)
    const params = Object.entries(req.query).flatMap(([k, v]) => [].concat(v).map(x => [k, x]))
      .filter(([k, v]) => ['tag', 'regime', 'personne', 'relecture', 'duree', 'temps'].includes(k) && typeof v === 'string' && v.trim());
    res.send(views.home({ account: req.account, relecture, reviews: REVIEW_STATES.map(([key, label]) => ({ key, label, count: store.all().filter(r => reviewStateOf(r) === key).length })), groups, fits, theme: req.theme, selectedTags, tagInfo: store.tagInfo, regime, personne, duree, temps, unknown, params, tags: store.tags(), diets: store.diets(), people: store.people() }));
  });

  app.get('/recette/:slug', (req, res) => {
    const r = store.get(req.params.slug);
    if (!r) return res.status(404).send(views.notFound({ theme: req.theme }));
    res.send(views.recipe({ r, theme: req.theme, account: req.account, merci: req.query.merci, tagInfo: store.tagInfo }));
  });

  // --- Étiquettes : glossaire (Recettes/Étiquettes.md) et page de chaque étiquette ---
  const countOf = name => store.tags().find(x => normValue(x.name) === normValue(name))?.count || 0;
  app.get('/etiquettes', (req, res) => {
    const glossary = store.glossary();
    const families = glossary && glossary.map(f => ({ family: f.family, tags: f.tags.map(x => ({ ...x, count: countOf(x.name) })) }));
    const missing = store.tags().filter(x => !store.tagInfo(x.name));
    res.send(views.glossaryPage({ theme: req.theme, account: req.account, families, missing }));
  });
  app.get('/etiquette/:name', (req, res) => {
    const wanted = req.params.name.trim();
    const info = store.tagInfo(wanted);
    const used = store.tags().find(x => normValue(x.name) === normValue(wanted));
    if (!info && !used) return res.status(404).send(views.notFound({ theme: req.theme, account: req.account }));
    const name = info?.name || used.name;
    const groups = store.grouped(r => r.tags.some(tg => normValue(tg) === normValue(name)));
    res.send(views.tagPage({ theme: req.theme, account: req.account, name, info, groups }));
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

  app.get('/proposer', (req, res) => res.send(views.proposeForm({ theme: req.theme, account: req.account, values: { prenom: req.prenom } })));
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
        res.status(400).send(views.proposeForm({ theme: req.theme, account: req.account, error: msg, values }));
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
      res.send(views.thanks({ theme: req.theme, account: req.account, prenom }));
    }));

  // --- Relecture par la famille (sans accès admin) : chaque action modifie le .cook et est commitée ---
  const reviewForm = express.urlencoded({ extended: false, limit: '100kb' });
  // Recette concernée + prénom (connu, ou saisi dans le formulaire puis retenu).
  function reviewer(req, res) {
    store.invalidate();
    const r = store.get(req.params.slug);
    if (!r) { res.status(404).send(views.notFound({ theme: req.theme, account: req.account })); return null; }
    const typed = cleanName(req.body.prenom);
    if (typed) rememberName(req, res, typed);
    const who = typed || req.prenom;
    const refuse = (status, error) => res.status(status).send(views.recipe({ r, theme: req.theme, account: { prenom: who }, error, tagInfo: store.tagInfo }));
    if (!who) { refuse(400, 'Indique ton prénom.'); return null; }
    return { r, who, refuse, full: path.join(RECIPES_DIR, r.file) };
  }
  const done = (res, r, merci) => { store.invalidate(); res.redirect(`/recette/${r.slug}?merci=${merci}#revue`); };
  class Gone extends Error {}

  app.post('/recette/:slug/repondre', reviewForm, async (req, res, next) => {
    const ctx = reviewer(req, res);
    if (!ctx) return;
    const { r, who, refuse, full } = ctx;
    const reponse = String(req.body.reponse || '').trim();
    if (!reponse) return refuse(400, 'Ta réponse est vide.');
    try {
      await git.write(`Site : réponse de ${who} sur « ${r.title} »`, who, () => {
        const out = answerQuestion(fs.readFileSync(full, 'utf8'), { index: req.body.index, question: String(req.body.question || '') }, who, reponse);
        if (out == null) throw new Gone();
        writeAtomic(full, out);
      });
      done(res, r, 'reponse');
    } catch (err) {
      if (err instanceof Gone) return refuse(409, 'Cette question a changé ou a déjà été réglée entre-temps : ta réponse n\'a pas été enregistrée.');
      next(err);
    }
  });

  app.post('/recette/:slug/conforme', reviewForm, async (req, res, next) => {
    const ctx = reviewer(req, res);
    if (!ctx) return;
    const { r, who, refuse, full } = ctx;
    const on = Boolean(req.body.conforme);
    if (on && r.questions.length) return refuse(409, 'Il reste des questions sur cette recette : on pourra la dire conforme quand elles seront réglées.');
    try {
      await git.write(`Site : « ${r.title} » ${on ? `vérifiée par ${who}` : `n'est plus vérifiée (${who})`}`, who, () => {
        writeAtomic(full, setField(fs.readFileSync(full, 'utf8'), 'checked by', on ? `${who} ${today()}` : ''));
      });
      done(res, r, on ? 'conforme' : 'non-conforme');
    } catch (err) { next(err); }
  });

  app.post('/recette/:slug/erreur', reviewForm, async (req, res, next) => {
    const ctx = reviewer(req, res);
    if (!ctx) return;
    const { r, who, refuse, full } = ctx;
    const texte = String(req.body.texte || '').trim();
    if (!texte) return refuse(400, 'Décris l\'erreur en quelques mots.');
    try {
      // Une erreur signalée retire la vérification : la recette n'est plus conforme.
      await git.write(`Site : erreur signalée sur « ${r.title} » par ${who}`, who, () => {
        const out = reportError(fs.readFileSync(full, 'utf8'), who, texte);
        writeAtomic(full, r.meta['checked by'] ? setField(out, 'checked by', '') : out);
      });
      done(res, r, 'erreur');
    } catch (err) { next(err); }
  });

  app.use((req, res) => res.status(404).send(views.notFound({ theme: req.theme, account: req.account })));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send(views.layout({ title: 'Erreur', theme: req.theme, account: req.account, body: `<section class="form-page"><h1>Oups</h1><p class="error">${views.esc(err.message)}</p><p>Rien n'a été perdu : reviens en arrière pour réessayer.</p></section>` }));
  });

  return { app, store, git };
}

module.exports = { createApp };
