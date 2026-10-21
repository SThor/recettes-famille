// Glossaire des étiquettes (Recettes/Étiquettes.md) : page « Étiquettes », page d'une étiquette,
// info-bulles, filtre par plusieurs étiquettes, étiquettes hors glossaire dans l'admin.
// Et l'indice « temps de cuisson » de l'admin (minuteurs sans `cook time`).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startApp, FAMILY } = require('./helpers');
const { parseGlossary } = require('../src/glossaire');

const GLOSSAIRE = `---
type: note
---
Retour : [[Livre de recettes de famille]]

Glossaire des étiquettes, une par ligne, rangées par famille.
- une liste hors famille est ignorée

## Occasion
- \`galette des rois\` — pour l'Épiphanie.
- \`pique-nique\` — se transporte bien.

## Région
- \`auvergne\` — recettes d'Auvergne, comme le pounty.
`;

test.describe('Lecture du glossaire', () => {
  test('familles dans l\'ordre, étiquettes et définitions ; le reste du fichier est ignoré', () => {
    assert.deepEqual(parseGlossary(GLOSSAIRE), [
      { family: 'Occasion', tags: [{ name: 'galette des rois', definition: 'pour l\'Épiphanie.' }, { name: 'pique-nique', definition: 'se transporte bien.' }] },
      { family: 'Région', tags: [{ name: 'auvergne', definition: 'recettes d\'Auvergne, comme le pounty.' }] },
    ]);
  });
  test('tiret simple ou demi-cadratin accepté, fins de ligne Windows, fichier absent ou vide', () => {
    assert.deepEqual(parseGlossary('## F\r\n- `a` - déf a\r\n- `b` – déf b\r\n')[0].tags, [{ name: 'a', definition: 'déf a' }, { name: 'b', definition: 'déf b' }]);
    assert.deepEqual(parseGlossary(''), []);
    assert.deepEqual(parseGlossary(null), []);
  });
});

