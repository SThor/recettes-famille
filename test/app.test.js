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
