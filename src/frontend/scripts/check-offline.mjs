import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const EXTENSIONS = ['.ts', '.svelte', '.css', '.html'];

const ALLOWED = new Map([
  ['example.org', 'ontology and instance namespace'],
  ['www.w3.org', 'RDF, RDFS, SKOS, GEO namespaces'],
  ['schema.org', 'schema.org namespace'],
  ['purl.org', 'Dublin Core namespace'],
  ['www.oceancare.org', 'story links and the story-count API'],
  ['www.gebco.net', 'attribution link for the bathymetry we host ourselves'],
  ['www.naturalearthdata.com', 'attribution link for the bundled basemap geometry'],
  ['openfontlicense.org', 'licence link for the self-hosted fonts'],
  ['www.datascience.ch', 'credit link in the sidebar footer'],
]);

const isTest = (path) => /\.(test|spec)\.[^.]+$/.test(path);

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    if (isTest(path)) return [];
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
