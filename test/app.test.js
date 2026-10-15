const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { startApp, FAMILY } = require('./helpers');

const sha1 = s => crypto.createHash('sha1').update(s).digest('hex');
const JPG = new Blob([Buffer.from('/9j/4AAQSkZJRgABAQ==', 'base64')], { type: 'image/jpeg' });

let t;
test.beforeEach(async () => { t = await startApp(); });
test.afterEach(async () => { await t.close(); });

test.describe('Accès famille', () => {
  test('sans connexion, redirige vers /connexion', async () => {
    const res = await t.req('/');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/connexion');
  });

  test('mauvais mot de passe refusé, bon mot de passe donne un cookie qui ouvre le site', async () => {
    assert.equal((await t.req('/connexion', { method: 'POST', body: t.form({ motdepasse: 'non' }) })).status, 401);
    const ok = await t.req('/connexion', { method: 'POST', body: t.form({ motdepasse: FAMILY }) });
    assert.equal(ok.status, 302);
    const cookie = ok.headers.get('set-cookie').split(';')[0];
    const home = await t.req('/', { headers: { cookie } });
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Pounty de ma mamie/);
  });

  test('lien secret /entrer?cle=', async () => {
    const res = await t.req(`/entrer?cle=${FAMILY}`);
    assert.match(res.headers.get('set-cookie'), /^famille=/);
    assert.equal((await t.req('/entrer?cle=faux')).headers.get('location'), '/connexion');
  });

  test('cookie falsifié refusé', async () => {
    assert.equal((await t.req('/', { headers: { cookie: 'famille=abc' } })).status, 302);
  });
});

