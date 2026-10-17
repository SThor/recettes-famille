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
  // Plage « 25-30 » ou « 25 à 30 » : on part de la durée la plus courte (on peut relancer si besoin).
  const q = String(quantity || '').trim().split(/\s*-\s*|\s+à\s+/)[0];
  const value = q ? toNumber(q) : null;
  const u = String(unit || '').trim().toLowerCase();
  const factor = UNITS.find(([re]) => re.test(u))?.[1];
  if (value == null || value <= 0 || !factor) return null;
  return Math.round(value * factor);
}

// Durée écrite en toutes lettres dans l'en-tête (« 20 minutes », « 1 h 30 », « 25 à 30 minutes »…) → minutes.
// Pour une fourchette, on garde la valeur haute : le filtre ne doit jamais sous-estimer une recette.
const NUM = String.raw`\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+`;
const UNIT = String.raw`heures?|hours?|hrs?|h|minutes?|mins?|mn|secondes?|seconds?|secs?|s`;

function unitMinutes(unit) {
  const u = unit.toLowerCase();
  if (/^(heures?|hours?|hrs?|h)$/.test(u)) return 60;
  if (/^(minutes?|mins?|mn)$/.test(u)) return 1;
  return 1 / 60;
}

function toMinutes(text) {
  if (typeof text === 'number') return text > 0 ? text : null;
  if (!text) return null;
  const t = String(text).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

  // « 1 h 30 », « 1h30 », « 2 heures 15 »
  const hm = t.match(/(\d+)\s*(?:h|heures?)\s*(?:et\s*)?(\d{1,2})(?!\s*(?:\d|h|heure))/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  // « 1 heure et demie »
  const half = t.match(/(\d+)\s*(?:h|heures?)\s+et\s+demie/);
  if (half) return Number(half[1]) * 60 + 30;
  // « 25 à 30 minutes », « 10-15 min » → valeur haute
  const range = t.match(new RegExp(`(${NUM})\\s*(?:à|-|–)\\s*(${NUM})\\s*(${UNIT})\\b`));
  if (range) return Math.ceil(toNumber(range[2].replace(/\s/g, '')) * unitMinutes(range[3]));
  // « 20 minutes », « 1/2 heure », « 30 secondes »
  const single = t.match(new RegExp(`(${NUM})\\s*(${UNIT})\\b`));
  if (single) {
    const n = toNumber(single[1].replace(/\s/g, ''));
    return n ? Math.ceil(n * unitMinutes(single[2])) : null;
  }
  return null;
}

// 90 → « 1 h 30 », 45 → « 45 min »
function formatMinutes(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

module.exports = { toSeconds, toMinutes, formatMinutes };
