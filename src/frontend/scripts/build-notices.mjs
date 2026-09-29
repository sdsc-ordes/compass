import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LICENCE_FILES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'license',
  'LICENSE-MIT',
];

const RUNTIME_FROM_DEV = ['svelte'];

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const declared = Object.keys(pkg.dependencies ?? {});
const shipped = [...new Set([...declared, ...RUNTIME_FROM_DEV])]
  .filter((name) => existsSync(join(ROOT, 'node_modules', name)))
  .sort();

function licenceText(name) {
  const dir = join(ROOT, 'node_modules', name);
  for (const candidate of LICENCE_FILES) {
    const path = join(dir, candidate);
    if (existsSync(path)) return readFileSync(path, 'utf8').trim();
  }
  const found = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  return found ? readFileSync(join(dir, found), 'utf8').trim() : null;
}

const sections = [];
const missing = [];
for (const name of shipped) {
  const meta = JSON.parse(
    readFileSync(join(ROOT, 'node_modules', name, 'package.json'), 'utf8'),
  );
  const text = licenceText(name);
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
console.log(`wrote THIRD-PARTY-NOTICES.md for ${shipped.length} bundled package(s)`);
if (missing.length) {
  console.warn(`no licence file found in: ${missing.join(', ')} — check these by hand`);
}
