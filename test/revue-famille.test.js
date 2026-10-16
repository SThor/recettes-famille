// Relecture par la famille (sans accès admin) : prénom à la connexion, déconnexion,
// réponses aux questions, case « Conforme à l'original », signalement d'erreur.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, FAMILY } = require('./helpers');
const { threadsOf, answerQuestion, reportError } = require('../src/revue');
const { parse } = require('../src/cooklang');

const stepsOf = src => parse(src).items.filter(i => i.type === 'step').length;
const HEAD = '---\ntitle: X\n---\n\n';

test.describe('Questions : lecture et réponse dans le commentaire', () => {
  test('threadsOf : question seule, question en fin d\'étape, bloc, réponses existantes', () => {
    const src = `${HEAD}Mélanger. -- combien de sucre ? ↳ Carole : 200 g ↳ Paul : plutôt 250 g\n\nCuire. [- four chaud ? -]\n\n-- point à vérifier\n`;
    assert.deepEqual(threadsOf(src), [
      { question: 'combien de sucre ?', answers: [{ who: 'Carole', text: '200 g' }, { who: 'Paul', text: 'plutôt 250 g' }] },
      { question: 'four chaud ?', answers: [] },
      { question: 'point à vérifier', answers: [] },
    ]);
  });

  test('ignore l\'en-tête YAML (---) et les commentaires vides', () => {
    assert.deepEqual(threadsOf(`${HEAD}Étape --\n`), []);
  });

  test('réponse à une question en fin de ligne : ajoutée sur la même ligne, étapes intactes', () => {
    const src = `${HEAD}Mélanger la @farine{200%g}. -- combien ?\nPuis cuire.\n\nDeuxième étape.\n`;
    const out = answerQuestion(src, { index: 0, question: 'combien ?' }, 'Carole', 'deux cents\ngrammes');
    assert.equal(out, `${HEAD}Mélanger la @farine{200%g}. -- combien ? ↳ Carole : deux cents grammes\nPuis cuire.\n\nDeuxième étape.\n`);
    assert.equal(stepsOf(out), stepsOf(src));
    // Deuxième réponse : à la suite de la première
    const again = answerQuestion(out, { index: 0, question: 'combien ?' }, 'Paul', 'ok');
    assert.match(again, /-- combien \? ↳ Carole : deux cents grammes ↳ Paul : ok\n/);
  });

  test('réponse dans un bloc [- … -] et fichier en CRLF', () => {
    const src = `---\r\ntitle: X\r\n---\r\n\r\nCuire. [- four chaud ? -] encore.\r\n-- autre\r\n`;
    const out = answerQuestion(src, { index: 0, question: 'four chaud ?' }, 'Annie', 'oui');
    assert.equal(out, `---\r\ntitle: X\r\n---\r\n\r\nCuire. [- four chaud ? ↳ Annie : oui -] encore.\r\n-- autre\r\n`);
    const out2 = answerQuestion(out, { index: 1, question: 'autre' }, 'Annie', 'oui');
    assert.equal(out2, `---\r\ntitle: X\r\n---\r\n\r\nCuire. [- four chaud ? ↳ Annie : oui -] encore.\r\n-- autre ↳ Annie : oui\r\n`);
  });

  test('question introuvable ou modifiée entre-temps → null ; position décalée → retrouvée par le texte', () => {
    const src = `${HEAD}-- a\n\n-- b\n`;
    assert.equal(answerQuestion(src, { index: 0, question: 'z' }, 'P', 'x'), null);
    assert.match(answerQuestion(src, { index: 0, question: 'b' }, 'P', 'x'), /-- b ↳ P : x\n$/);
  });

  test('le texte saisi ne peut pas casser le commentaire', () => {
    const out = answerQuestion(`${HEAD}A. [- q -]\n`, { index: 0, question: 'q' }, 'P', 'fin -] @farine{1} ↳ X : y');
    assert.equal(threadsOf(out)[0].answers.length, 1);
    assert.equal(parse(out).ingredients.length, 0);
  });

  test('reportError : nouveau paragraphe de commentaire en fin de fichier, étapes intactes', () => {
    const src = `${HEAD}Étape un.\n\nÉtape deux.\n\n\n`;
    const out = reportError(src, 'Carole', 'Il manque\nle beurre');
    assert.equal(out, `${HEAD}Étape un.\n\nÉtape deux.\n\n-- ⚠ Erreur signalée par Carole : Il manque le beurre\n`);
    assert.equal(stepsOf(out), 2);
    assert.equal(threadsOf(out).at(-1).question, '⚠ Erreur signalée par Carole : Il manque le beurre');
  });
});

