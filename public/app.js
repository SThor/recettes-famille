// Recherche sur l'accueil
const search = document.getElementById('search');
if (search) {
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  search.addEventListener('input', () => {
    const q = norm(search.value.trim());
    let any = false;
    document.querySelectorAll('.course').forEach(section => {
      let visible = 0;
      section.querySelectorAll('.card').forEach(card => {
        const show = !q || norm(card.dataset.search).includes(q);
        card.hidden = !show;
        if (show) visible++;
      });
      section.hidden = visible === 0;
      any ||= visible > 0;
    });
    document.getElementById('no-result').hidden = any;
  });
}

// Portions : recalcule les quantités
const recipe = document.querySelector('.recipe[data-servings]');
if (recipe) {
  const base = Number(recipe.dataset.servings);
  let current = base;
  const count = document.getElementById('servings-count');
  const fmt = v => {
    const fractions = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
    const whole = Math.floor(v);
    const rest = Math.round((v - whole) * 100) / 100;
    if (fractions[rest]) return (whole || '') + fractions[rest];
    return String(Math.round(v * 10) / 10).replace('.', ',');
  };
  recipe.querySelectorAll('.servings button').forEach(btn => btn.addEventListener('click', () => {
    current = Math.max(1, current + Number(btn.dataset.step));
    count.textContent = current;
    recipe.querySelectorAll('.qty').forEach(el => { el.textContent = fmt(Number(el.dataset.v) * current / base); });
  }));
}
