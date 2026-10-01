import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type ModuleNode, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '..', '..');
const bathyDir = path.join(root, 'bathy');

// Content hash of the rasters and the atlas, which keep their names across a
// rebake. The bundle fetches them with ?v=<hash> so nginx can cache them immutable.
function assetVersion(): string {
  const listFiles = (dir: string): string[] =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const p = path.join(dir, e.name);
          return e.isDirectory() ? listFiles(p) : [p];
        })
      : [];
  const inputs = [...listFiles(bathyDir), path.join(root, 'public/basemap/atlas.json')];
  const hash = crypto.createHash('sha256');
  for (const f of inputs.sort()) {
    hash.update(path.relative(root, f)).update(fs.readFileSync(f));
  }
  return hash.digest('hex').slice(0, 10);
}

// Replace __KEY__ in the dev index.html. Not Vite's %KEY%: with envPrefix set,
// Vite's own env hook runs first and warns about variables it cannot resolve.
function devPageConfig(values: Record<string, string>): Plugin {
  return {
    name: 'compass-dev-page-config',
    transformIndexHtml: (html) =>
      Object.entries(values).reduce(
        (out, [key, value]) => out.replaceAll(`__${key}__`, value),
        html,
      ),
  };
}

// Serve bathy/ in dev as nginx does in production; it is not under public/.
function serveBathymetry(): Plugin {
  return {
    name: 'serve-bathymetry',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/bathy/')) return next();
        const rel = decodeURIComponent(req.url.slice('/bathy/'.length).split('?')[0]);
        const file = path.resolve(bathyDir, rel);
        const stat = file.startsWith(bathyDir + path.sep)
          ? fs.statSync(file, { throwIfNoEntry: false })
          : undefined;
        if (!stat?.isFile()) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader('Content-Type', 'image/webp');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

// Custom elements can't be redefined: full-reload any update reaching the element.
function reloadCustomElement(file: string): Plugin {
  return {
    name: 'compass-reload-custom-element',
    apply: 'serve',
    handleHotUpdate({ modules, server }) {
      const seen = new Set<ModuleNode>();
      const reaches = (mod: ModuleNode): boolean => {
        if (seen.has(mod)) return false;
        seen.add(mod);
        if (mod.file === file) return true;
        if (mod.isSelfAccepting) return false;
        return [...mod.importers].some(reaches);
      };
      if (!modules.some(reaches)) return;
      server.ws.send({ type: 'full-reload' });
      return [];
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, 'COMPASS_');
  const devPort = Number(env.COMPASS_DEV_PORT || 5173);
  const apiUrl = env.COMPASS_API_URL || `http://localhost:${env.COMPASS_HTTP_PORT || 8780}`;

  return {
    envDir: repoRoot,
    envPrefix: 'COMPASS_',
    define: {
      __ASSET_V__: JSON.stringify(assetVersion()),
      __APP_VERSION__: JSON.stringify(
        JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
      ),
    },
    server: {
      port: devPort,
      strictPort: true,
    },
    plugins: [
      devPageConfig({ COMPASS_API_URL: apiUrl }),
      // Options live in svelte.config.js, which svelte-check reads too.
      svelte(),
      reloadCustomElement(path.join(root, 'src/components/CompassMap.svelte')),
      serveBathymetry(),
    ],
    esbuild: { legalComments: 'eof' },
    build: {
      lib: {
        entry: './src/main.ts',
        name: 'CompassMap',
        fileName: () => 'compass-map.js',
        formats: ['iife'],
      },
      rollupOptions: {
        output: {
          extend: true,
        },
      },
    },
  };
});
