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