test.describe('Étiquettes sur le site', () => {
  let t, cookie;
  test.beforeEach(async () => {
    t = await startApp();
    fs.writeFileSync(path.join(t.recipesDir, 'Étiquettes.md'), GLOSSAIRE);
    cookie = (await t.req(`/entrer?cle=${FAMILY}`)).headers.get('set-cookie').split(';')[0];
  });
  test.afterEach(async () => { await t.close(); });
  const get = async url => (await t.req(url, { headers: { cookie } })).text();
  const cardsOf = html => [...html.matchAll(/<li class="card"(?![^>]*\bhidden\b)[^>]*>\s*<a href="\/recette\/([^"]+)"/g)].map(m => m[1]).sort();

  test('page « Étiquettes » : familles, définitions, nombre de recettes, et les étiquettes hors glossaire', async () => {
    const html = await get('/etiquettes');
    assert.match(html, /<h1>Étiquettes<\/h1>/);
    const occasion = html.indexOf('<h2>Occasion</h2>');
    const region = html.indexOf('<h2>Région</h2>');
    assert.ok(occasion > 0 && region > occasion);
    assert.match(html, /<a class="tag" href="\/etiquette\/galette%20des%20rois">galette des rois<\/a> <span class="count">1 recette<\/span>[\s\S]*?<p class="definition">pour l&#39;Épiphanie.<\/p>/);
    assert.match(html, /<a class="tag" href="\/etiquette\/pique-nique">pique-nique<\/a> <span class="count">aucune recette<\/span>/);
    assert.match(html, /<h2>Sans définition<\/h2>[\s\S]*<a class="tag" href="\/etiquette\/four">four<\/a>/);
  });

  test('page d\'une étiquette : définition et recettes, sans panneau de filtres ; insensible à la casse', async () => {
    const html = await get('/etiquette/Auvergne');
    assert.match(html, /<h1>[\s\S]*auvergne<\/h1>/);
    assert.match(html, /<p class="definition">recettes d&#39;Auvergne, comme le pounty.<\/p>/);
    assert.match(html, /<p class="family">Région<\/p>/);
    assert.deepEqual(cardsOf(html), ['pounty']);
    assert.doesNotMatch(html, /filters-panel/);
    assert.match(html, /href="\/\?tag=auvergne"/); // pour combiner avec d'autres filtres
    assert.match(html, /href="\/etiquettes"/);
  });

  test('page d\'une étiquette du glossaire sans recette ; étiquette inconnue → 404', async () => {
    assert.match(await get('/etiquette/pique-nique'), /Aucune recette pour l’instant/);
    assert.equal((await t.req('/etiquette/introuvable', { headers: { cookie } })).status, 404);
  });

  test('étiquettes d\'une recette : lien vers leur page, définition en info-bulle', async () => {
    const html = await get('/recette/pounty');
    assert.match(html, /<a class="tag" href="\/etiquette\/auvergne" title="recettes d&#39;Auvergne, comme le pounty.">auvergne<\/a>/);
    assert.match(html, /<a class="tag" href="\/etiquette\/four">four<\/a>/); // hors glossaire : pas d'info-bulle
  });

  test('nuage d\'étiquettes de l\'accueil : définition en info-bulle, lien vers le glossaire', async () => {
    const html = await get('/');
    assert.match(html, /<a class="option tag" href="\/\?tag=auvergne" title="recettes d&#39;Auvergne, comme le pounty.">auvergne <span class="count">1<\/span><\/a>/);
    assert.match(html.slice(html.indexOf('<details class="tag-cloud kind-tag"')), /href="\/etiquettes"/);
  });
});

test.describe('Filtre par plusieurs étiquettes', () => {
  let t, cookie;
  test.beforeEach(async () => {
    t = await startApp();
    fs.writeFileSync(path.join(t.recipesDir, 'Galette auvergnate.cook'), '---\ntitle: Galette auvergnate\ntags: [auvergne, galette des rois]\n---\n\nMélanger.\n');
    cookie = (await t.req(`/entrer?cle=${FAMILY}`)).headers.get('set-cookie').split(';')[0];
  });
  test.afterEach(async () => { await t.close(); });
  const get = async url => (await t.req(url, { headers: { cookie } })).text();
  const cardsOf = html => [...html.matchAll(/<li class="card"(?![^>]*\bhidden\b)[^>]*>\s*<a href="\/recette\/([^"]+)"/g)].map(m => m[1]).sort();

  test('?tag=a&tag=b : recettes qui ont toutes ces étiquettes', async () => {
    assert.deepEqual(cardsOf(await get('/?tag=auvergne')), ['galette-auvergnate', 'pounty']);
    assert.deepEqual(cardsOf(await get('/?tag=auvergne&tag=galette%20des%20rois')), ['galette-auvergnate']);
    assert.deepEqual(cardsOf(await get('/?tag=four&tag=galette%20des%20rois')), []);
  });

  test('une pastille par étiquette ; sa croix ne retire que celle-là', async () => {
    const html = await get('/?tag=auvergne&tag=four');
    assert.match(html, /Étiquette : <b>auvergne<\/b><\/span><a class="pill-remove" href="\/\?tag=four"/);
    assert.match(html, /Étiquette : <b>four<\/b><\/span><a class="pill-remove" href="\/\?tag=auvergne"/);
  });

  test('nuage : une étiquette s\'ajoute à la sélection ; une étiquette déjà choisie se retire', async () => {
    const html = await get('/?tag=auvergne');
    const cloud = html.slice(html.indexOf('<details class="tag-cloud kind-tag"'), html.indexOf('</details>', html.indexOf('<details class="tag-cloud kind-tag"')));
    assert.match(cloud, /<a class="option tag" href="\/\?tag=auvergne&amp;tag=four">four/);
    assert.match(cloud, /<a class="option tag" href="\/" aria-current="true">auvergne/);
  });
});

test.describe('Admin', () => {
  let t;
  test.beforeEach(async () => { t = await startApp(); });
  test.afterEach(async () => { await t.close(); });

  test('étiquettes utilisées mais absentes du glossaire, avec leurs recettes', async () => {
    fs.writeFileSync(path.join(t.recipesDir, 'Étiquettes.md'), GLOSSAIRE);
    const html = await (await t.admin('/admin')).text();
    assert.match(html, /<div class="glossary-missing">[\s\S]*Étiquettes absentes du glossaire[\s\S]*<b>four<\/b>[\s\S]*Pounty de ma mamie[\s\S]*<\/div>/);
    assert.doesNotMatch(html.match(/<div class="glossary-missing">[\s\S]*?<\/div>/)[0], /<b>auvergne<\/b>/);
  });

  test('sans glossaire : pas d\'alerte', async () => {
    assert.doesNotMatch(await (await t.admin('/admin')).text(), /glossary-missing/);
  });

  test('minuteurs mais pas de cook time : indice dans le suivi et dans l\'aperçu ; rien si cook time est rempli', async () => {
    // Pounty : ~{45%minutes}, pas de cook time.
    const html = await (await t.admin('/admin')).text();
    assert.match(html, /<span class="hint">Pas de temps de cuisson ; minuteurs : 45 minutes<\/span>/);
    const preview = src => t.admin('/admin/apercu', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: src }) }).then(r => r.text());
    const src = '---\ntitle: X\n---\n\nCuire ~{30%minutes} puis dorer ~{10-15%minutes}.\n';
    assert.match(await preview(src), /<p class="warning">⚠ Pas de temps de cuisson ; minuteurs : 30 minutes \+ 10 à 15 minutes<\/p>/);
    assert.doesNotMatch(await preview(src.replace('title: X', 'title: X\ncook time: 45 minutes')), /Pas de temps de cuisson/);
  });
});

