// Aperçu de la recette dans l'éditeur admin
const btn = document.getElementById('preview-btn');
const out = document.getElementById('apercu');
const source = document.querySelector('textarea[name=source]');
if (btn && out && source) {
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const res = await fetch('/admin/apercu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: source.value }),
      });
      out.innerHTML = await res.text();
    } catch {
      out.innerHTML = '<p class="error">Aperçu impossible (connexion ?).</p>';
    }
    out.hidden = false;
    out.scrollIntoView({ behavior: 'smooth' });
    btn.disabled = false;
  });
}
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