test.describe('Site public (connecté)', () => {
  let cookie;
  test.beforeEach(async () => {
    cookie = (await t.req(`/entrer?cle=${FAMILY}`)).headers.get('set-cookie').split(';')[0];
  });

  test('page recette : ingrédients, portions, notes, pas de commentaires', async () => {
    const html = await (await t.req('/recette/pounty', { headers: { cookie } })).text();
    assert.match(html, /data-servings="6"/);
    assert.match(html, /lardons/);
    assert.match(html, /Une belle recette/);
    assert.doesNotMatch(html, /point à vérifier/);
  });

  test('photos : sert les images, refuse de sortir du dossier', async () => {
    assert.equal((await t.req('/photos/Originaux/galette.jpg', { headers: { cookie } })).status, 200);
    assert.equal((await t.req('/photos/..%2F..%2Fpackage.json', { headers: { cookie } })).status, 404);
    assert.equal((await t.req('/photos/Pounty.cook', { headers: { cookie } })).status, 404);
  });

  test('photo d\'étape « Recette.N.jpg » (N à partir de 0) sous la bonne étape', async () => {
    const html = await (await t.req('/recette/pounty', { headers: { cookie } })).text();
    const stepsHtml = html.split('class="step"').slice(1);
    assert.equal(stepsHtml.length, 3);
    assert.doesNotMatch(stepsHtml[0], /step-photo/);
    assert.match(stepsHtml[1], /<img class="step-photo" src="\/photos\/Pounty\.1\.jpg"/);
    assert.equal((await t.req('/photos/Pounty.1.jpg', { headers: { cookie } })).status, 200);
  });

  test('la photo d\'étape n\'est pas prise pour la photo du plat', async () => {
    const html = await (await t.req('/recette/pounty', { headers: { cookie } })).text();
    assert.doesNotMatch(html, /class="hero"/);
  });

  test.describe('Étiquettes cliquables', () => {
    const get = async url => (await t.req(url, { headers: { cookie } })).text();
    const cardsOf = html => [...html.matchAll(/<li class="card"[^>]*>\s*<a href="\/recette\/([^"]+)"/g)].map(m => m[1]).sort();

    test('sur la page recette, chaque étiquette mène à l\'accueil filtré', async () => {
      const html = await get('/recette/galette-seche');
      assert.match(html, /<a class="tag" href="\/\?tag=galette%20des%20rois">galette des rois<\/a>/);
      assert.match(await get('/recette/pounty'), /<a class="tag" href="\/\?tag=auvergne">auvergne<\/a>/);
    });

    test('l\'accueil ne garde que les recettes portant l\'étiquette', async () => {
      const html = await get('/?tag=auvergne');
      assert.deepEqual(cardsOf(html), ['pounty']);
      assert.match(html, /<p class="tag-filter">Étiquette : <b>auvergne<\/b> · 1 recette <a href="\/" aria-label="Voir toutes les recettes">✕<\/a><\/p>/);
    });

    test('insensible à la casse et aux espaces', async () => {
      assert.deepEqual(cardsOf(await get('/?tag=Galette%20des%20Rois')), ['galette-seche']);
    });

    test('étiquette inconnue : aucune recette et un lien pour revenir', async () => {
      const html = await get('/?tag=introuvable');
      assert.deepEqual(cardsOf(html), []);
      assert.match(html, /Étiquette : <b>introuvable<\/b> · 0 recette/);
      assert.match(html, /Aucune recette avec cette étiquette\./);
    });

    test('sans filtre : toutes les recettes, pas de bandeau', async () => {
      const html = await get('/');
      assert.deepEqual(cardsOf(html), ['galette-seche', 'pounty']);
      assert.doesNotMatch(html, /class="tag-filter"/);
    });
  });

  test.describe('Recherche par étiquette', () => {
    const get = async url => (await t.req(url, { headers: { cookie } })).text();
    const tagData = html => JSON.parse((html.match(/<script type="application\/json" id="tags-data">([\s\S]*?)<\/script>/) || [])[1] || 'null');
    const addTagged = (file, tags) => fs.writeFileSync(path.join(t.recipesDir, file), `---\ntitle: ${file.replace('.cook', '')}\ntags: ${tags}\n---\n\nMélanger.\n`);

    test('toutes les étiquettes, comptées et triées par fréquence puis par nom', async () => {
      addTagged('Clafoutis.cook', '[Four, dessert]');
      assert.deepEqual(tagData(await get('/')), [
        { name: 'four', count: 2 },
        { name: 'auvergne', count: 1 },
        { name: 'dessert', count: 1 },
        { name: 'galette des rois', count: 1 },
      ]);
    });

    test('bloc « Étiquettes » repliable, fermé par défaut', async () => {
      const html = await get('/');
      const block = html.slice(html.indexOf('<details class="tag-cloud"'), html.indexOf('</details>', html.indexOf('<details class="tag-cloud"')));
      assert.match(block, /^<details class="tag-cloud">/);
      assert.match(block, /<summary>Étiquettes <span class="count">3<\/span><\/summary>/);
      assert.match(block, /<a class="tag" href="\/\?tag=galette%20des%20rois">galette des rois <span class="count">1<\/span><\/a>/);
    });

    test('le bloc liste toutes les étiquettes même quand un filtre est actif', async () => {
      const html = await get('/?tag=auvergne');
      assert.equal(tagData(html).length, 3);
      assert.match(html, /<details class="tag-cloud">[\s\S]*galette des rois/);
    });

    test('barre de recherche prête pour les suggestions (combobox)', async () => {
      const html = await get('/');
      assert.match(html, /<input type="search" id="search"[^>]*role="combobox"[^>]*aria-controls="tag-suggestions"[^>]*aria-expanded="false"/);
      assert.match(html, /<ul id="tag-suggestions" role="listbox" aria-label="Étiquettes suggérées" hidden><\/ul>/);
    });

    test('les données d\'étiquettes ne peuvent pas casser la page', async () => {
      addTagged('Piège.cook', '["</script><b>gras"]');
      const html = await get('/');
      assert.doesNotMatch(html, /<\/script><b>gras/);
      assert.ok(tagData(html).some(x => x.name === '</script><b>gras'));
    });

    test('pas d\'étiquettes : pas de bloc', async () => {
      for (const f of ['Pounty.cook', 'Galette sèche.cook']) {
        fs.writeFileSync(path.join(t.recipesDir, f), t.read(f).replace(/^tags:.*$/m, 'tags: []'));
      }
      const html = await get('/');
      assert.doesNotMatch(html, /class="tag-cloud"/);
      assert.deepEqual(tagData(html), []);
    });
  });

  test.describe('Liens entre recettes', () => {
    const write = (file, meta, body = 'Mélanger.') => fs.writeFileSync(path.join(t.recipesDir, file), `---\n${meta}\n---\n\n${body}\n`);
    const page = async slug => (await t.req(`/recette/${slug}`, { headers: { cookie } })).text();
    const related = html => html.slice(html.indexOf('<nav class="related"'), html.indexOf('</nav>', html.indexOf('<nav class="related"')));

    test('variante : lien vers l\'original, et l\'original liste ses variantes', async () => {
      write('Champignons farcis.cook', 'title: Champignons farcis');
      write('Champignons farcis au four.cook', 'title: Champignons farcis au four\nvariant of: Champignons farcis');
      assert.match(related(await page('champignons-farcis-au-four')), /Variante de : <a href="\/recette\/champignons-farcis">Champignons farcis<\/a>/);
      assert.match(related(await page('champignons-farcis')), /Variantes : <a href="\/recette\/champignons-farcis-au-four">Champignons farcis au four<\/a>/);
    });

    test('« voir aussi » dans les deux sens, par nom de fichier ou par titre', async () => {
      write('Tarte.cook', 'title: Tarte du dimanche\nsee also: [Salade verte, Pounty de ma mamie]');
      write('Salade verte.cook', 'title: Salade verte');
      assert.match(related(await page('tarte')), /Voir aussi : <a href="\/recette\/salade-verte">Salade verte<\/a>, <a href="\/recette\/pounty">Pounty de ma mamie<\/a>/);
      assert.match(related(await page('salade-verte')), /Voir aussi : <a href="\/recette\/tarte">Tarte du dimanche<\/a>/);
      assert.match(related(await page('pounty')), /Voir aussi : <a href="\/recette\/tarte">Tarte du dimanche<\/a>/);
    });

    test('recette importée (@./…) : « Utilisée dans »', async () => {
      write('Pâte brisée.cook', 'title: Pâte brisée');
      write('Tarte aux poireaux.cook', 'title: Tarte aux poireaux', 'Étaler la @./Pâte brisée{}.');
      assert.match(related(await page('pate-brisee')), /Utilisée dans : <a href="\/recette\/tarte-aux-poireaux">Tarte aux poireaux<\/a>/);
    });

    test('recette inconnue ou archivée : nom en simple texte, sans lien', async () => {
      write('Gratin.cook', 'title: Gratin\nvariant of: Recette disparue\nsee also: Curry archivé');
      const nav = related(await page('gratin'));
      assert.match(nav, /Variante de : <span>Recette disparue<\/span>/);
      assert.match(nav, /Voir aussi : <span>Curry archivé<\/span>/);
      assert.doesNotMatch(nav, /href="\/recette\/(recette-disparue|curry-archive)"/);
    });

    test('pas de bloc quand il n\'y a aucun lien', async () => {
      assert.doesNotMatch(await page('galette-seche'), /<nav class="related"/);
    });
  });

  test.describe('Recettes archivées (Recettes/Archives/)', () => {
    test('absentes de l\'accueil et introuvables', async () => {
      const home = await (await t.req('/', { headers: { cookie } })).text();
      assert.doesNotMatch(home, /Curry archivé/);
      assert.equal((await t.req('/recette/curry-archive', { headers: { cookie } })).status, 404);
    });

    test('absentes du suivi de l\'admin', async () => {
      const html = await (await t.admin('/admin')).text();
      assert.doesNotMatch(html, /Curry archivé/);
      assert.match(html, /<b>2 recettes<\/b>/);
    });

    test('leurs images ne sont pas servies', async () => {
      for (const p of ['Archives/fiche.jpg', 'Archives/Curry%20archiv%C3%A9.jpg', 'archives/fiche.jpg', 'Originaux/../Archives/fiche.jpg']) {
        assert.equal((await t.req(`/photos/${p}`, { headers: { cookie } })).status, 404, p);
      }
      assert.equal((await t.req('/photos/Originaux/galette.jpg', { headers: { cookie } })).status, 200);
    });
  });

  test('recette inconnue → 404', async () => {
    assert.equal((await t.req('/recette/nope', { headers: { cookie } })).status, 404);
  });
});

