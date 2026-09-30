// Write THIRD-PARTY-NOTICES.md for every package in "dependencies", which are
// the ones bundled into dist/compass-map.js.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const bundled = Object.keys(pkg.dependencies ?? {}).sort();

function licenceText(dir) {
  const file = readdirSync(dir)
    .filter((f) => /^licen[cs]e/i.test(f))
    .sort()[0];
  return file ? readFileSync(join(dir, file), 'utf8').trim() : null;
}

const sections = [];
const missing = [];
for (const name of bundled) {
  const dir = join(ROOT, 'node_modules', name);
  const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const text = licenceText(dir);
  if (!text) missing.push(name);
  sections.push(
    `## ${name} ${meta.version}\n\n` +
      `SPDX: ${meta.license ?? 'unknown'}${meta.homepage ? `  \nHome: ${meta.homepage}` : ''}\n\n` +
      (text
        ? `\`\`\`\n${text}\n\`\`\``
        : '_No licence file shipped in the package; see the SPDX identifier above._'),
  );
}

const out =
  '# Third-party notices\n\n' +
  'The widget bundle (`dist/compass-map.js`) includes the packages below.\n' +
  'Their licences require this notice to accompany any distribution of it.\n\n' +
  'Regenerate with `node scripts/build-notices.mjs`.\n\n' +
  '## Map data\n\n' +
  '- Land, borders, lakes and rivers: **Natural Earth**, public domain\n' +
  '  (<https://www.naturalearthdata.com>). Credit is requested, not required.\n' +
  '- Bathymetry imagery: reproduced from the **GEBCO_2026 Grid**, served by\n' +
  '  GEBCO as a Web Map Service. GEBCO ask to be cited as: GEBCO Bathymetric\n' +
  '  Compilation Group 2026 (2026). The GEBCO_2026 Grid - a continuous terrain\n' +
  '  model for oceans and land at 15 arc-second intervals. NERC EDS British\n' +
  '  Oceanographic Data Centre NOC.\n' +
  '  doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa\n' +
  '- The grid is public domain and free to use, commercial use included, on\n' +
  '  three conditions: acknowledge the source; do not imply that GEBCO, the IHO\n' +
  '  or the IOC endorses this application; and do not use it for navigation or\n' +
  '  any other purpose involving safety at sea. Full terms:\n' +
  '  <https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use>\n' +
  "- Both sources are credited in the map's attribution control at runtime, where\n" +
  '  GEBCO_2026 links to the grid page carrying the citation above.\n\n' +
  sections.join('\n\n') +
  '\n';

writeFileSync(join(ROOT, 'THIRD-PARTY-NOTICES.md'), out);
console.log(`wrote THIRD-PARTY-NOTICES.md for ${bundled.length} bundled package(s)`);
if (missing.length) {
  console.warn(`no licence file found in: ${missing.join(', ')} -- check these by hand`);
}
