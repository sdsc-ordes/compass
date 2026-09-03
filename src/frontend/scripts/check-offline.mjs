// Fails if the widget source references a host it must not contact at runtime.
//
//   node scripts/check-offline.mjs
//
// The widget is embedded on oceancare.org and may not leak visitor data to
// third parties, so no tile server, font service or CDN. Hosts below are
// allowed for a stated reason; anything else fails and needs a human decision
// rather than a quiet addition.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const EXTENSIONS = ['.ts', '.svelte', '.css', '.html'];

const ALLOWED = new Map([
  // RDF namespace IRIs: identifiers in the ontology, never dereferenced.
  ['example.org', 'ontology and instance namespace'],
  ['www.w3.org', 'RDF, RDFS, SKOS, GEO namespaces'],
  ['schema.org', 'schema.org namespace'],
  ['purl.org', 'Dublin Core namespace'],
  // Links the visitor chooses to follow, plus the configurable API origin.
  ['www.oceancare.org', 'story links and the story-count API'],
  // Attribution the GEBCO licence requires. A link in the map's attribution
  // control; the imagery itself is pre-rendered and served from our origin.
  ['www.gebco.net', 'attribution link for the bathymetry we host ourselves'],
]);

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return EXTENSIONS.some((e) => path.endsWith(e)) ? [path] : [];
  });
}

const offenders = [];
for (const path of walk(ROOT)) {
  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) {
      const host = match[1];
      if (host === 'localhost' || host.startsWith('127.')) continue;
      if (ALLOWED.has(host)) continue;
      offenders.push(`${relative(ROOT, path)}:${index + 1}  ${host}`);
    }
  });
}

if (offenders.length) {
  console.error(
    'error: the widget must make no third-party requests at runtime, but ' +
    `these hosts appear in its source:\n  ${offenders.join('\n  ')}\n\n` +
    'Bundle the asset instead, or add the host to ALLOWED in ' +
    'scripts/check-offline.mjs with the reason it is safe.',
  );
  process.exit(1);
}

console.log(`no third-party hosts in the widget source (${ALLOWED.size} allowed, all inert)`);
