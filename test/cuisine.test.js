// Filtre « type de cuisine » de l'accueil : clé d'en-tête `cuisine` (texte ou liste), comme les régimes.
// La précision entre parenthèses (« indienne (Kerala) ») reste sur la recette mais ne fait pas une cuisine à part.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startApp, FAMILY } = require('./helpers');

test.describe('Filtre par type de cuisine', () => {
  let t, cookie;
  test.before(async () => {
    t = await startApp();
    cookie = (await t.req(`/entrer?cle=${FAMILY}`)).headers.get('set-cookie').split(';')[0];
  });
  test.after(async () => { await t.close(); });
  const get = async url => (await t.req(url, { headers: { cookie } })).text();
  const cardsOf = html => [...html.matchAll(/<li class="card"(?![^>]*\bhidden\b)[^>]*>\s*<a href="\/recette\/([^"]+)"/g)].map(m => m[1]).sort();
  const block = html => html.slice(html.indexOf('<details class="cuisines kind-cuisine'), html.indexOf('</details>', html.indexOf('<details class="cuisines kind-cuisine')));

  test.beforeEach(() => {
    fs.writeFileSync(path.join(t.recipesDir, 'Halwa.cook'), '---\ntitle: Halwa\ncuisine: indienne (Kerala)\n---\n\nCuire.\n');
    fs.writeFileSync(path.join(t.recipesDir, 'Dal.cook'), '---\ntitle: Dal\ncuisine: Indienne\n---\n\nCuire.\n');
  });

  test('bloc « Cuisine » dans le panneau, avec compteurs, sans la précision entre parenthèses', async () => {
    const row = block(await get('/'));
    assert.match(row, /<summary class="filter-title"><svg class="icon icon-globe"[^>]*>[\s\S]*?<\/svg> Cuisine <span class="count">2<\/span><\/summary>/);
    assert.match(row, /<a class="option cuisine" href="\/\?cuisine=indienne">indienne <span class="count">2<\/span><\/a>/);
    assert.match(row, /<a class="option cuisine" href="\/\?cuisine=auvergnate">auvergnate <span class="count">1<\/span><\/a>/);
    assert.doesNotMatch(row, /Kerala/);
  });

  test('le panneau place la cuisine après les régimes', async () => {
    const html = await get('/');
    assert.ok(html.indexOf('kind-cuisine') > html.indexOf('kind-diet') || !html.includes('kind-diet'));
    assert.ok(html.indexOf('kind-cuisine') < html.indexOf('kind-duree'));
  });

  test('l\'accueil ne garde que les recettes de cette cuisine, avec une pastille active', async () => {
    const html = await get('/?cuisine=Indienne');
    assert.deepEqual(cardsOf(html), ['dal', 'halwa']);
    assert.match(html, /<details class="cuisines kind-cuisine" open>/);
    assert.match(html, /<a class="option cuisine" href="\/" aria-current="true">indienne/);
    assert.match(html, /<li class="filter-pill cuisine"><span class="pill-label"><svg class="icon icon-globe"[^>]*>[\s\S]*?<\/svg> Cuisine : <b>Indienne<\/b><\/span><a class="pill-remove" href="\/" aria-label="Retirer ce filtre">×<\/a><\/li>/);
  });

  test('cuisine et étiquette se combinent', async () => {
    const html = await get('/?cuisine=auvergnate&tag=four');
    assert.deepEqual(cardsOf(html), ['pounty']);
    assert.match(html, /Cuisine : <b>auvergnate<\/b><\/span><a class="pill-remove" href="\/\?tag=four"/);
  });

  test('sur la page recette, la cuisine mène à l\'accueil filtré (précision gardée dans le texte)', async () => {
    const html = await get('/recette/halwa');
    assert.match(html, /<dt>Cuisine<\/dt><dd><a href="\/\?cuisine=indienne">indienne \(Kerala\)<\/a><\/dd>/);
  });

});

// Dans sa propre app : le store garde les recettes en cache quelques secondes après un premier chargement.
test('pas de cuisine renseignée : pas de bloc', async () => {
  const t = await startApp();
  try {
    fs.writeFileSync(path.join(t.recipesDir, 'Pounty.cook'), t.read('Pounty.cook').replace(/^cuisine:.*\n/m, ''));
    const cookie = (await t.req(`/entrer?cle=${FAMILY}`)).headers.get('set-cookie').split(';')[0];
    assert.doesNotMatch(await (await t.req('/', { headers: { cookie } })).text(), /kind-cuisine/);
  } finally { await t.close(); }
});
