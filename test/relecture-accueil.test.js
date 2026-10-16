// Relecture visible depuis la liste des recettes : icône sur les cartes et filtre « Relecture ».
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, FAMILY } = require('./helpers');
const { reviewStateOf } = require('../src/revue');

test.describe('État de relecture d\'une recette', () => {
  const r = (verifie, threads) => ({ meta: { 'checked by': verifie }, threads: Array.from({ length: threads }, () => ({ question: 'q', answers: [] })) });
  test('vérifiée sans question → ok ; question en suspens → questions (même si vérifiée) ; sinon → a-verifier', () => {
    assert.equal(reviewStateOf(r('Paul 2026-10-16', 0)), 'ok');
    assert.equal(reviewStateOf(r('', 1)), 'questions');
    assert.equal(reviewStateOf(r('Paul 2026-10-16', 2)), 'questions');
    assert.equal(reviewStateOf(r('', 0)), 'a-verifier');
    assert.equal(reviewStateOf(r(null, 0)), 'a-verifier');
  });
});

test.describe('Accueil : relecture', () => {
  let t, cookie;
  test.beforeEach(async () => {
    t = await startApp();
    cookie = (await t.req('/connexion', { method: 'POST', body: t.form({ prenom: 'Carole', motdepasse: FAMILY }) }))
      .headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  });
  test.afterEach(async () => { await t.close(); });
  const get = async url => (await t.req(url, { headers: { cookie } })).text();
  const cardsOf = html => [...html.matchAll(/<li class="card"(?![^>]*\bhidden\b)[^>]*>\s*<a href="\/recette\/([^"]+)"/g)].map(m => m[1]).sort();
  const cardOf = (html, slug) => html.match(new RegExp(`<li class="card"[^>]*>\\s*<a href="/recette/${slug}"[\\s\\S]*?</li>`))[0];
  const verify = slug => t.req(`/recette/${slug}/conforme`, { method: 'POST', body: t.form({ conforme: '1' }), headers: { cookie } });

  test('icône sur les cartes : ⚠ questions à résoudre, ✓ vérifiée, rien si simplement pas encore vérifiée', async () => {
    let html = await get('/');
    assert.match(cardOf(html, 'pounty'), /class="card-review" data-state="questions"[^>]*title="Questions à résoudre"[\s\S]*icon-alert/);
    assert.doesNotMatch(cardOf(html, 'galette-seche'), /card-review/);
    await verify('galette-seche');
    html = await get('/');
    assert.match(cardOf(html, 'galette-seche'), /class="card-review" data-state="ok"[^>]*title="Vérifiée[\s\S]*icon-check/);
  });

  test('filtre ?relecture= : questions, ok, a-verifier ; valeur inconnue ignorée', async () => {
    assert.deepEqual(cardsOf(await get('/?relecture=questions')), ['pounty']);
    assert.deepEqual(cardsOf(await get('/?relecture=a-verifier')), ['galette-seche']);
    assert.deepEqual(cardsOf(await get('/?relecture=ok')), []);
    await verify('galette-seche');
    assert.deepEqual(cardsOf(await get('/?relecture=ok')), ['galette-seche']);
    assert.deepEqual(cardsOf(await get('/?relecture=nimporte')), ['galette-seche', 'pounty']);
  });

  test('panneau : bloc « Relecture » avec les trois choix et leurs nombres, ouvert si actif ; pastille', async () => {
    let html = await get('/');
    const block = html.match(/<details class="review-filter"[\s\S]*?<\/details>/)[0];
    assert.doesNotMatch(block, /<details class="review-filter" open/);
    assert.match(block, /href="\/\?relecture=ok"[^>]*>[\s\S]*Vérifiées <span class="count">0<\/span>/);
    assert.match(block, /href="\/\?relecture=questions"[^>]*>[\s\S]*Questions à résoudre <span class="count">1<\/span>/);
    assert.match(block, /href="\/\?relecture=a-verifier"[^>]*>[\s\S]*Pas encore vérifiées <span class="count">1<\/span>/);
    html = await get('/?tag=four&relecture=questions');
    assert.match(html, /<details class="review-filter" open/);
    assert.match(html, /class="filter-pill"><span class="pill-label">[\s\S]*Relecture : <b>Questions à résoudre<\/b>[\s\S]*?href="\/\?tag=four"/);
  });
});
