// Collects the licence text of every dependency that ends up in the widget
// bundle into THIRD-PARTY-NOTICES.md.
//
//   node scripts/build-notices.mjs
//
// MIT, ISC and BSD-3-Clause all require their copyright notice to accompany
// the distribution. The widget is a single minified file, so the notices need
// somewhere to live; esbuild's legalComments keeps whatever banners the
// packages carry inside the bundle, and this file is the readable companion.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LICENCE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'license', 'LICENSE-MIT'];

// Compilers whose *runtime* is emitted into the bundle even though the package
// itself is a devDependency. Svelte is the case that matters: components
// compile to code that carries its internals.
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
  // Some packages inline the licence in the readme or only declare an SPDX id.
  const found = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  return found ? readFileSync(join(dir, found), 'utf8').trim() : null;
}

const sections = [];
const missing = [];
for (const name of shipped) {
  const meta = JSON.parse(readFileSync(join(ROOT, 'node_modules', name, 'package.json'), 'utf8'));
  const text = licenceText(name);
  if (!text) missing.push(name);
  sections.push(
    `## ${name} ${meta.version}\n\n` +
    `SPDX: ${meta.license ?? 'unknown'}${meta.homepage ? `  \nHome: ${meta.homepage}` : ''}\n\n` +
    (text ? `\`\`\`\n${text}\n\`\`\`` : '_No licence file shipped in the package; see the SPDX identifier above._'),
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
  '- Bathymetry imagery: reproduced from the **GEBCO_2026 Grid**, GEBCO\n' +
  '  Compilation Group (<https://www.gebco.net>). Free to use with attribution.\n' +
  '  GEBCO state the imagery is not to be used for navigation or any purpose\n' +
  '  relating to safety at sea. Both notices appear in the map\'s attribution\n' +
  '  control at runtime.\n\n' +
  sections.join('\n\n') + '\n';

writeFileSync(join(ROOT, 'THIRD-PARTY-NOTICES.md'), out);
console.log(`wrote THIRD-PARTY-NOTICES.md for ${shipped.length} bundled package(s)`);
if (missing.length) {
  console.warn(`no licence file found in: ${missing.join(', ')} — check these by hand`);
}
