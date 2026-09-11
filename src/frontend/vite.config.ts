import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const root = path.dirname(fileURLToPath(import.meta.url));
const tilesDir = path.join(root, 'tiles');

// The project's one config file, at the repository root: Compose reads it, the
// backend's settings.py reads it, and so does this. Nothing about where the API
// listens or which port is allowed through CORS is settled twice.
const repoRoot = path.resolve(root, '..', '..');

/** Replaces %COMPASS_*% in the dev page, which vite alone would leave standing
    when the variable is unset -- and .env is optional, since every value has a
    default here and in settings.py. */
function devPageConfig(values: Record<string, string>): Plugin {
  return {
    name: 'compass-dev-page-config',
    transformIndexHtml: (html) =>
      Object.entries(values).reduce(
        (out, [key, value]) => out.replaceAll(`%${key}%`, value),
        html,
      ),
  };
}

/** Serve `just map::tiles` output at /tiles/ during `npm run dev`. */
function serveBathymetryTiles(): Plugin {
  return {
    name: 'serve-bathymetry-tiles',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/tiles/')) return next();
        const rel = decodeURIComponent(req.url.slice('/tiles/'.length).split('?')[0] ?? '');
        const file = path.resolve(tilesDir, rel);
        if (
          !file.startsWith(tilesDir + path.sep) ||
          !fs.existsSync(file) ||
          !fs.statSync(file).isFile()
        ) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader('Content-Type', 'image/jpeg');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, 'COMPASS_');
  // Defaults match settings.py, so the dev stack runs with no .env at all.
  const devPort = Number(env.COMPASS_DEV_PORT || 5173);
  const apiUrl = env.COMPASS_API_URL || `http://localhost:${env.COMPASS_HTTP_PORT || 8780}`;

  return {
    envDir: repoRoot,
    envPrefix: 'COMPASS_',
    server: {
      // COMPASS_CORS_ORIGINS names the origins the API answers, and this port has
      // to be one of them. Vite's habit of stepping to the next free port when
      // this one is taken therefore does not degrade gracefully: every request
      // fails CORS, and the console blames the backend for what is really a stale
      // dev server holding the port. Fail loudly instead.
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
      serveBathymetryTiles(),
    ],
    // svelte, d3-geo and topojson-client are ISC/BSD-3-Clause, and all require
    // their notice to travel with the distribution. The widget ships as one
    // minified file with nothing beside it, so the banners are appended to it
    // rather than stripped.
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
