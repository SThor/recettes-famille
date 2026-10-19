// Glossaire des étiquettes : Recettes/Étiquettes.md, une famille par titre « ## Famille »,
// une étiquette par ligne « - `étiquette` — définition ». Le reste du fichier est ignoré.
const GLOSSARY_FILE = 'Étiquettes.md';

function parseGlossary(text) {
  const families = [];
  let current = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const family = line.match(/^##\s+(.+?)\s*$/);
    if (family) { families.push(current = { family: family[1], tags: [] }); continue; }
    const tag = line.match(/^\s*[-*]\s+`([^`]+)`\s*(?:—|–|-|:)\s*(.*?)\s*$/);
    if (tag && current) current.tags.push({ name: tag[1].trim(), definition: tag[2] });
  }
  return families.filter(f => f.tags.length);
}

module.exports = { GLOSSARY_FILE, parseGlossary };
