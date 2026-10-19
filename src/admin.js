const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { fromSource, slugify, cookTimeHint, PHOTO_EXT } = require('./recipes');
const { parseTodo, serializeTodo, findItem } = require('./todo');
const { setField, yamlList } = require('./frontmatter');
const views = require('./views');
const adminViews = require('./adminViews');
const { writeAtomic, today } = require('./files');

const TODO_FILE = 'À demander.md';
const hash = s => crypto.createHash('sha1').update(s).digest('hex');
const safeFileName = s => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);

module.exports = function adminRouter({ store, git, dataDir, adminPassword, safeEqual }) {
  const router = express.Router();
  const dir = store.dir;
  const states = { pending: path.join(dataDir, 'a-moderer'), done: path.join(dataDir, 'traitees'), archived: path.join(dataDir, 'archivees'), imported: path.join(dataDir, 'importees') };
  const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 25 * 1024 * 1024 } });
  const form = express.urlencoded({ extended: false, limit: '1mb' });

  // Basic Auth : le nom saisi sert pour « vérifiée par » et pour l'auteur des commits.
  router.use((req, res, next) => {
    const [, b64 = ''] = (req.headers.authorization || '').split(' ');
    const [user, ...rest] = Buffer.from(b64, 'base64').toString().split(':');
    if (adminPassword && safeEqual(rest.join(':'), adminPassword)) {
      req.user = (user || 'Admin').trim().slice(0, 40) || 'Admin';
      return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="admin recettes", charset="UTF-8"').status(401).send('Accès réservé. Identifiant : ton prénom.');
  });

  // --- Données ---
  function listProposals(state = 'pending') {
    const base = states[state];
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base).sort().reverse().map(id => readProposal(id, state)).filter(Boolean);
  }
  function readProposal(id, state = 'pending') {
    if (!/^[\w.-]+$/.test(id)) return null;
    try {
      const info = JSON.parse(fs.readFileSync(path.join(states[state], id, 'recette.json'), 'utf8'));
      return { id, state, photos: [], ...info };
    } catch { return null; }
  }
  function moveProposal(p, to, extra) {
    fs.mkdirSync(states[to], { recursive: true });
    const from = path.join(states[p.state], p.id);
    const info = JSON.parse(fs.readFileSync(path.join(from, 'recette.json'), 'utf8'));
    writeAtomic(path.join(from, 'recette.json'), JSON.stringify({ ...info, ...extra }, null, 2));
    fs.renameSync(from, path.join(states[to], p.id));
  }
  function readTodo() {
    const full = path.join(dir, TODO_FILE);
    return fs.existsSync(full) ? parseTodo(fs.readFileSync(full, 'utf8')) : null;
  }
  const back = (res, anchor, flash) => res.redirect(`/admin${flash ? `?ok=${encodeURIComponent(flash)}` : ''}#${anchor}`);

  // --- Tableau de suivi ---
  router.get('/', async (req, res, next) => {
    try {
      store.invalidate();
      let history = null;
      try { history = await git.log(15); } catch {}
      res.send(adminViews.dashboard({
        theme: req.theme, user: req.user, recipes: store.all(), missingTags: store.missingTags(), proposals: listProposals(), imported: listProposals('imported'),
        todo: readTodo(), history, flash: req.query.ok,
      }));
    } catch (err) { next(err); }
  });

  router.get('/fichiers/:id/:file', (req, res) => {
    for (const base of Object.values(states)) {
      const full = path.resolve(base, req.params.id, req.params.file);
      if (full.startsWith(path.resolve(base) + path.sep) && fs.existsSync(full)) return res.sendFile(full);
    }
    res.sendStatus(404);
  });

  // --- Aperçu (utilisé par l'éditeur) ---
  router.post('/apercu', express.json({ limit: '1mb' }), (req, res) => {
    try {
      res.send(previewHtml(req.body.source));
    } catch (err) {
      res.status(400).send(`<p class="error">${views.esc(err.message)}</p>`);
    }
  });

  // Vérifie qu'un source est lisible avant de l'écrire (sinon la recette disparaîtrait du site).
  function validate(source) {
    const r = fromSource(source, 'x.cook', null);
    if (!r.meta.title) throw new Error('Il manque le titre (title:) dans l\'en-tête.');
    return r;
  }

  // Case « Vérifiée » du formulaire : cochée → garde la vérification existante ou en crée une
  // au nom de l'utilisateur ; décochée → vide le champ. En-tête illisible : on laisse validate() le signaler.
  function verifiedOf(source) {
    try { return fromSource(source, 'x.cook', null).meta['checked by'] || ''; } catch { return ''; }
  }
  function applyVerified(source, req) {
    const current = verifiedOf(source);
    if (req.body.verifie && !current) return setField(source, 'checked by', `${req.user} ${today()}`);
    if (!req.body.verifie && current) return setField(source, 'checked by', '');
    return source;
  }

  // Aperçu rendu côté serveur (affiché dès l'ouverture de l'éditeur).
  function previewHtml(source) {
    try {
      const r = fromSource(String(source || ''), 'apercu.cook', null);
      // Erreurs Cooklang (ex. référence @& introuvable) en tête de l'aperçu.
      const warnings = [...r.problems, cookTimeHint(r)].filter(Boolean);
      return warnings.map(p => `<p class="warning">⚠ ${views.esc(p)}</p>`).join('') + views.recipeArticle(r, { back: false });
    } catch (err) {
      return `<p class="error">${views.esc(err.message)}</p>`;
    }
  }
  const proposalImages = p => p.photos.map(f => `/admin/fichiers/${encodeURIComponent(p.id)}/${encodeURIComponent(f)}`);
  const recipeImages = r => (r ? r.originals.filter(o => store.imagePath(o)).map(o => `/photos/${views.enc(o)}`) : []);
  const renderEditor = opts => adminViews.editor({
    ...opts,
    originals: opts.proposal ? proposalImages(opts.proposal) : recipeImages(opts.recipe),
    preview: previewHtml(opts.source),
    verified: verifiedOf(opts.source),
    questions: (() => { try { return fromSource(String(opts.source || ''), 'x.cook', null).questions; } catch { return []; } })(),
  });

  async function savePlatPhoto(file, baseName) {
    const ext = path.extname(file.originalname).toLowerCase();
    const finalExt = PHOTO_EXT.includes(ext) ? ext : '.jpg';
    for (const e of PHOTO_EXT) {
      const old = path.join(dir, baseName + e);
      if (e !== finalExt && fs.existsSync(old)) fs.unlinkSync(old); // l'ancienne reste dans l'historique git
    }
    writeAtomic(path.join(dir, baseName + finalExt), file.buffer);
  }

  // --- Proposition → recette ---
  function templateFor(p) {
    const paragraphs = String(p.texte || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    return [
      '---',
      `title: ${p.titre}`,
      `author: ${p.prenom}`,
      'shared by:',
      'source:',
      'servings:',
      'course:',
      'tags: []',
      'prep time:',
      'cook time:',
      'checked by:',
      '---',
      '',
      ...(p.anecdote ? [`> ${p.prenom} : « ${p.anecdote.replace(/\s*\n\s*/g, ' ')} »`, ''] : []),
      ...paragraphs.flatMap(par => [par, '']),
      `-- Proposée sur le site par ${p.prenom} le ${p.date}`,
      '',
    ].join('\n');
  }

  router.get('/propositions/:id', (req, res) => {
    const p = readProposal(req.params.id);
    if (!p) return back(res, 'propositions', 'Proposition introuvable (déjà traitée ?)');
    res.send(renderEditor({
      theme: req.theme, title: `Proposition : ${p.titre}`, action: `/admin/propositions/${encodeURIComponent(p.id)}/publier`,
      source: templateFor(p), fichier: safeFileName(p.titre), isNew: true, proposal: p,
    }));
  });

  router.post('/propositions/:id/publier', upload.none(), async (req, res, next) => {
    const p = readProposal(req.params.id);
    if (!p) return back(res, 'propositions', 'Proposition introuvable (déjà traitée ?)');
    let source = String(req.body.source || '').replace(/\r\n/g, '\n');
    const fichier = safeFileName(String(req.body.fichier || ''));
    const again = error => res.status(400).send(renderEditor({
      theme: req.theme, title: `Proposition : ${p.titre}`, action: req.originalUrl,
      source, fichier, isNew: true, proposal: p, error,
    }));
    try {
      source = applyVerified(source, req);
      const r = validate(source);
      if (!fichier) return again('Il manque le nom du fichier.');
      const file = `${fichier}.cook`;
      if (fs.existsSync(path.join(dir, file))) return again(`Une recette « ${file} » existe déjà : choisis un autre nom.`);

      const roles = p.photos.map(f => ({ f, role: req.body[`role:${f}`] || 'original' }));
      const originals = roles.filter(x => x.role === 'original');
      const plat = roles.find(x => x.role === 'plat');
      const slug = slugify(fichier);
      const copies = originals.map((x, i) => {
        let name = `Originaux/${slug}-${i + 1}${path.extname(x.f).toLowerCase()}`;
        for (let k = 2; fs.existsSync(path.join(dir, name)); k++) name = `Originaux/${slug}-${i + 1}-${k}${path.extname(x.f).toLowerCase()}`;
        return { from: x.f, to: name };
      });
      if (copies.length) source = setField(source, 'original', yamlList([...r.originals, ...copies.map(c => c.to)]));

      const pdir = path.join(states.pending, p.id);
      await git.write(`Site : nouvelle recette « ${r.title} » (proposée par ${p.prenom})`, req.user, () => {
        fs.mkdirSync(path.join(dir, 'Originaux'), { recursive: true });
        for (const c of copies) fs.copyFileSync(path.join(pdir, c.from), path.join(dir, c.to));
        if (plat) fs.copyFileSync(path.join(pdir, plat.f), path.join(dir, fichier + (PHOTO_EXT.includes(path.extname(plat.f).toLowerCase()) ? path.extname(plat.f).toLowerCase() : '.jpg')));
        writeAtomic(path.join(dir, file), source);
      });
      moveProposal(p, 'done', { recette: file, traiteeLe: today(), traiteePar: req.user });
      store.invalidate();
      back(res, 'recettes', `« ${r.title} » est publiée.`);
    } catch (err) {
      if (err.name === 'YAMLParseError' || /En-tête|titre/.test(err.message)) return again(err.message);
      next(err);
    }
  });

  router.post('/propositions/:id/archiver', (req, res) => {
    const p = readProposal(req.params.id);
    if (p) moveProposal(p, 'archived', { archiveeLe: today(), archiveePar: req.user });
    back(res, 'propositions', p ? `« ${p.titre} » archivée (conservée sur le serveur).` : '');
  });

  // --- Recettes : création et édition ---
  const NEW_TEMPLATE = ['---', 'title: ', 'author: ', 'shared by: ', 'source: ', 'servings: ', 'course: plat', 'tags: []', 'prep time: ', 'cook time: ', 'checked by:', '---', '', 'Mélanger la @farine{250%g} et les @œufs{3} dans un #saladier{}.', '', 'Cuire ~{30%minutes}.', ''].join('\n');

  router.get('/recettes/nouvelle', (req, res) => {
    res.send(renderEditor({ theme: req.theme, title: 'Nouvelle recette', action: '/admin/recettes/nouvelle', source: NEW_TEMPLATE, fichier: '', isNew: true }));
  });

  router.post('/recettes/nouvelle', upload.single('photo_plat'), async (req, res, next) => {
    let source = String(req.body.source || '').replace(/\r\n/g, '\n');
    const fichier = safeFileName(String(req.body.fichier || ''));
    const again = error => res.status(400).send(renderEditor({ theme: req.theme, title: 'Nouvelle recette', action: '/admin/recettes/nouvelle', source, fichier, isNew: true, error }));
    try {
      source = applyVerified(source, req);
      const r = validate(source);
      if (!fichier) return again('Il manque le nom du fichier.');
      if (fs.existsSync(path.join(dir, `${fichier}.cook`))) return again('Une recette porte déjà ce nom de fichier.');
      await git.write(`Site : nouvelle recette « ${r.title} »`, req.user, async () => {
        writeAtomic(path.join(dir, `${fichier}.cook`), source);
        if (req.file) await savePlatPhoto(req.file, fichier);
      });
      store.invalidate();
      back(res, 'recettes', `« ${r.title} » est publiée.`);
    } catch (err) {
      if (err.name === 'YAMLParseError' || /En-tête|titre/.test(err.message)) return again(err.message);
      next(err);
    }
  });

  router.get('/recettes/:slug', (req, res) => {
    store.invalidate();
    const r = store.get(req.params.slug);
    if (!r) return back(res, 'recettes', 'Recette introuvable.');
    const source = fs.readFileSync(path.join(dir, r.file), 'utf8');
    res.send(renderEditor({
      theme: req.theme, title: r.title, action: `/admin/recettes/${r.slug}`,
      source, base: hash(source), fichier: r.file, photo: r.photo, recipe: r,
    }));
  });

  router.post('/recettes/:slug', upload.single('photo_plat'), async (req, res, next) => {
    store.invalidate();
    const r0 = store.get(req.params.slug);
    if (!r0) return back(res, 'recettes', 'Recette introuvable.');
    const full = path.join(dir, r0.file);
    const current = fs.readFileSync(full, 'utf8');
    // On garde les fins de ligne du fichier d'origine.
    let source = String(req.body.source || '').replace(/\r\n/g, '\n');
    if (current.includes('\r\n')) source = source.replace(/\n/g, '\r\n');
    const again = (error, showCurrent) => res.status(400).send(renderEditor({
      theme: req.theme, title: r0.title, action: req.originalUrl, source, base: hash(current),
      fichier: r0.file, photo: r0.photo, recipe: r0, error, current: showCurrent ? current : null,
    }));
    if (req.body.base !== hash(current)) {
      return again('La recette a été modifiée ailleurs pendant que tu l\'éditais (synchro Obsidian ?). Ton texte est ci-dessous ; compare avec la version actuelle en bas avant d\'enregistrer.', true);
    }
    try {
      const before = verifiedOf(current);
      source = applyVerified(source, req);
      const r = validate(source);
      if (source === current && !req.file) return back(res, 'recettes', 'Aucun changement.');
      const after = r.meta['checked by'] || '';
      const what = before === after ? 'modifiée' : after ? `vérifiée par ${req.user}` : 'n’est plus vérifiée';
      await git.write(`Site : « ${r.title} » ${what}`, req.user, async () => {
        if (source !== current) writeAtomic(full, source);
        if (req.file) await savePlatPhoto(req.file, r0.file.replace(/\.cook$/, ''));
      });
      store.invalidate();
      back(res, 'recettes', `« ${r.title} » enregistrée.`);
    } catch (err) {
      if (err.name === 'YAMLParseError' || /En-tête|titre/.test(err.message)) return again(err.message);
      next(err);
    }
  });

  router.post('/recettes/:slug/verifie', form, async (req, res, next) => {
    try {
      store.invalidate();
      const r = store.get(req.params.slug);
      if (!r) return back(res, 'recettes', 'Recette introuvable.');
      const value = req.body.verifie ? `${req.user} ${today()}` : '';
      const full = path.join(dir, r.file);
      await git.write(`Site : « ${r.title} » ${value ? `vérifiée par ${req.user}` : 'n\'est plus vérifiée'}`, req.user, () => {
        writeAtomic(full, setField(fs.readFileSync(full, 'utf8'), 'checked by', value));
      });
      store.invalidate();
      back(res, 'recettes');
    } catch (err) { next(err); }
  });

  // --- À demander ---
  function updateTodo(req, res, next, message, mutate) {
    const full = path.join(dir, TODO_FILE);
    git.write(message, req.user, () => {
      const doc = parseTodo(fs.readFileSync(full, 'utf8'));
      if (mutate(doc) === false) return;
      writeAtomic(full, serializeTodo(doc));
    }).then(() => back(res, 'a-demander')).catch(next);
  }
  // Retrouve l'élément par position, en vérifiant le titre (le fichier a pu bouger entre-temps).
  function locate(doc, id, titre) {
    const hit = findItem(doc, id);
    if (hit && hit.item.title === titre) return hit;
    for (const section of doc.sections) {
      const index = section.entries.findIndex(e => e.type === 'item' && e.title === titre);
      if (index >= 0) return { section, index, item: section.entries[index] };
    }
    return null;
  }

  router.post('/a-demander/coche', form, (req, res, next) => {
    const titre = String(req.body.titre || '');
    updateTodo(req, res, next, `Site : « ${titre} » ${req.body.fait ? 'reçue' : 'à demander'}`, doc => {
      const hit = locate(doc, req.body.id, titre);
      if (!hit) return false;
      hit.item.done = Boolean(req.body.fait);
    });
  });

  router.post('/a-demander/ajout', form, (req, res, next) => {
    const titre = String(req.body.titre || '').replace(/\s+/g, ' ').replace(/ — /g, ' - ').trim();
    const note = String(req.body.note || '').replace(/\s+/g, ' ').trim();
    if (!titre) return back(res, 'a-demander');
    updateTodo(req, res, next, `Site : « ${titre} » ajoutée à la liste`, doc => {
      const section = doc.sections[Number(req.body.section)] || doc.sections[0];
      if (!section) return false;
      section.entries.push({ type: 'item', done: false, title: titre, note });
    });
  });

  router.post('/a-demander/suppr', form, (req, res, next) => {
    const titre = String(req.body.titre || '');
    updateTodo(req, res, next, `Site : « ${titre} » retirée de la liste`, doc => {
      const hit = locate(doc, req.body.id, titre);
      if (!hit) return false;
      hit.section.entries.splice(hit.index, 1);
    });
  });

  return router;
};