test.describe('Relecture par la famille (site)', () => {
  let t;
  test.beforeEach(async () => { t = await startApp(); });
  test.afterEach(async () => { await t.close(); });

  // Connexion avec prénom : renvoie les cookies (famille + prénom).
  async function login(prenom = 'carole') {
    const res = await t.req('/connexion', { method: 'POST', body: t.form({ prenom, motdepasse: FAMILY }) });
    assert.equal(res.status, 302);
    return res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  }
  const linkCookie = async () => (await t.req(`/entrer?cle=${FAMILY}`)).headers.get('set-cookie').split(';')[0];
  const post = (url, cookie, data) => t.req(url, { method: 'POST', body: t.form(data), headers: { cookie } });
  const page = async (url, cookie) => (await t.req(url, { headers: { cookie } })).text();

  test.describe('Connexion avec prénom', () => {
    test('le formulaire demande le prénom ; sans prénom, refusé', async () => {
      assert.match(await (await t.req('/connexion')).text(), /name="prenom"/);
      const res = await t.req('/connexion', { method: 'POST', body: t.form({ motdepasse: FAMILY }) });
      assert.equal(res.status, 400);
      assert.match(await res.text(), /prénom/);
    });

    test('le prénom est retenu (majuscule ajoutée) et affiché en pied de page', async () => {
      const cookie = await login('  carole ');
      assert.match(cookie, /prenom=Carole/);
      assert.match(await page('/', cookie), /Connecté·e : <b>Carole<\/b>/);
    });

    test('déconnexion : efface les cookies et revient à la connexion', async () => {
      const cookie = await login();
      assert.match(await page('/', cookie), /action="\/deconnexion"/);
      const res = await t.req('/deconnexion', { method: 'POST', headers: { cookie } });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/connexion');
      const cleared = res.headers.getSetCookie().join('\n');
      assert.match(cleared, /famille=;/);
      assert.match(cleared, /prenom=;/);
    });
  });

  test.describe('Questions sur la page recette', () => {
    test('affichées dans la relecture avec un champ de réponse, pas dans les étapes', async () => {
      const html = await page('/recette/pounty', await login());
      const [steps, revue] = html.split('id="revue"');
      assert.doesNotMatch(steps, /point à vérifier/);
      assert.match(revue, /point à vérifier avec Annie/);
      assert.match(revue, /action="\/recette\/pounty\/repondre"/);
      assert.match(revue, /name="reponse"/);
      assert.doesNotMatch(revue, /name="prenom"/); // prénom déjà connu
    });

    test('répondre : écrit dans le .cook, commite au nom de la personne, affiche la réponse', async () => {
      const cookie = await login();
      const res = await post('/recette/pounty/repondre', cookie, { index: '0', question: 'point à vérifier avec Annie', reponse: 'C\'est bon,\nc\'est 180 °C' });
      assert.equal(res.status, 302);
      assert.match(res.headers.get('location'), /^\/recette\/pounty\?merci=reponse#revue$/);
      assert.match(t.read('Pounty.cook'), /\n-- point à vérifier avec Annie ↳ Carole : C'est bon, c'est 180 °C\n/);
      assert.equal(t.log(), 'Carole (site)|Site : réponse de Carole sur « Pounty de ma mamie »');
      assert.equal(t.status(), '');
      const html = await page('/recette/pounty?merci=reponse', cookie);
      assert.match(html, /<b>Carole<\/b> : C&#39;est bon, c&#39;est 180 °C/);
      assert.match(html, /ta réponse est enregistrée/);
    });

    test('question modifiée entre-temps : refus, fichier intact', async () => {
      const cookie = await login();
      const before = t.read('Pounty.cook');
      const res = await post('/recette/pounty/repondre', cookie, { index: '0', question: 'une autre question', reponse: 'x' });
      assert.equal(res.status, 409);
      assert.equal(t.read('Pounty.cook'), before);
    });

    test('entrée par le lien secret (prénom inconnu) : le formulaire demande le prénom et le retient', async () => {
      const cookie = await linkCookie();
      assert.match((await page('/recette/pounty', cookie)).split('id="revue"')[1], /name="prenom"/);
      assert.equal((await post('/recette/pounty/repondre', cookie, { index: '0', question: 'point à vérifier avec Annie', reponse: 'x' })).status, 400);
      const res = await post('/recette/pounty/repondre', cookie, { index: '0', question: 'point à vérifier avec Annie', reponse: 'x', prenom: 'gaétan' });
      assert.equal(res.status, 302);
      assert.match(res.headers.getSetCookie().join(), /prenom=Ga/);
      assert.match(t.read('Pounty.cook'), /↳ Gaétan : x/);
    });

    test('réponse vide refusée', async () => {
      const res = await post('/recette/pounty/repondre', await login(), { index: '0', question: 'point à vérifier avec Annie', reponse: '  ' });
      assert.equal(res.status, 400);
    });
  });

  test.describe('Conforme à l\'original', () => {
    test('cochée par un membre de la famille : verifie = prénom + date, commit, affichage', async () => {
      const cookie = await login();
      const res = await post('/recette/galette-seche/conforme', cookie, { conforme: '1' });
      assert.equal(res.status, 302);
      assert.match(t.read('Galette sèche.cook'), /\nverifie: Carole \d{4}-\d{2}-\d{2}\n/);
      assert.equal(t.log(), 'Carole (site)|Site : « Galette sèche » vérifiée par Carole');
      assert.match(await page('/recette/galette-seche', cookie), /name="conforme"[^>]*checked/);
      // Décochée : le champ est vidé
      await post('/recette/galette-seche/conforme', cookie, {});
      assert.match(t.read('Galette sèche.cook'), /\nverifie:\s*\n/);
    });

    test('refusée tant qu\'il reste des questions (case grisée)', async () => {
      const cookie = await login();
      assert.match((await page('/recette/pounty', cookie)).split('id="revue"')[1], /name="conforme"[^>]*disabled/);
      const before = t.read('Pounty.cook');
      assert.equal((await post('/recette/pounty/conforme', cookie, { conforme: '1' })).status, 409);
      assert.equal(t.read('Pounty.cook'), before);
    });

    test('l\'aperçu de l\'admin n\'affiche pas la relecture', async () => {
      const res = await t.admin('/admin/apercu', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: t.read('Pounty.cook') }) });
      assert.doesNotMatch(await res.text(), /id="revue"/);
    });
  });

  test.describe('Signaler une erreur', () => {
    test('ajoute un commentaire en fin de recette, la dé-vérifie, et devient une question', async () => {
      const cookie = await login();
      await post('/recette/galette-seche/conforme', cookie, { conforme: '1' });
      const res = await post('/recette/galette-seche/erreur', cookie, { texte: 'Il manque le beurre' });
      assert.equal(res.status, 302);
      assert.match(res.headers.get('location'), /merci=erreur/);
      const src = t.read('Galette sèche.cook');
      assert.match(src, /\n\n-- ⚠ Erreur signalée par Carole : Il manque le beurre\n$/);
      assert.match(src, /\nverifie:\s*\n/);
      assert.equal(t.log(), 'Carole (site)|Site : erreur signalée sur « Galette sèche » par Carole');
      const revue = (await page('/recette/galette-seche', cookie)).split('id="revue"')[1];
      assert.match(revue, /Erreur signalée par Carole : Il manque le beurre/);
      assert.match(revue, /name="conforme"[^>]*disabled/);
    });

    test('texte vide refusé ; recette inconnue → 404', async () => {
      const cookie = await login();
      assert.equal((await post('/recette/galette-seche/erreur', cookie, { texte: '' })).status, 400);
      assert.equal((await post('/recette/nope/erreur', cookie, { texte: 'x' })).status, 404);
    });

    test('sans connexion famille : redirigé, rien n\'est écrit', async () => {
      const before = t.read('Galette sèche.cook');
      assert.equal((await post('/recette/galette-seche/erreur', '', { texte: 'x', prenom: 'X' })).headers.get('location'), '/connexion');
      assert.equal(t.read('Galette sèche.cook'), before);
    });
  });
});

