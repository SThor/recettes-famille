// Polices hébergées sur le site (plus de Google Fonts) et changement de style sans rechargement.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers');

let t;
test.beforeEach(async () => { t = await startApp(); });
test.afterEach(async () => { await t.close(); });

const page = async theme => (await t.req('/essais', { headers: { cookie: `theme=${theme}` } })).text();

test.describe('Polices hébergées', () => {
  const EXPECTED = {
    pastel: [['Fraunces', 'normal', 500], ['Fraunces', 'normal', 700], ['Nunito', 'normal', 400], ['Nunito', 'normal', 600], ['Nunito', 'normal', 700]],
    vichy: [['Caveat', 'normal', 600], ['Lora', 'normal', 400], ['Lora', 'normal', 600], ['Lora', 'italic', 400]],
  };

  for (const theme of Object.keys(EXPECTED)) {
    test(`${theme} : aucune requête vers Google, feuille de polices locale`, async () => {
      const html = await page(theme);
      assert.doesNotMatch(html, /googleapis|gstatic/);
      assert.match(html, new RegExp(`<link rel="stylesheet" id="fonts-css" href="/static/fonts/${theme}\\.css\\?v=`));
    });

    test(`${theme} : chaque police déclarée est servie en woff2`, async () => {
      const res = await t.req(`/static/fonts/${theme}.css`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /text\/css/);
      const css = await res.text();
      for (const [family, style, weight] of EXPECTED[theme]) {
        const face = new RegExp(`font-family: '${family}';\\s*font-style: ${style};\\s*font-display: swap;\\s*font-weight: ${weight};`);
        assert.match(css, face, `${family} ${style} ${weight}`);
      }
      const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]);
      assert.ok(urls.length >= EXPECTED[theme].length);
      assert.ok(urls.every(u => u.startsWith('/static/fonts/files/') && u.endsWith('.woff2')), urls.join());
      for (const u of new Set(urls)) {
        const font = await t.req(u);
        assert.equal(font.status, 200, u);
        assert.equal(font.headers.get('content-type'), 'font/woff2');
      }
    });
  }

  test('style simple : aucune police chargée', async () => {
    assert.doesNotMatch(await page('simple'), /<link[^>]+\/static\/fonts\//);
  });

  test('pas d\'accès hors des polices', async () => {
    assert.equal((await t.req('/static/fonts/files/nunito/..%2F..%2F..%2Fpackage.json')).status, 404);
    assert.equal((await t.req('/static/fonts/files/express/index.js')).status, 404);
    assert.equal((await t.req('/static/fonts/inconnu.css')).status, 404);
  });
});

test.describe('Changement de style sans rechargement', () => {
  test('les liens de style portent de quoi basculer en JavaScript', async () => {
    const html = await page('pastel');
    const link = theme => new RegExp(`<a href="/essais/${theme}" data-theme="${theme}"[^>]*>`);
    assert.match(html, link('simple'));
    assert.match(html, /<a href="\/essais\/vichy" data-theme="vichy" data-css="\/static\/themes\/vichy\.css\?v=[^"]+" data-fonts="\/static\/fonts\/vichy\.css\?v=[^"]+"/);
    assert.match(html, /<a href="\/essais\/pastel" data-theme="pastel"[^>]*aria-current="true"/);
    assert.match(html, /<link rel="stylesheet" id="theme-css" href="\/static\/themes\/pastel\.css\?v=/);
  });
});
