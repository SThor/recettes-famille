// Éditeur admin : aperçu (au clic, et en direct pendant la frappe) et garde-fou de sortie.
const btn = document.getElementById('preview-btn');
const out = document.getElementById('apercu');
const etat = document.getElementById('apercu-etat');
const source = document.querySelector('textarea[name=source]');

async function refreshPreview() {
  if (etat) etat.textContent = '· mise à jour…';
  try {
    const res = await fetch('/admin/apercu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: source.value }),
    });
    out.innerHTML = await res.text();
    if (etat) etat.textContent = '';
  } catch {
    if (etat) etat.textContent = '· hors connexion';
  }
}

if (out && source) {
  let timer;
  source.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(refreshPreview, 400);
  });
  btn?.addEventListener('click', async () => {
    await refreshPreview();
    out.scrollIntoView({ behavior: 'smooth' });
  });
}

// Sur petit écran, l'original est replié par défaut pour laisser la place au formulaire.
const originalBox = document.getElementById('original-box');
if (originalBox && window.matchMedia('(max-width: 759px)').matches) originalBox.open = false;

// Évite de perdre une saisie en quittant la page par erreur
const editorForm = document.getElementById('editor-form');
if (editorForm && source) {
  const initial = source.value;
  let submitting = false;
  editorForm.addEventListener('submit', () => { submitting = true; });
  window.addEventListener('beforeunload', e => {
    if (!submitting && source.value !== initial) e.preventDefault();
  });
}

// Suivi : onglets (le volet affiché suit l'#ancre de l'URL ; sans JS, tout reste affiché).
const dash = document.querySelector('.dashboard');
if (dash) {
  const tabs = [...dash.querySelectorAll('[role=tab]')];
  const panels = [...dash.querySelectorAll('[role=tabpanel]')];
  const show = id => {
    if (!panels.some(p => p.id === id)) id = dash.dataset.defaultTab;
    panels.forEach(p => { p.hidden = p.id !== id; });
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.getAttribute('aria-controls') === id)));
  };
  tabs.forEach(t => t.addEventListener('click', e => {
    e.preventDefault();
    const id = t.getAttribute('aria-controls');
    history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
    show(id);
    window.scrollTo({ top: 0 });
  }));
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1));
  // Le navigateur a pu défiler jusqu'à l'ancre : on revient en haut.
  requestAnimationFrame(() => window.scrollTo({ top: 0 }));
}

// Suivi : filtres de l'onglet Recettes (le dernier choix est mémorisé sur l'appareil).
const filterBar = document.querySelector('.filters');
if (filterBar) {
  const items = [...document.querySelectorAll('.recipes-status > li[data-flags]')];
  const empty = document.querySelector('.filter-empty');
  const KEY = 'filtre-recettes';
  const apply = id => {
    if (!filterBar.querySelector(`[data-filter="${id}"]`)) id = 'toutes';
    let shown = 0;
    for (const li of items) {
      const keep = id === 'toutes' || li.dataset.flags.split(' ').includes(id);
      li.hidden = !keep;
      if (keep) shown++;
    }
    empty.hidden = shown > 0;
    filterBar.querySelectorAll('.filter').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === id)));
    try { localStorage.setItem(KEY, id); } catch {}
  };
  filterBar.addEventListener('click', e => {
    const btn = e.target.closest('.filter');
    if (btn) apply(btn.dataset.filter);
  });
  let saved = 'toutes';
  try { saved = localStorage.getItem(KEY) || 'toutes'; } catch {}
  apply(saved);
}