test.describe('Styles d\'essai', () => {
  test('pose le cookie et revient sur la page d\'origine', async () => {
    const res = await t.req('/essais/pastel', { headers: { referer: `${t.base}/admin/recettes/pounty?x=1` } });
    assert.match(res.headers.get('set-cookie'), /^theme=pastel/);
    assert.equal(res.headers.get('location'), '/admin/recettes/pounty?x=1');
  });

  test('ignore un referer d\'un autre site (pas de redirection ouverte)', async () => {
    const res = await t.req('/essais/vichy', { headers: { referer: 'https://exemple.com/piege' } });
    assert.equal(res.headers.get('location'), '/');
  });

  test('style inconnu → liste des styles', async () => {
    assert.equal((await t.req('/essais/fluo')).headers.get('location'), '/essais');
  });
});

test.describe('Proposer une recette', () => {
  test('enregistre texte et photos dans a-moderer', async () => {
    const fd = new FormData();
    fd.set('prenom', 'Carole'); fd.set('titre', 'Gratin aux épinards'); fd.set('texte', 'Des épinards'); fd.set('anecdote', 'Miam');
    fd.append('photos', JPG, 'fiche.jpg');
    const res = await t.req('/proposer', { method: 'POST', body: fd, headers: { cookie: (await t.req(`/entrer?cle=${FAMILY}`)).headers.get('set-cookie').split(';')[0] } });
    assert.equal(res.status, 200);
    const [id] = fs.readdirSync(t.submissionsDir);
    const info = JSON.parse(fs.readFileSync(path.join(t.submissionsDir, id, 'recette.json'), 'utf8'));
    assert.equal(info.titre, 'Gratin aux épinards');
    assert.deepEqual(info.photos, ['photo-1.jpg']);
  });

  test('refuse un envoi vide sans rien laisser sur le disque', async () => {
    const cookie = (await t.req(`/entrer?cle=${FAMILY}`)).headers.get('set-cookie').split(';')[0];
    const fd = new FormData(); fd.set('prenom', 'X'); fd.set('titre', 'Y');
    assert.equal((await t.req('/proposer', { method: 'POST', body: fd, headers: { cookie } })).status, 400);
    assert.deepEqual(fs.existsSync(t.submissionsDir) ? fs.readdirSync(t.submissionsDir) : [], []);
  });
});

