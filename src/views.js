const { slugify } = require('./recipes');
const { toSeconds, formatMinutes } = require('./durations');
const { icon } = require('./icons');
// Change à chaque démarrage : force le rechargement des CSS/JS après un déploiement.
const ASSET_V = Date.now().toString(36);

const THEMES = {
  simple: 'Simple',
  pastel: 'Pastel douillet',
  vichy: 'Nappe vichy',
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = s => encodeURIComponent(s).replace(/%2F/g, '/');

// Feuilles propres à un style (thème + polices hébergées) ; le style « simple » n'en a pas.
const themeAssets = theme => (theme === 'simple' ? { css: '', fonts: '' } : {
  css: `/static/themes/${theme}.css?v=${ASSET_V}`,
  fonts: `/static/fonts/${theme}.css?v=${ASSET_V}`,
});

function layout({ title, theme, body, bodyClass = '' }) {
  const assets = themeAssets(theme);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · Recettes de la Givellerie</title>
${assets.fonts ? `<link rel="stylesheet" id="fonts-css" href="${assets.fonts}">` : ''}
<link rel="stylesheet" href="/static/style.css?v=${ASSET_V}">
${assets.css ? `<link rel="stylesheet" id="theme-css" href="${assets.css}">` : ''}
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🍲</text></svg>">
</head>
<body class="theme-${theme} ${bodyClass}">
<header class="site-header">
  <a class="brand" href="/">Recettes de la Givellerie</a>
  <a class="header-action" href="/proposer">+ Proposer</a>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <p>Style d'essai :
    ${Object.entries(THEMES).map(([k, label]) => {
      const a = themeAssets(k);
      return `<a href="/essais/${k}" data-theme="${k}" data-css="${a.css}" data-fonts="${a.fonts}"${k === theme ? ' aria-current="true"' : ''}>${label}</a>`;
    }).join(' · ')}
  </p>
</footer>
<script src="/static/timer-state.js?v=${ASSET_V}" defer></script>
<script src="/static/app.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

function card(r, visible = true) {
  const search = [r.title, ...r.ingredients.map(i => i.name), ...r.tags].join(' ').toLowerCase();
  const d = r.durations || {};
  return `<li class="card"${visible ? '' : ' hidden'} data-search="${esc(search)}" data-prep="${d.prep ?? ''}" data-total="${d.total ?? ''}">
  <a href="/recette/${r.slug}">
    ${r.photo ? `<img src="/photos/${enc(r.photo)}" alt="" loading="lazy">` : ''}
    <span class="card-title">${esc(r.title)}</span>
    ${r.meta.author ? `<span class="card-meta">de ${esc(r.meta.author)}</span>` : ''}
  </a>
</li>`;
}

// JSON sûr dans un <script> (pas de « </script> » ni de « <!-- » possibles).
const jsonForScript = data => JSON.stringify(data).replace(/</g, '\\u003c');

// Crans du curseur de durée (minutes) ; le dernier cran = sans limite. Partagés avec public/app.js.
const DUREE_STOPS = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180, 240];
const DUREE_PRESETS = [15, 30, 60, 120];
// Icône « barre latérale » (cadre avec une colonne à gauche), couleur du texte du bouton.
const SIDEBAR_ICON = icon('sidebar');

// URL de l'accueil à partir des filtres actuels (dans l'ordre de l'URL), avec des modifications :
// valeur = remplacer/ajouter, null = retirer.
function homeUrl(params, changes = {}) {
  const entries = params.filter(([k]) => !(k in changes));
  for (const [k, v] of Object.entries(changes)) if (v != null) entries.push([k, String(v)]);
  // Garder l'ordre d'origine pour les clés modifiées qui existaient déjà.
  const order = params.map(([k]) => k);
  entries.sort((a, b) => (order.includes(a[0]) ? order.indexOf(a[0]) : 99) - (order.includes(b[0]) ? order.indexOf(b[0]) : 99));
  return entries.length ? `/?${entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '/';
}

function home({ groups, fits = () => true, theme, tag = '', regime = '', duree = null, temps = 'total', unknown = 0, params = [], tags = [], diets = [] }) {
  const count = groups.reduce((n, g) => n + g.recipes.filter(fits).length, 0);
  const recettes = n => `${n} recette${n > 1 ? 's' : ''}`;

  // Filtres actifs en pastilles : une croix par filtre (retire ce filtre seulement),
  // « Tout effacer » au bout de la rangée s'il y en a plusieurs.
  const active = [
    regime && ['leaf', `Régime : <b>${esc(regime)}</b>`, { regime: null }],
    tag && ['tag', `Étiquette : <b>${esc(tag)}</b>`, { tag: null }],
    duree && ['timer', `Durée : <b>${formatMinutes(duree)} max</b> (${temps === 'prep' ? 'préparation' : 'temps total'})`, { duree: null, temps: null }],
  ].filter(Boolean);
  const pills = active.length ? `<ul class="active-filters" aria-label="Filtres actifs">${active.map(([iconName, label, remove]) =>
    `<li class="filter-pill"><span class="pill-label">${icon(iconName, 16)} ${label}</span><a class="pill-remove" href="${esc(homeUrl(params, remove))}" aria-label="Retirer ce filtre">×</a></li>`).join('')}${active.length > 1 ? '<li><a class="clear-filters" href="/">Tout effacer</a></li>' : ''}</ul>` : '';
  const notes = `${duree && unknown ? `<p class="muted small">${unknown === 1 ? '1 recette' : `${unknown} recettes`} sans durée${temps === 'prep' ? ' de préparation' : ''} ${unknown === 1 ? 'n’est pas comptée' : 'ne sont pas comptées'}.</p>` : ''}
  ${active.length && !count ? `<p class="empty">${tag && !regime && !duree ? 'Aucune recette avec cette étiquette.' : 'Aucune recette pour ce filtre.'}</p>` : ''}`;
  // En-tête de la colonne des résultats : nombre de recettes et bouton pour replier le panneau (grand écran).
  // Un seul bouton pour replier / déplier le panneau, fixe en tête des résultats : il reste sous le curseur.
  const resultsHead = `<div class="results-head"><p class="results-count"><b>${count}</b> recette${count > 1 ? 's' : ''}</p><button type="button" class="sidebar-toggle" aria-controls="filtres" aria-expanded="true" title="Masquer les filtres">${SIDEBAR_ICON} Filtres${active.length ? ` <span class="count">${active.length}</span>` : ''}</button></div>`;

  const dietRow = diets.length ? `<p class="diets">${icon('leaf', 16)} Régimes : ${diets.map(d => `<a class="diet" href="${esc(homeUrl(params, { regime: d.name }))}">${esc(d.name)} <span class="count">${d.count}</span></a>`).join(' · ')}</p>` : '';
  const tagCloud = tags.length ? `<details class="tag-cloud">
    <summary>${icon('tag', 16)} Étiquettes <span class="count">${tags.length}</span></summary>
    <div class="tags">${tags.map(x => `<a class="tag" href="${esc(homeUrl(params, { tag: x.name }))}">${esc(x.name)} <span class="count">${x.count}</span></a>`).join('')}</div>
  </details>` : '';

  // Curseur : position = premier cran ≥ durée demandée ; sans durée = dernier cran (sans limite).
  const found = duree ? DUREE_STOPS.findIndex(s => s >= duree) : -1;
  const stopIndex = found === -1 ? DUREE_STOPS.length : found;
  const dureeBlock = `<div class="duree">
    <label for="duree-range">${icon('timer', 16)} Durée max : <output id="duree-label">${duree ? formatMinutes(duree) : 'sans limite'}</output></label>
    <input type="range" id="duree-range" min="0" max="${DUREE_STOPS.length}" step="1" value="${stopIndex}" data-stops="${DUREE_STOPS.join(',')}">
    <div class="duree-presets">${DUREE_PRESETS.map(m => `<a class="duree-preset" data-minutes="${m}" href="${esc(homeUrl(params, { duree: m }))}">${formatMinutes(m)}</a>`).join('')}</div>
    <label class="duree-prep"><input type="checkbox" id="duree-prep" ${temps === 'prep' ? 'checked' : ''}> Préparation seulement</label>
  </div>`;

  const body = `
<section class="intro">
  <h1>Le livre de recettes de la famille Givel</h1>
  <p>Les recettes de Maman, de Grand-Maman et de la Givellerie étendue.</p>
</section>
<button type="button" class="filters-toggle" aria-controls="filtres" aria-expanded="false">Filtres${active.length ? ` <span class="count">${active.length}</span>` : ''}</button>
<div class="home-layout">
<aside class="filters-panel" id="filtres" aria-label="Filtres">
  <div class="filters-head"><h2>Filtres</h2>${active.length > 1 ? '<a class="clear-filters" href="/">Tout effacer</a>' : ''}</div>
  ${dietRow}
  ${dureeBlock}
  ${tagCloud}
  <button type="button" class="button filters-apply">Voir <span id="filters-count">${recettes(count)}</span></button>
</aside>
<div class="home-results">
  <div class="search-box">
    <input type="search" id="search" placeholder="Chercher une recette, un ingrédient, une étiquette…" aria-label="Chercher" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="tag-suggestions" aria-expanded="false">
    <ul id="tag-suggestions" role="listbox" aria-label="Étiquettes suggérées" hidden></ul>
  </div>
  <script type="application/json" id="tags-data">${jsonForScript(tags)}</script>
  <nav class="chips">
    ${groups.map(g => `<a class="chip" href="#${g.key}">${esc(g.label)}</a>`).join('')}
  </nav>
  ${resultsHead}
  ${pills}
  ${notes}
  ${groups.map(g => `
  <section class="course" id="${g.key}"${g.recipes.some(fits) ? '' : ' hidden'}>
    <h2>${esc(g.label)}</h2>
    <ul class="cards">${g.recipes.map(r => card(r, fits(r))).join('')}</ul>
  </section>`).join('')}
  <p class="empty" id="no-result" hidden>Aucune recette ne correspond… <a href="/proposer">En proposer une ?</a></p>
</div>
</div>`;
  return layout({ title: 'Accueil', theme, body, bodyClass: 'page-home' });
}

// Quantité affichée ; data-v permet de la recalculer selon les portions (sauf quantité fixe « = »).
function fmtAmount(a) {
  const qty = a.fixed
    ? `<span class="qty fixed">${esc(a.quantity)}</span>`
    : a.value != null ? `<span class="qty" data-v="${a.value}">${esc(a.quantity)}</span>` : esc(a.quantity);
  return `${qty}${a.unit ? `&nbsp;${esc(a.unit)}` : ''}`;
}

// Nom d'ingrédient ; une référence (@./Pâte brisée{}) devient un lien vers cette recette.
function ingName(i) {
  if (!i.ref) return esc(i.name);
  return `<a class="recipe-ref" href="/recette/${slugify(i.ref.split('/').pop())}">${esc(i.name)}</a>`;
}

// ctx.timer : compteur des minuteurs de la recette (data-timer), pour les retrouver après un rechargement.
function stepHtml(parts, ctx = { timer: 0 }) {
  return parts.map(p => {
    if (p.type === 'text') return esc(p.value);
    if (p.type === 'ingredient') {
      const amount = p.quantity ? ` <span class="amount">(${fmtAmount(p)})</span>` : '';
      return `<span class="ing">${ingName(p)}${amount}</span>`;
    }
    if (p.type === 'cookware') return `<span class="tool">${esc(p.name)}</span>`;
    const duration = `${p.quantity}${p.unit ? ' ' + p.unit : ''}`;
    const label = `${icon('timer', 16)}<span class="timer-text">${p.name ? `${esc(p.name)} : ` : ''}${esc(duration)}</span>`;
    // Durée lisible : bouton qui lance un compte à rebours (public/app.js), sinon simple texte.
    const seconds = toSeconds(p.quantity, p.unit);
    return seconds
      ? `<button type="button" class="timer" data-timer="${ctx.timer++}" data-seconds="${seconds}" data-label="${esc(p.name || duration)}">${label}</button>`
      : `<span class="timer">${label}</span>`;
  }).join('');
}

// Liens vers les recettes liées (variante de, variantes, voir aussi, utilisée dans).
function relatedHtml(related) {
  if (!related) return '';
  const link = x => (x.slug ? `<a href="/recette/${x.slug}">${esc(x.title)}</a>` : `<span>${esc(x.title)}</span>`);
  const rows = [
    ['Variante de', related.variantOf],
    ['Variantes', related.variants],
    ['Voir aussi', related.seeAlso],
    ['Utilisée dans', related.usedIn],
  ].filter(([, list]) => list.length);
  if (!rows.length) return '';
  return `<nav class="related" aria-label="Recettes liées">${rows.map(([label, list]) => `<p>${label} : ${list.map(link).join(', ')}</p>`).join('')}</nav>`;
}

const asText = v => (Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v ? v.name || '' : String(v));

function recipeArticle(r, { back = true } = {}) {
  const m = r.meta;
  const servings = Number(m.servings) || null;
  // Clé maison « servings unit » (bouchons, cookies, parts…) ; sinon des personnes.
  const many = String(m['servings unit'] || '').trim() || 'pers.';
  const unit = { many, one: many === 'pers.' ? many : many.replace(/(?<=\p{L}{2})[sx]$/u, '') };
  const facts = [
    m['prep time'] && ['Préparation', m['prep time']],
    m['cook time'] && ['Cuisson', m['cook time']],
    m['rest time'] && ['Repos', m['rest time']], // clé maison : temps de repos (frigo, pousse…)
    m.time && ['Temps total', m.time],
    m.difficulty && ['Difficulté', m.difficulty],
    m.cuisine && ['Cuisine', m.cuisine],
    m.diet && ['Régime', m.diet],
    m.source && ['Source', m.source],
    m.author && ['Transmise par', m.author],
  ].filter(Boolean).map(([k, v]) => [k, k === 'Régime'
    // Chaque régime mène à l'accueil filtré sur ce régime.
    ? (Array.isArray(v) ? v : [v]).map(d => `<a href="/?regime=${encodeURIComponent(d)}">${esc(d)}</a>`).join(', ')
    : esc(asText(v))]);

  // Numérotation des étapes : repart à 1 à chaque section ; photos d'étape indexées sur toute la recette.
  let stepNo = 0;
  const ctx = { timer: 0 };
  let stepIndex = -1;
  const itemHtml = it => {
    if (it.type === 'section') { stepNo = 0; return `<h3 class="step-section">${esc(it.title)}</h3>`; }
    if (it.type === 'note') return `<blockquote class="note">${it.lines.map(esc).join('<br>')}</blockquote>`;
    const photo = r.stepPhotos?.[++stepIndex];
    return `<div class="step"><span class="step-no">${++stepNo}</span><div><p>${stepHtml(it.parts, ctx)}</p>${photo ? `<img class="step-photo" src="/photos/${enc(photo)}" alt="" loading="lazy">` : ''}</div></div>`;
  };

  return `
<article class="recipe" ${servings ? `data-servings="${servings}"` : ''}>
  ${back ? `<a class="back" href="/#${esc(r.course || '')}">← Toutes les recettes</a>` : ''}
  ${r.photo ? `<img class="hero" src="/photos/${enc(r.photo)}" alt="${esc(r.title)}">` : ''}
  <h1>${esc(r.title)}</h1>
  ${m.description ? `<p class="description">${esc(m.description)}</p>` : ''}
  ${r.tags.length ? `<p class="tags">${icon('tag', 16)}${r.tags.map(t => `<a class="tag" href="/?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</p>` : ''}
  ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
  ${relatedHtml(r.related)}

  <section class="ingredients">
    <div class="section-head">
      <h2>Ingrédients</h2>
      ${servings ? `<div class="servings">
        <button type="button" data-step="-1" aria-label="Moins de portions">−</button>
        <span><b id="servings-count">${servings}</b> <span id="servings-unit" data-one="${esc(unit.one)}" data-many="${esc(unit.many)}">${esc(servings === 1 ? unit.one : unit.many)}</span></span>
        <button type="button" data-step="1" aria-label="Plus de portions">+</button>
      </div>` : ''}
    </div>
    <ul>
      ${r.ingredients.map(i => `<li><label><input type="checkbox">
        <span>${ingName(i)}${i.notes?.length ? ` <span class="ing-note">(${i.notes.map(esc).join(', ')})</span>` : ''}${i.optional ? ' <em>(facultatif)</em>' : ''}</span>
        <span class="amounts">${i.amounts.map(a => fmtAmount(a)).join(' + ')}</span>
      </label></li>`).join('')}
    </ul>
    ${r.cookware.length ? `<p class="cookware"><strong>Ustensiles :</strong> ${r.cookware.map(esc).join(', ')}</p>` : ''}
  </section>

  <section class="steps">
    <h2>Préparation</h2>
    ${r.items.map(itemHtml).join('\n')}
  </section>

  ${r.originals.length ? `<details class="originals">
    <summary>Voir la fiche d'origine</summary>
    ${r.originals.map(o => `<a href="/photos/${enc(o)}"><img src="/photos/${enc(o)}" alt="Fiche d'origine" loading="lazy"></a>`).join('')}
  </details>` : ''}
</article>`;
}

function recipe({ r, theme }) {
  return layout({ title: r.title, theme, body: recipeArticle(r), bodyClass: 'page-recipe' });
}

function proposeForm({ theme, error, values = {} }) {
  const body = `
<section class="form-page">
  <h1>Proposer une recette</h1>
  <p>Écris-la comme tu veux, même en vrac, ou prends simplement la fiche en photo. Paul s'occupe de la mettre au propre.</p>
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  <form method="post" action="/proposer" enctype="multipart/form-data">
    <label>Ton prénom<input name="prenom" required maxlength="80" value="${esc(values.prenom)}" autocomplete="given-name"></label>
    <label>Nom de la recette<input name="titre" required maxlength="150" value="${esc(values.titre)}"></label>
    <label>La recette <small>(ingrédients, étapes… comme ça vient)</small>
      <textarea name="texte" rows="10" maxlength="20000">${esc(values.texte)}</textarea></label>
    <label>Photos <small>(la fiche, le plat… facultatif)</small>
      <input type="file" name="photos" accept="image/*" multiple></label>
    <label>Une anecdote, un souvenir ? <small>(facultatif)</small>
      <textarea name="anecdote" rows="3" maxlength="5000">${esc(values.anecdote)}</textarea></label>
    <button type="submit" class="button">Envoyer la recette</button>
  </form>
</section>`;
  return layout({ title: 'Proposer une recette', theme, body });
}

function thanks({ theme, prenom }) {
  const body = `<section class="form-page center">
  <h1>Merci ${esc(prenom)} !</h1>
  <p>Ta recette est bien arrivée. Elle apparaîtra dans le livre une fois mise au propre.</p>
  <p><a class="button" href="/">Retour aux recettes</a> <a href="/proposer">En proposer une autre</a></p>
</section>`;
  return layout({ title: 'Merci', theme, body });
}

function login({ theme, error }) {
  const body = `<section class="form-page center">
  <h1>Recettes de la Givellerie</h1>
  <p>Ce petit livre est réservé à la famille Givel.</p>
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  <form method="post" action="/connexion" class="login">
    <label>Mot de passe de la famille<input type="password" name="motdepasse" required autocomplete="current-password"></label>
    <button type="submit" class="button">Entrer</button>
  </form>
</section>`;
  return layout({ title: 'Connexion', theme, body });
}

function essais({ theme }) {
  const body = `<section class="form-page">
  <h1>Styles d'essai</h1>
  <p>Choisis un style : il s'applique à tout le site, sur cet appareil.</p>
  <ul class="theme-list">
    <li><a href="/essais/simple"><b>Simple</b><span>Minimal, sans fioritures.</span></a></li>
    <li><a href="/essais/pastel"><b>Pastel douillet</b><span>Vert sauge, rose poudré, beige crème.</span></a></li>
    <li><a href="/essais/vichy"><b>Nappe vichy</b><span>Rustique, carreaux rouges et papier kraft.</span></a></li>
  </ul>
</section>`;
  return layout({ title: 'Styles', theme, body });
}


function notFound({ theme }) {
  return layout({ title: 'Introuvable', theme, body: `<section class="form-page center"><h1>Recette introuvable</h1><p><a href="/">Retour aux recettes</a></p></section>` });
}

module.exports = { THEMES, ASSET_V, esc, enc, layout, recipeArticle, home, recipe, proposeForm, thanks, login, essais, notFound };
