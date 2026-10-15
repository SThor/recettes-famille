const THEMES = {
  simple: 'Simple',
  pastel: 'Pastel douillet',
  vichy: 'Nappe vichy',
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = s => encodeURIComponent(s).replace(/%2F/g, '/');

function layout({ title, theme, body, bodyClass = '' }) {
  const fonts = {
    pastel: 'family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Nunito:wght@400;600;700',
    vichy: 'family=Caveat:wght@600&family=Lora:ital,wght@0,400;0,600;1,400',
  }[theme];
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · Recettes de famille</title>
${fonts ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fonts}&display=swap">` : ''}
<link rel="stylesheet" href="/static/style.css">
${theme !== 'simple' ? `<link rel="stylesheet" href="/static/themes/${theme}.css">` : ''}
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🍲</text></svg>">
</head>
<body class="theme-${theme} ${bodyClass}">
<header class="site-header">
  <a class="brand" href="/">Recettes de famille</a>
  <a class="header-action" href="/proposer">+ Proposer</a>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <p>Style d'essai :
    ${Object.entries(THEMES).map(([k, label]) => k === theme ? `<strong>${label}</strong>` : `<a href="/essais/${k}">${label}</a>`).join(' · ')}
  </p>
</footer>
<script src="/static/app.js" defer></script>
</body>
</html>`;
}

function card(r) {
  const search = [r.title, ...r.ingredients.map(i => i.name), ...r.tags].join(' ').toLowerCase();
  return `<li class="card" data-search="${esc(search)}">
  <a href="/recette/${r.slug}">
    ${r.photo ? `<img src="/photos/${enc(r.photo)}" alt="" loading="lazy">` : ''}
    <span class="card-title">${esc(r.title)}</span>
    ${r.meta.author ? `<span class="card-meta">de ${esc(r.meta.author)}</span>` : ''}
  </a>
</li>`;
}

function home({ groups, theme }) {
  const body = `
<section class="intro">
  <h1>Le livre de recettes de la famille</h1>
  <p>Les recettes de Maman, de Grand-Maman et de la givellerie étendue.</p>
  <input type="search" id="search" placeholder="Chercher une recette, un ingrédient…" aria-label="Chercher" autocomplete="off">
  <nav class="chips">
    ${groups.map(g => `<a class="chip" href="#${g.key}">${esc(g.label)}</a>`).join('')}
  </nav>
</section>
${groups.map(g => `
<section class="course" id="${g.key}">
  <h2>${esc(g.label)}</h2>
  <ul class="cards">${g.recipes.map(card).join('')}</ul>
</section>`).join('')}
<p class="empty" id="no-result" hidden>Aucune recette ne correspond… <a href="/proposer">En proposer une ?</a></p>`;
  return layout({ title: 'Accueil', theme, body });
}

function fmtAmount(a, scalable) {
  const qty = scalable && a.value != null
    ? `<span class="qty" data-v="${a.value}">${esc(a.quantity)}</span>`
    : esc(a.quantity);
  return `${qty}${a.unit ? `&nbsp;${esc(a.unit)}` : ''}`;
}

function stepHtml(parts) {
  return parts.map(p => {
    if (p.type === 'text') return esc(p.value);
    if (p.type === 'ingredient') {
      const amount = p.quantity ? ` <span class="amount">(${fmtAmount(p, true)})</span>` : '';
      return `<span class="ing">${esc(p.name)}${amount}</span>`;
    }
    if (p.type === 'cookware') return `<span class="tool">${esc(p.name)}</span>`;
    return `<span class="timer">⏲&nbsp;${esc(p.quantity)}${p.unit ? ' ' + esc(p.unit) : ''}</span>`;
  }).join('');
}

function recipeArticle(r, { back = true } = {}) {
  const m = r.meta;
  const servings = Number(m.servings) || null;
  const facts = [
    m['prep time'] && ['Préparation', m['prep time']],
    m['cook time'] && ['Cuisson', m['cook time']],
    m.source && ['Source', m.source],
    m.author && ['Transmise par', m.author],
  ].filter(Boolean);

  let stepNo = 0;
  return `
<article class="recipe" ${servings ? `data-servings="${servings}"` : ''}>
  ${back ? `<a class="back" href="/#${esc(r.course || '')}">← Toutes les recettes</a>` : ''}
  ${r.photo ? `<img class="hero" src="/photos/${enc(r.photo)}" alt="${esc(r.title)}">` : ''}
  <h1>${esc(r.title)}</h1>
  ${m.description ? `<p class="description">${esc(m.description)}</p>` : ''}
  ${r.tags.length ? `<p class="tags">${r.tags.map(t => `<span>${esc(t)}</span>`).join('')}</p>` : ''}
  ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}

  <section class="ingredients">
    <div class="section-head">
      <h2>Ingrédients</h2>
      ${servings ? `<div class="servings">
        <button type="button" data-step="-1" aria-label="Moins de portions">−</button>
        <span><b id="servings-count">${servings}</b> pers.</span>
        <button type="button" data-step="1" aria-label="Plus de portions">+</button>
      </div>` : ''}
    </div>
    <ul>
      ${r.ingredients.map(i => `<li><label><input type="checkbox">
        <span>${esc(i.name)}${i.optional ? ' <em>(facultatif)</em>' : ''}</span>
        <span class="amounts">${i.amounts.map(a => fmtAmount(a, true)).join(' + ')}</span>
      </label></li>`).join('')}
    </ul>
    ${r.cookware.length ? `<p class="cookware"><strong>Ustensiles :</strong> ${r.cookware.map(esc).join(', ')}</p>` : ''}
  </section>

  <section class="steps">
    <h2>Préparation</h2>
    ${r.items.map(it => it.type === 'note'
      ? `<blockquote class="note">${it.lines.map(esc).join('<br>')}</blockquote>`
      : `<div class="step"><span class="step-no">${++stepNo}</span><p>${stepHtml(it.parts)}</p></div>`
    ).join('\n')}
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
  <h1>Recettes de famille</h1>
  <p>Ce petit livre est réservé à la famille.</p>
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

module.exports = { THEMES, esc, enc, layout, recipeArticle, home, recipe, proposeForm, thanks, login, essais, notFound };
