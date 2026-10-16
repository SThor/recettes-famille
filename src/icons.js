// Petites icônes SVG au trait (couleur du texte), lisibles quel que soit le thème ou la police.
const PATHS = {
  // Cadre avec une colonne à gauche : afficher / masquer le panneau de filtres
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  // Le même en miroir : panneau de droite (relecture)
  sidebarRight: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>',
  // Statut de relecture : tout est bon / quelque chose à revoir
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16.5 9.5"/>',
  alert: '<path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4"/><path d="M12 17h.01"/>',
  // Étiquette
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  // Feuille : régime
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.9-5.4 5.1-6 2.4-.5 4.9-2 5.9-3"/>',
  // Personne
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  // Chronomètre ; l'aiguille (.icon-hand) tourne pendant un décompte (voir style.css)
  timer: '<circle cx="12" cy="13" r="8"/><path d="M10 2h4"/><path d="M12 5V3"/><path d="m19 6 1.5-1.5"/><path class="icon-hand" d="M12 13V8.5"/>',
};

function icon(name, size = 18) {
  return `<svg class="icon icon-${name}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}

module.exports = { icon };