test.describe('Page recette en trois colonnes (fiche d\'origine | recette | relecture)', () => {
  let t;
  test.beforeEach(async () => { t = await startApp(); });
  test.afterEach(async () => { await t.close(); });
  const cookieOf = async () => (await t.req('/connexion', { method: 'POST', body: t.form({ prenom: 'Carole', motdepasse: FAMILY }) })).headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const page = async (url, cookie) => (await t.req(url, { headers: { cookie } })).text();
  const side = (html, which) => (html.match(new RegExp(`<div class="side side-${which}"[^>]*>`)) || [''])[0];

  test('fiche d\'origine dans la colonne de gauche, repliée par défaut, plus dans la recette', async () => {
    const html = await page('/recette/galette-seche', await cookieOf());
    assert.match(html, /class="recipe-layout"/);
    assert.match(side(html, 'left'), /data-open="false"/);
    assert.match(html, /<button type="button" class="side-toggle"[^>]*aria-controls="cote-original"[^>]*aria-expanded="false"/);
    assert.match(html, /id="cote-original"[\s\S]*src="\/photos\/Originaux\/galette\.jpg"/);
    assert.doesNotMatch(html, /class="originals"/);
  });

  test('sans fiche d\'origine : pas de bouton à gauche', async () => {
    assert.doesNotMatch(await page('/recette/pounty', await cookieOf()), /aria-controls="cote-original"/);
  });

  test('relecture à droite, repliée par défaut, ouverte après une action', async () => {
    const cookie = await cookieOf();
    const html = await page('/recette/pounty', cookie);
    assert.match(side(html, 'right'), /data-open="false"/);
    assert.match(html, /<button type="button" class="side-toggle"[^>]*aria-controls="revue"[^>]*aria-expanded="false"/);
    assert.match(side(await page('/recette/pounty?merci=reponse', cookie), 'right'), /data-open="true"/);
    const refused = await t.req('/recette/pounty/conforme', { method: 'POST', body: t.form({ conforme: '1' }), headers: { cookie } });
    assert.match(side(await refused.text(), 'right'), /data-open="true"/);
  });

  test('statut visible replié : ⚠ s\'il reste une question ou si elle n\'est pas vérifiée, ✓ si tout est bon', async () => {
    const cookie = await cookieOf();
    const toggle = html => html.match(/<button type="button" class="side-toggle"[^>]*aria-controls="revue"[\s\S]*?<\/button>/)[0];
    const pounty = toggle(await page('/recette/pounty', cookie));
    assert.match(pounty, /data-status="warn"/);
    assert.match(pounty, /icon-alert/);
    assert.match(pounty, /1 question en suspens/);
    const galette = toggle(await page('/recette/galette-seche', cookie));
    assert.match(galette, /data-status="warn"/);
    assert.match(galette, /pas encore vérifiée/);
    await t.req('/recette/galette-seche/conforme', { method: 'POST', body: t.form({ conforme: '1' }), headers: { cookie } });
    const ok = toggle(await page('/recette/galette-seche', cookie));
    assert.match(ok, /data-status="ok"/);
    assert.match(ok, /icon-check/);
  });
});

