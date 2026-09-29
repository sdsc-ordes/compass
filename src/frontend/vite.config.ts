import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type ModuleNode, type Plugin } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const root = path.dirname(fileURLToPath(import.meta.url));
const bathyDir = path.join(root, 'bathy');

const repoRoot = path.resolve(root, '..', '..');

// A rebake keeps the file names, so the bundle fetches them as ?v=<this>: a
// hash of every raster and the atlas, which lets nginx cache them immutable.
// Taken from what is on disk at build, d/ included when it has been baked.
function assetVersion(): string {
  const files = (dir: string): string[] =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const p = path.join(dir, e.name);
          return e.isDirectory() ? files(p) : [p];
        })
      : [];
  const hash = crypto.createHash('sha256');
  for (const f of [...files(bathyDir), path.join(root, 'public/basemap/atlas.json')].sort()) {
    hash.update(path.relative(root, f)).update(fs.readFileSync(f));
  }
  return hash.digest('hex').slice(0, 10);
}

// Substitutes __VAR__ in the dev-only index.html. Deliberately not Vite's own
// %VAR% syntax: envPrefix below makes Vite's built-in env hook claim those, and
// it runs ahead of this one, warning about a variable we resolve ourselves.
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

// The baked rasters live outside the bundle (they are megabytes), so the dev
// server hands them over the same way nginx does in production.
function serveBathymetry(): Plugin {
  return {
    name: 'serve-bathymetry',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/bathy/')) return next();
        const rel = decodeURIComponent(req.url.slice('/bathy/'.length).split('?')[0] ?? '');
        const file = path.resolve(bathyDir, rel);
        if (
          !file.startsWith(bathyDir + path.sep) ||
          !fs.existsSync(file) ||
          !fs.statSync(file).isFile()
        ) {
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
    define: { __ASSET_V__: JSON.stringify(assetVersion()) },
    server: {
      port: devPort,
      strictPort: true,
    },
    plugins: [
      devPageConfig({ COMPASS_API_URL: apiUrl }),
      svelte({
        preprocess: [vitePreprocess()],
        compilerOptions: {
          customElement: true,
        },
      }),
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
