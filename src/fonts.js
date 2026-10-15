// Polices des styles d'essai, servies par le site lui-même (paquets npm Fontsource, licence SIL OFL) :
// aucune requête vers Google Fonts. Seuls les sous-ensembles latin et latin-ext sont servis.
const fs = require('fs');
const path = require('path');
const express = require('express');

const FONTSOURCE = path.join(path.dirname(require.resolve('@fontsource/nunito/package.json')), '..');
const THEME_FONTS = {
  pastel: { fraunces: ['500', '700'], nunito: ['400', '600', '700'] },
  vichy: { caveat: ['600'], lora: ['400', '600', '400-italic'] },
};
const PACKAGES = new Set(Object.values(THEME_FONTS).flatMap(Object.keys));

// Feuille @font-face d'un style, à partir des CSS Fontsource (blocs latin / latin-ext, woff2 seulement).
function themeCss(theme) {
  return Object.entries(THEME_FONTS[theme]).flatMap(([pkg, variants]) => variants.flatMap(variant => {
    const css = fs.readFileSync(path.join(FONTSOURCE, pkg, `${variant}.css`), 'utf8');
    return css.split(/(?=\/\* )/)
      .filter(block => /-latin(-ext)?-\d+-(normal|italic) \*\//.test(block))
      .map(block => block
        .replace(/url\(\.\/files\/([^)]+\.woff2)\) format\('woff2'\)(, url\([^)]+\) format\('woff'\))?/g,
          (_, file) => `url(/static/fonts/files/${pkg}/${file}) format('woff2')`)
        .trim());
  })).join('\n');
}

function fontsRouter() {
  const router = express.Router();
  const cache = Object.fromEntries(Object.keys(THEME_FONTS).map(theme => [theme, themeCss(theme)]));

  router.get('/:theme.css', (req, res) => {
    const css = cache[req.params.theme];
    if (!css) return res.sendStatus(404);
    res.type('text/css').set('Cache-Control', 'public, max-age=3600').send(css);
  });

  router.get('/files/:pkg/:file', (req, res) => {
    const { pkg, file } = req.params;
    if (!PACKAGES.has(pkg) || !/^[a-z0-9-]+\.woff2$/.test(file)) return res.sendStatus(404);
    res.type('font/woff2').sendFile(path.join(FONTSOURCE, pkg, 'files', file), { maxAge: '365d', immutable: true },
      err => err && !res.headersSent && res.sendStatus(404));
  });

  return router;
}

module.exports = { fontsRouter, THEME_FONTS };