test.describe('Admin', () => {
  test('exige le mot de passe admin', async () => {
    assert.equal((await t.req('/admin')).status, 401);
    const wrong = { Authorization: 'Basic ' + Buffer.from('Paul:faux').toString('base64') };
    assert.equal((await t.req('/admin', { headers: wrong })).status, 401);
    assert.equal((await t.admin('/admin')).status, 200);
  });

  test.describe('Onglets du suivi', () => {
    const PANELS = ['propositions', 'recettes', 'a-demander', 'historique'];
    const dashboard = async () => (await t.admin('/admin')).text();
    const between = (html, start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));

    test('barre d\'onglets épinglable, un onglet par volet', async () => {
      const html = await dashboard();
      const nav = between(html, '<nav class="admin-tabs"', '</nav>');
      assert.match(nav, /role="tablist"/);
      for (const id of PANELS) {
        assert.match(nav, new RegExp(`<a[^>]+href="#${id}"[^>]+aria-controls="${id}"`), `onglet ${id}`);
        assert.match(html, new RegExp(`<section[^>]+id="${id}"[^>]+role="tabpanel"`), `volet ${id}`);
      }
    });

    test('« Nouvelle recette » est dans le volet Recettes, plus dans l\'en-tête', async () => {
      const html = await dashboard();
      assert.doesNotMatch(between(html, '<div class="admin-head"', '</div>'), /recettes\/nouvelle/);
      assert.match(between(html, 'id="recettes"', '</section>'), /href="\/admin\/recettes\/nouvelle"/);
    });

    test('onglet par défaut : Recettes sans proposition, Propositions s\'il y en a', async () => {
      assert.match(await dashboard(), /data-default-tab="recettes"/);
      const dir = path.join(t.submissionsDir, '2026-10-15T13-00-00-000Z-bbb222');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'recette.json'), JSON.stringify({ prenom: 'A', titre: 'B', texte: 'C', photos: [], date: 'd' }));
      assert.match(await dashboard(), /data-default-tab="propositions"/);
    });

    test('après une action, on revient sur le bon onglet', async () => {
      const res = await t.admin('/admin/a-demander/coche', { method: 'POST', body: t.form({ id: '1.2', titre: 'Polenta', fait: 'on' }) });
      assert.match(res.headers.get('location'), /#a-demander$/);
    });
  });

  test.describe('« Vérifiée » = conforme à l’original, questions ouvertes signalées', () => {
    const rowOf = (html, slug) => html.slice(html.indexOf(`href="/admin/recettes/${slug}"`), html.indexOf('</li>', html.indexOf(`href="/admin/recettes/${slug}"`)));

    test('libellé explicite dans le suivi et dans l’éditeur', async () => {
      assert.match(rowOf(await (await t.admin('/admin')).text(), 'pounty'), /Conforme à l’original/);
      const editor = await (await t.admin('/admin/recettes/pounty')).text();
      assert.match(editor, /Conforme à l’original/);
      assert.match(editor, /tant qu’il reste des questions/);
    });

    test('le suivi signale les questions ouvertes', async () => {
      const html = await (await t.admin('/admin')).text();
      assert.match(rowOf(html, 'pounty'), /1 question/);
      assert.doesNotMatch(rowOf(html, 'galette-seche'), /\d+ questions?/);
    });

    test('l’éditeur liste les questions ouvertes près de la case', async () => {
      const html = await (await t.admin('/admin/recettes/pounty')).text();
      const box = html.slice(html.indexOf('class="verify-box"'), html.indexOf('class="editor-actions"'));
      assert.match(box, /point à vérifier avec Annie/);
    });
  });

  test.describe('Filtres de l\'onglet Recettes', () => {
    const dashboard = async () => (await t.admin('/admin')).text();
    const flagsOf = (html, slug) => {
      const li = html.match(new RegExp(`<li[^>]*data-flags="([^"]*)"[^>]*>\\s*<div class="row">\\s*<a href="/admin/recettes/${slug}"`));
      return li ? li[1].split(' ').filter(Boolean).sort() : null;
    };
    const chip = (html, filter) => (html.match(new RegExp(`<button type="button" class="filter" data-filter="${filter}"[^>]*>[^<]*<span class="count">(\\d+)</span>`)) || [])[1];

    // Recette complète : toutes les infos, photo du plat, vérifiée, aucune question.
    const addComplete = () => {
      fs.writeFileSync(path.join(t.recipesDir, 'Tarte finie.cook'), '---\ntitle: Tarte finie\nauthor: Maman\nsource: fiche\nservings: 6\ncourse: dessert\nverifie: Paul 2026-10-15\n---\n\nCuire la @pâte{1}.\n');
      fs.copyFileSync(path.join(t.recipesDir, 'Originaux', 'galette.jpg'), path.join(t.recipesDir, 'Tarte finie.jpg'));
    };

    test('chaque recette porte ses états', async () => {
      addComplete();
      const html = await dashboard();
      assert.deepEqual(flagsOf(html, 'pounty'), ['a-finir', 'photo', 'questions']);
      assert.deepEqual(flagsOf(html, 'galette-seche'), ['a-finir', 'a-verifier', 'infos', 'photo']);
      assert.deepEqual(flagsOf(html, 'tarte-finie'), ['terminee']);
    });

    test('une recette vérifiée mais avec une question n\'est pas terminée', async () => {
      const src = t.read('Pounty.cook').replace('verifie:', 'verifie: Paul 2026-10-15').replace('servings: 6', 'servings: 6');
      fs.writeFileSync(path.join(t.recipesDir, 'Pounty.cook'), src);
      fs.copyFileSync(path.join(t.recipesDir, 'Originaux', 'galette.jpg'), path.join(t.recipesDir, 'Pounty.jpg'));
      assert.deepEqual(flagsOf(await dashboard(), 'pounty'), ['a-finir', 'questions']);
    });

    test('rangée de filtres avec leurs compteurs', async () => {
      addComplete();
      const html = await dashboard();
      assert.match(html, /<div class="filters" role="group" aria-label="Filtrer les recettes">/);
      assert.equal(chip(html, 'toutes'), '3');
      assert.equal(chip(html, 'a-finir'), '2');
      assert.equal(chip(html, 'questions'), '1');
      assert.equal(chip(html, 'a-verifier'), '1');
      assert.equal(chip(html, 'infos'), '1');
      assert.equal(chip(html, 'photo'), '2');
      assert.equal(chip(html, 'terminee'), '1');
    });

    test('message quand un filtre ne garde aucune recette', async () => {
      assert.match(await dashboard(), /<p class="muted filter-empty" hidden>Aucune recette pour ce filtre\.<\/p>/);
    });
  });

  test('tableau de suivi : compteurs calculés depuis les fichiers', async () => {
    const html = await (await t.admin('/admin')).text();
    assert.match(html, /<b>2 recettes<\/b> · vérifiées : 0\/2 · portions : 1\/2 · photos du plat : 0\/2 · auteur : 1\/2/);
  });

  test('cocher « vérifiée » écrit l\'en-tête et commite au nom de l\'utilisateur', async () => {
    const res = await t.admin('/admin/recettes/pounty/verifie', { method: 'POST', body: t.form({ verifie: 'on' }), user: 'Aline' });
    assert.equal(res.status, 302);
    assert.match(t.read('Pounty.cook'), /^verifie: Aline \d{4}-\d{2}-\d{2}$/m);
    assert.equal(t.log(), 'Aline (site)|Site : « Pounty de ma mamie » vérifiée par Aline');
    assert.equal(t.status(), '');
    await t.admin('/admin/recettes/pounty/verifie', { method: 'POST', body: t.form({}) });
    assert.match(t.read('Pounty.cook'), /^verifie:$/m);
  });

  test.describe('À demander', () => {
    test('cocher, ajouter, retirer : un commit chacun, lignes libres conservées', async () => {
      await t.admin('/admin/a-demander/coche', { method: 'POST', body: t.form({ id: '1.2', titre: 'Polenta', fait: 'on' }) });
      assert.match(t.read('À demander.md'), /- \[x\] Polenta/);
      await t.admin('/admin/a-demander/ajout', { method: 'POST', body: t.form({ section: '0', titre: 'Betteraves', note: 'Maman' }) });
      assert.match(t.read('À demander.md'), /- \[ \] Salade au cumin — Kenza \(femme de \[\[Lou-Anne\]\]\)\n- \[ \] Betteraves — Maman\n/);
      await t.admin('/admin/a-demander/suppr', { method: 'POST', body: t.form({ id: '0.0', titre: 'Carottes râpées' }) });
      assert.doesNotMatch(t.read('À demander.md'), /Carottes/);
      assert.match(t.read('À demander.md'), /une ligne libre à conserver/);
      assert.equal(t.log(3).split('\n').length, 3);
      assert.equal(t.status(), '');
    });

    test('retrouve l\'élément par son titre si sa position a changé', async () => {
      await t.admin('/admin/a-demander/coche', { method: 'POST', body: t.form({ id: '0.0', titre: 'Polenta', fait: 'on' }) });
      assert.match(t.read('À demander.md'), /- \[ \] Carottes râpées/);
      assert.match(t.read('À demander.md'), /- \[x\] Polenta/);
    });

    test('élément introuvable : rien n\'est écrit', async () => {
      const before = t.read('À demander.md');
      await t.admin('/admin/a-demander/suppr', { method: 'POST', body: t.form({ id: '9.9', titre: 'Inexistant' }) });
      assert.equal(t.read('À demander.md'), before);
    });
  });

  test.describe('Éditeur', () => {
    const save = (slug, source, base, extra = {}) => {
      const fd = new FormData();
      fd.set('source', source); if (base) fd.set('base', base);
      for (const [k, v] of Object.entries(extra)) fd.set(k, v);
      return t.admin(`/admin/recettes/${slug}`, { method: 'POST', body: fd });
    };

    test('enregistre une modification (diff minimal)', async () => {
      const src = t.read('Pounty.cook');
      const res = await save('pounty', src.replace('servings: 6', 'servings: 8'), sha1(src));
      assert.equal(res.status, 302);
      assert.equal(t.read('Pounty.cook'), src.replace('servings: 6', 'servings: 8'));
      assert.match(t.log(), /« Pounty de ma mamie » modifiée/);
    });

    test('refuse si le fichier a changé entre-temps, sans rien écraser', async () => {
      const src = t.read('Pounty.cook');
      fs.writeFileSync(path.join(t.recipesDir, 'Pounty.cook'), src + '\nAjout Obsidian.\n');
      const res = await save('pounty', src.replace('6', '7'), sha1(src));
      assert.equal(res.status, 400);
      assert.match(await res.text(), /modifiée ailleurs/);
      assert.match(t.read('Pounty.cook'), /Ajout Obsidian/);
    });

    test('refuse un en-tête invalide', async () => {
      const src = t.read('Pounty.cook');
      const res = await save('pounty', '---\ntitle: [cassé\n---\n', sha1(src));
      assert.equal(res.status, 400);
      assert.equal(t.read('Pounty.cook'), src);
    });

    test('photo du plat : enregistrée au nom de la recette', async () => {
      const src = t.read('Pounty.cook');
      const fd = new FormData(); fd.set('source', src); fd.set('base', sha1(src)); fd.append('photo_plat', JPG, 'IMG_1234.JPG');
      await t.admin('/admin/recettes/pounty', { method: 'POST', body: fd });
      assert.ok(fs.existsSync(path.join(t.recipesDir, 'Pounty.jpg')));
      assert.equal(t.status(), '');
    });

    test('nouvelle recette : fichier créé, nom en double refusé', async () => {
      const fd = new FormData();
      fd.set('fichier', 'Riz au lait'); fd.set('source', '---\ntitle: Riz au lait\ncourse: dessert\n---\n\nCuire le @riz{100%g}.\n');
      assert.equal((await t.admin('/admin/recettes/nouvelle', { method: 'POST', body: fd })).status, 302);
      assert.ok(fs.existsSync(path.join(t.recipesDir, 'Riz au lait.cook')));
      assert.equal((await t.admin('/admin/recettes/nouvelle', { method: 'POST', body: fd })).status, 400);
    });

    test('aperçu', async () => {
      const res = await t.admin('/admin/apercu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: '---\ntitle: T\n---\n\n@sel{}' }) });
      assert.match(await res.text(), /class="ing">sel/);
    });

    test.describe('Case « Vérifiée » dans l\'éditeur', () => {
      const saveAs = (user, source, base, verifie) => {
        const fd = new FormData();
        fd.set('source', source); fd.set('base', base);
        if (verifie) fd.set('verifie', 'on');
        return t.admin('/admin/recettes/pounty', { method: 'POST', body: fd, user });
      };
      const checkbox = html => (html.match(/<input[^>]*name="verifie"[^>]*>/) || [''])[0];

      test('la case reflète l\'état de la recette', async () => {
        assert.doesNotMatch(checkbox(await (await t.admin('/admin/recettes/pounty')).text()), /checked/);
        const src = t.read('Pounty.cook');
        fs.writeFileSync(path.join(t.recipesDir, 'Pounty.cook'), src.replace('verifie:', 'verifie: Paul 2026-01-01'));
        const html = await (await t.admin('/admin/recettes/pounty')).text();
        assert.match(checkbox(html), /checked/);
        assert.match(html, /Paul 2026-01-01/);
      });

      test('cocher sans autre modification enregistre la vérification', async () => {
        const src = t.read('Pounty.cook');
        assert.equal((await saveAs('Aline', src, sha1(src), true)).status, 302);
        assert.match(t.read('Pounty.cook'), /^verifie: Aline \d{4}-\d{2}-\d{2}$/m);
        assert.match(t.log(), /vérifiée par Aline/);
      });

      test('déjà vérifiée : garde le nom et la date d\'origine', async () => {
        const src = t.read('Pounty.cook').replace('verifie:', 'verifie: Paul 2026-01-01');
        fs.writeFileSync(path.join(t.recipesDir, 'Pounty.cook'), src);
        await saveAs('Aline', src.replace('servings: 6', 'servings: 5'), sha1(src), true);
        const now = t.read('Pounty.cook');
        assert.match(now, /^verifie: Paul 2026-01-01$/m);
        assert.match(now, /servings: 5/);
      });

      test('décocher retire la vérification', async () => {
        const src = t.read('Pounty.cook').replace('verifie:', 'verifie: Paul 2026-01-01');
        fs.writeFileSync(path.join(t.recipesDir, 'Pounty.cook'), src);
        await saveAs('Paul', src, sha1(src), false);
        assert.match(t.read('Pounty.cook'), /^verifie:$/m);
      });

      test('publier une proposition déjà vérifiée', async () => {
        const id = '2026-10-15T12-00-00-000Z-aaa111';
        const dir = path.join(t.submissionsDir, id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'recette.json'), JSON.stringify({ prenom: 'A', titre: 'Crêpes', texte: 'x', photos: [], date: 'd' }));
        assert.match(checkbox(await (await t.admin(`/admin/propositions/${id}`)).text()), /name="verifie"/);
        const fd = new FormData();
        fd.set('fichier', 'Crêpes'); fd.set('source', '---\ntitle: Crêpes\nverifie:\n---\n\n@farine{250%g}\n'); fd.set('verifie', 'on');
        await t.admin(`/admin/propositions/${id}/publier`, { method: 'POST', body: fd, user: 'Aline' });
        assert.match(t.read('Crêpes.cook'), /^verifie: Aline \d{4}-\d{2}-\d{2}$/m);
      });
    });

    test.describe('Disposition original / formulaire / aperçu', () => {
      const editorHtml = async slug => (await t.admin(`/admin/recettes/${slug}`)).text();
      const between = (html, cls) => html.split(`class="${cls}"`)[1] || '';

      test('affiche la fiche d\'origine de la recette dans sa colonne', async () => {
        const html = await editorHtml('galette-seche');
        assert.match(html, /class="editor-layout has-original"/);
        assert.match(between(html, 'pane-original'), /<img[^>]+src="\/photos\/Originaux\/galette\.jpg"/);
      });

      test('ordre des colonnes : original, formulaire, aperçu', async () => {
        const html = await editorHtml('galette-seche');
        const pos = ['pane-original', 'pane-form', 'pane-preview'].map(c => html.indexOf(`class="${c}"`));
        assert.ok(pos.every(p => p > 0), pos.join());
        assert.deepEqual([...pos].sort((a, b) => a - b), pos);
      });

      test('l\'aperçu est déjà rendu à l\'ouverture', async () => {
        const preview = between(await editorHtml('pounty'), 'pane-preview');
        assert.match(preview, /<article class="recipe"/);
        assert.match(preview, /lardons/);
      });

      test('sans fiche d\'origine : pas de colonne original', async () => {
        const html = await editorHtml('pounty');
        assert.match(html, /class="editor-layout"/);
        assert.doesNotMatch(html, /class="pane-original"/);
      });

      test('proposition : ses photos servent d\'original', async () => {
        const id = '2026-10-15T11-00-00-000Z-def456';
        const dir = path.join(t.submissionsDir, id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'photo-1.jpg'), 'x');
        fs.writeFileSync(path.join(dir, 'recette.json'), JSON.stringify({ prenom: 'A', titre: 'B', texte: 'C', photos: ['photo-1.jpg'], date: 'd' }));
        const html = await (await t.admin(`/admin/propositions/${id}`)).text();
        assert.match(between(html, 'pane-original'), new RegExp(`src="/admin/fichiers/${id}/photo-1\\.jpg"`));
        assert.match(between(html, 'pane-preview'), /<article class="recipe"/);
      });

      test('aperçu d\'un en-tête invalide : message d\'erreur au lieu d\'un plantage', async () => {
        const src = t.read('Pounty.cook');
        const fd = new FormData(); fd.set('source', '---\ntitle: [x\n---\n'); fd.set('base', sha1(src));
        const html = await (await t.admin('/admin/recettes/pounty', { method: 'POST', body: fd })).text();
        assert.match(between(html, 'pane-preview'), /class="error"/);
      });
    });
  });

  test.describe('Propositions', () => {
    // Crée une proposition comme le ferait le formulaire public.
    function proposal({ photos = 2 } = {}) {
      const id = '2026-10-15T10-00-00-000Z-abc123';
      const dir = path.join(t.submissionsDir, id);
      fs.mkdirSync(dir, { recursive: true });
      const names = Array.from({ length: photos }, (_, i) => `photo-${i + 1}.jpg`);
      for (const n of names) fs.writeFileSync(path.join(dir, n), `image ${n}`);
      fs.writeFileSync(path.join(dir, 'recette.json'), JSON.stringify({ prenom: 'Carole', titre: 'Gratin aux épinards', texte: 'Ligne 1\n\nLigne 2', anecdote: 'Miam', photos: names, date: '15/10/2026' }));
      return id;
    }

    test('l\'éditeur est pré-rempli à partir de la proposition', async () => {
      const id = proposal();
      const html = await (await t.admin(`/admin/propositions/${id}`)).text();
      assert.match(html, /title: Gratin aux épinards\nauthor: Carole/);
      assert.match(html, /&gt; Carole : « Miam »/);
    });

    test('publier : .cook + photos selon leur rôle + un commit + proposition rangée', async () => {
      const id = proposal();
      const fd = new FormData();
      fd.set('fichier', 'Gratin aux épinards');
      fd.set('source', '---\ntitle: Gratin aux épinards\nauthor: Carole\n---\n\nMélanger les @épinards{500%g}.\n');
      fd.set('role:photo-1.jpg', 'plat'); fd.set('role:photo-2.jpg', 'original');
      const res = await t.admin(`/admin/propositions/${id}/publier`, { method: 'POST', body: fd });
      assert.equal(res.status, 302);

      const cook = t.read('Gratin aux épinards.cook');
      assert.match(cook, /original: \["Originaux\/gratin-aux-epinards-1\.jpg"\]/);
      assert.equal(t.read('Gratin aux épinards.jpg'), 'image photo-1.jpg');
      assert.equal(t.read('Originaux/gratin-aux-epinards-1.jpg'), 'image photo-2.jpg');
      assert.match(t.log(), /nouvelle recette « Gratin aux épinards » \(proposée par Carole\)/);
      assert.equal(t.status(), '');

      const done = path.join(path.dirname(t.submissionsDir), 'traitees', id);
      assert.ok(fs.existsSync(path.join(done, 'photo-1.jpg')), 'la proposition et ses photos sont conservées');
      assert.equal(JSON.parse(fs.readFileSync(path.join(done, 'recette.json'), 'utf8')).recette, 'Gratin aux épinards.cook');
      assert.deepEqual(fs.readdirSync(t.submissionsDir), []);
    });

    test('publier avec un en-tête invalide : rien n\'est écrit ni déplacé', async () => {
      const id = proposal();
      const fd = new FormData(); fd.set('fichier', 'X'); fd.set('source', '---\ntitle: [x\n---\n');
      assert.equal((await t.admin(`/admin/propositions/${id}/publier`, { method: 'POST', body: fd })).status, 400);
      assert.ok(fs.existsSync(path.join(t.submissionsDir, id)));
      assert.ok(!fs.existsSync(path.join(t.recipesDir, 'X.cook')));
    });

    test('archiver : conservée dans archivees', async () => {
      const id = proposal({ photos: 0 });
      await t.admin(`/admin/propositions/${id}/archiver`, { method: 'POST' });
      assert.ok(fs.existsSync(path.join(path.dirname(t.submissionsDir), 'archivees', id, 'recette.json')));
    });

    test('photos de proposition : accès admin seulement, pas de sortie du dossier', async () => {
      const id = proposal();
      assert.equal((await t.req(`/admin/fichiers/${id}/photo-1.jpg`)).status, 401);
      assert.equal((await t.admin(`/admin/fichiers/${id}/photo-1.jpg`)).status, 200);
      assert.equal((await t.admin(`/admin/fichiers/..%2F..%2Frecettes/Pounty.cook`)).status, 404);
    });
  });
});
