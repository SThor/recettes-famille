// Page de test des composants : chaque composant d'interface, dans les trois thèmes côte à côte,
// pour valider un changement graphique sur une seule page (et une seule capture).
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers');
const { THEMES } = require('../src/views');

test.describe('Page de test des composants', () => {
  let t, html;
  test.before(async () => {
    t = await startApp();
    const res = await t.req('/composants');
    assert.equal(res.status, 200, 'accessible sans connexion, comme les styles d\'essai');
    html = await res.text();
  });
  test.after(async () => { await t.close(); });

  test('une colonne par thème, dans l\'ordre des thèmes', () => {
    const cols = [...html.matchAll(/<section class="specimen theme-([a-z]+)"/g)].map(m => m[1]);
    assert.deepEqual(cols, Object.keys(THEMES));
  });

  test('charge les feuilles et polices de tous les thèmes', () => {
    for (const theme of Object.keys(THEMES).filter(k => k !== 'simple')) {
      assert.match(html, new RegExp(`href="/static/themes/${theme}\\.css\\?v=`));
      assert.match(html, new RegExp(`href="/static/fonts/${theme}\\.css\\?v=`));
    }
  });

  test('chaque colonne montre les composants, chacun avec un ancre de section', () => {
    const cols = html.split('<section class="specimen ').slice(1);
    const kinds = ['person', 'diet', 'duree', 'tag', 'review'];
    for (const col of cols) {
      for (const id of ['boutons', 'filtres', 'pastilles', 'cartes', 'recette']) assert.match(col, new RegExp(`data-part="${id}"`), id);
      // Options du panneau de filtres : chaque type, inactive et active.
      for (const k of kinds.filter(k => k !== 'duree')) {
        assert.match(col, new RegExp(`<a class="option ${k}"[^>]*href="#"[^>]*>`), `option ${k}`);
        assert.match(col, new RegExp(`<a class="option ${k}"[^>]*aria-current="true"`), `option ${k} active`);
      }
      for (const k of kinds) assert.match(col, new RegExp(`<li class="filter-pill ${k}">`), `pastille ${k}`);
      // Cartes : sans relecture, vérifiée, questions.
      assert.match(col, /<span class="card-review" data-state="ok"/);
      assert.match(col, /<span class="card-review" data-state="questions"/);
      for (const cls of ['class="button"', 'class="chip"', 'class="tag"', 'class="step-no"', 'class="note"', 'class="facts"']) assert.ok(col.includes(cls), cls);
    }
  });

  test('les liens d\'exemple ne mènent nulle part', () => {
    const body = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
    const hrefs = [...body.matchAll(/href="([^"]*)"/g)].map(m => m[1]);
    assert.ok(hrefs.length);
    assert.deepEqual([...new Set(hrefs)], ['#']);
  });
});
