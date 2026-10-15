// Durée d'un minuteur Cooklang (quantité + unité, en français ou en anglais) → secondes.
const UNITS = [
  [/^(s|sec|secs|seconde|secondes|second|seconds)$/, 1],
  [/^(mn|min|mins|minute|minutes)$/, 60],
  [/^(h|hr|hrs|heure|heures|hour|hours)$/, 3600],
];

function toNumber(q) {
  const frac = q.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(q.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function toSeconds(quantity, unit) {
  // Plage « 25-30 » : on part de la durée la plus courte (on peut relancer si besoin).
  const q = String(quantity || '').trim().split(/\s*-\s*/)[0];
  const value = q ? toNumber(q) : null;
  const u = String(unit || '').trim().toLowerCase();
  const factor = UNITS.find(([re]) => re.test(u))?.[1];
  if (value == null || value <= 0 || !factor) return null;
  return Math.round(value * factor);
}

module.exports = { toSeconds };
