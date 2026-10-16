// Clés d'en-tête des personnes et de la vérification :
//   author     = la personne dont c'est la recette (« Recette de », clé standard Cooklang)
//   shared by  = la personne de la famille qui l'a transmise, si différente (« Transmise par »)
//   checked by = qui l'a vérifiée conforme à l'original, et quand (« Prénom AAAA-MM-JJ »)
// Les anciennes clés `from` et `verifie` ne sont plus lues.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startApp, FAMILY } = require('./helpers');

let t, cookie;
test.beforeEach(async () => {
  t = await startApp();
  cookie = (await t.req(`/entrer?cle=${FAMILY}`)).headers.get('set-cookie').split(';')[0];
});
test.afterEach(async () => { await t.close(); });
const get = async url => (await t.req(url, { headers: { cookie } })).text();
const write = (file, meta) => fs.writeFileSync(path.join(t.recipesDir, file), `---\n${meta}\n---\n\nMélanger.\n`);
const cardOf = (html, slug) => {
  const i = html.indexOf(`<a href="/recette/${slug}"`);
  return html.slice(i, html.indexOf('</li>', i));
};

test('carte : « de » + la personne dont c\'est la recette, sinon celle qui l\'a transmise', async () => {
  write('Clafoutis.cook', 'title: Clafoutis\nauthor: Grand-Maman\nshared by: Maman');
  write('Brandade.cook', 'title: Brandade\nshared by: Maman\nsource: magazine');
  write('Chocisson.cook', 'title: Chocisson');
  const html = await get('/');
  assert.match(cardOf(html, 'clafoutis'), /<span class="card-meta">de Grand-Maman<\/span>/);
  assert.match(cardOf(html, 'brandade'), /<span class="card-meta">de Maman<\/span>/);
  assert.doesNotMatch(cardOf(html, 'chocisson'), /card-meta/);
});

test('les anciennes clés from et verifie ne sont plus lues', async () => {
  write('Vieille.cook', 'title: Vieille\nfrom: Personne-Ancienne\nverifie: Paul 2026-01-01');
  const home = await get('/');
  assert.doesNotMatch(home, /Personne-Ancienne/);
  assert.doesNotMatch(cardOf(home, 'vieille'), /card-review/); // pas « vérifiée »
  const page = await get('/recette/vieille');
  assert.doesNotMatch(page, /Recette de|Transmise par/);
  assert.match(page, /name="conforme" value="1"(?![^>]*checked)/);
});

test('page recette : la case « Conforme » lit checked by', async () => {
  write('Finie.cook', 'title: Finie\nchecked by: Paul 2026-10-16');
  const page = await get('/recette/finie');
  assert.match(page, /name="conforme" value="1" checked/);
  assert.match(page, /\(Paul 2026-10-16\)/);
});

test('modèles de l\'admin : author, shared by et checked by, plus de verifie', async () => {
  const html = await (await t.admin('/admin/recettes/nouvelle')).text();
  assert.match(html, /\nauthor: \nshared by: \n/);
  assert.match(html, /\nchecked by:\n/);
  assert.doesNotMatch(html, /verifie:/);
});