test.describe('Panneau de filtres : options actives homogènes', () => {
  let t, cookie;
  test.beforeEach(async () => {
    t = await startApp();
    fs.writeFileSync(path.join(t.recipesDir, 'Salade.cook'), '---\ntitle: Salade\nauthor: Annie\ndiet: végétarien\ntags: [auvergne]\n---\n\nMélanger.\n');
    cookie = (await t.req(`/entrer?cle=${FAMILY}`)).headers.get('set-cookie').split(';')[0];
  });
  test.afterEach(async () => { await t.close(); });
  const get = async url => (await t.req(url, { headers: { cookie } })).text();

  test('personne, régime, relecture et étiquette actifs : aria-current, et un clic retire ce filtre seulement', async () => {
    const html = await get('/?personne=Annie&regime=v%C3%A9g%C3%A9tarien&relecture=a-verifier&tag=auvergne');
    assert.match(html, /<a class="option person" href="\/\?regime=v%C3%A9g%C3%A9tarien&amp;relecture=a-verifier&amp;tag=auvergne" aria-current="true">Annie/);
    assert.match(html, /<a class="option diet" href="\/\?personne=Annie&amp;relecture=a-verifier&amp;tag=auvergne" aria-current="true">végétarien/);
    assert.match(html, /<a class="option review" data-state="a-verifier" href="\/\?personne=Annie&amp;regime=v%C3%A9g%C3%A9tarien&amp;tag=auvergne" aria-current="true">/);
    assert.match(html, /<a class="option tag" href="\/\?personne=Annie&amp;regime=v%C3%A9g%C3%A9tarien&amp;relecture=a-verifier" aria-current="true"/);
  });

  test('options inactives : pas d\'aria-current', async () => {
    const html = await get('/?personne=Annie');
    assert.deepEqual([...html.matchAll(/<a class="option person"[^>]*aria-current="true">([^ <]+)/g)].map(m => m[1]), ['Annie']);
    assert.doesNotMatch(html, /<a class="option diet"[^>]*aria-current/);
    assert.doesNotMatch(html, /<a class="review"[^>]*aria-current/);
  });
});

test.describe('Panneau de filtres : un seul composant d\'option', () => {
  let t, cookie;
  test.beforeEach(async () => {
    t = await startApp();
    fs.writeFileSync(path.join(t.recipesDir, 'Salade.cook'), '---\ntitle: Salade\nauthor: Annie\ndiet: végétarien\ntags: [auvergne]\n---\n\nMélanger.\n');
    cookie = (await t.req(`/entrer?cle=${FAMILY}`)).headers.get('set-cookie').split(';')[0];
  });
  test.afterEach(async () => { await t.close(); });

  test('personnes, régimes, cuisines, étiquettes et relecture : toutes les options ont la classe « option » (+ leur type)', async () => {
    const html = await (await t.req('/?tag=auvergne', { headers: { cookie } })).text();
    const panel = html.slice(html.indexOf('<aside class="filters-panel"'), html.indexOf('</aside>'));
    const links = [...panel.matchAll(/<div class="tags">([\s\S]*?)<\/div>/g)].flatMap(m => [...m[1].matchAll(/<a class="([^"]*)"/g)].map(x => x[1]));
    assert.ok(links.length >= 6);
    for (const cls of links) assert.match(cls, /^option (person|diet|cuisine|tag|review)$/);
    for (const kind of ['person', 'diet', 'cuisine', 'tag', 'review']) assert.ok(links.includes(`option ${kind}`), kind);
  });
});