test.describe('Personnes d\'une recette sans doublon', () => {
  const { peopleOf } = require('../src/recipes');
  test('peopleOf : même prénom en auteur et en origine (casse ou espaces différents) → une seule fois', () => {
    assert.deepEqual(peopleOf({ meta: { author: 'Carole', from: ' carole ' } }), ['Carole']);
    assert.deepEqual(peopleOf({ meta: { author: 'Maman', from: ['Carole', 'maman'] } }), ['Maman', 'Carole']);
  });

  test('relecture : « Idéalement cochée par Carole », pas « Carole ou Carole »', async () => {
    const t = await startApp();
    try {
      require('fs').writeFileSync(require('path').join(t.recipesDir, 'Gâteau au yaourt.cook'),
        '---\ntitle: Gâteau au yaourt\nauthor: Carole\nfrom: Carole\n---\n\nMélanger.\n');
      const cookie = (await t.req(`/entrer?cle=${FAMILY}`)).headers.get('set-cookie').split(';')[0];
      const html = await (await t.req('/recette/gateau-au-yaourt', { headers: { cookie } })).text();
      assert.match(html, /Idéalement cochée par Carole\./);
      assert.doesNotMatch(html, /Carole ou Carole/);
    } finally { await t.close(); }
  });
});

test.describe('Colonnes latérales flottantes (grand écran)', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'style.css'), 'utf8');
  const desktop = css.slice(css.indexOf('/* Grand écran : colonnes latérales'));
  test('rails fixés aux bords de l\'écran, panneaux par-dessus : la recette ne bouge pas', () => {
    assert.ok(desktop.length < css.length, 'bloc CSS « Grand écran : colonnes latérales » introuvable');
    assert.match(desktop, /\.side \{[^}]*position: fixed/);
    assert.match(desktop, /\.side-left \{[^}]*left: 16px/);
    assert.match(desktop, /\.side-right \{[^}]*right: 16px/);
    assert.doesNotMatch(desktop, /\.recipe-layout \{[^}]*grid/); // plus de colonnes qui poussent la recette
  });
});
