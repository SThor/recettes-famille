// Une couleur par type de filtre (personnes, régimes, durée, étiquettes, relecture) : les pastilles
// actives portent leur type comme les options du panneau ; chaque thème définit la teinte de chaque type.
// Le rendu des couleurs se vérifie au navigateur ; ici, la structure (classes et jetons CSS).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startApp, FAMILY } = require('./helpers');

const KINDS = ['person', 'diet', 'duree', 'tag', 'review'];
const css = f => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');

test.describe('Couleur par type de filtre', () => {
  let t, cookie;
  test.before(async () => {
    t = await startApp();
    cookie = (await t.req(`/entrer?cle=${FAMILY}`)).headers.get('set-cookie').split(';')[0];
  });
  test.after(async () => { await t.close(); });
  const get = async url => (await t.req(url, { headers: { cookie } })).text();

  test('chaque pastille active porte la classe de son type', async () => {
    const html = await get('/?personne=carole&regime=V%C3%A9g%C3%A9tarien&duree=30&tag=auvergne&relecture=questions');
    const pills = [...html.matchAll(/<li class="filter-pill ([a-z]+)"><span class="pill-label">[\s\S]*?<\/span>/g)]
      .map(m => [m[1], m[0].match(/(Personne|Régime|Durée|Étiquette|Relecture) :/)[1]]);
    assert.deepEqual(pills.sort(), [
      ['diet', 'Régime'], ['duree', 'Durée'], ['person', 'Personne'], ['review', 'Relecture'], ['tag', 'Étiquette'],
    ]);
  });

  test('les blocs du panneau portent leur type (icône du titre à sa couleur)', async () => {
    const html = await get('/');
    for (const [block, kind] of [['details class="people', 'person'], ['div class="duree', 'duree'],
      ['details class="tag-cloud', 'tag'], ['details class="review-filter', 'review']]) {
      assert.match(html, new RegExp(`<${block} kind-${kind}"`), block);
    }
    assert.match(html, /<a class="duree-preset" data-minutes="15"/);
  });

  test('chaque thème définit une teinte et un fond clair par type', () => {
    for (const f of ['style.css', 'themes/pastel.css', 'themes/vichy.css']) {
      const src = css(f);
      for (const k of KINDS) {
        assert.match(src, new RegExp(`--c-${k}:\\s*#`), `${f} : --c-${k}`);
        assert.match(src, new RegExp(`--c-${k}-soft:\\s*#`), `${f} : --c-${k}-soft`);
      }
    }
  });

  test('options, pastilles et titres de bloc n\'utilisent que la couleur de leur type', () => {
    const src = css('style.css');
    for (const k of KINDS) {
      assert.match(src, new RegExp(`\\.kind-${k}[^{]*\\{[^}]*--k:\\s*var\\(--c-${k}\\);\\s*--k-soft:\\s*var\\(--c-${k}-soft\\)`), k);
    }
    for (const sel of ['.filters-panel .option {', '.filter-pill {']) {
      const rule = src.slice(src.indexOf(sel), src.indexOf('}', src.indexOf(sel)));
      assert.match(rule, /var\(--k-soft/, sel);
      assert.doesNotMatch(rule, /--accent/, sel);
    }
  });

  test('option de relecture active : icône en variante claire de sa couleur (lisible sur le fond plein)', () => {
    const src = css('style.css');
    for (const [state, base] of [['ok', '--ok'], ['questions', '--warn'], ['a-verifier', '--muted']]) {
      assert.match(src, new RegExp(`\\.filters-panel \\.option\\.review\\[aria-current="true"\\]\\[data-state="${state}"\\] \\.icon \\{ color: color-mix\\(in srgb, var\\(${base}\\) \\d+%, var\\(--surface\\)\\); \\}`), state);
    }
  });
});
