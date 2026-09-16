import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const root = path.dirname(fileURLToPath(import.meta.url));
const bathyDir = path.join(root, 'bathy');

const repoRoot = path.resolve(root, '..', '..');

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, 'COMPASS_');
  const devPort = Number(env.COMPASS_DEV_PORT || 5173);
  const apiUrl = env.COMPASS_API_URL || `http://localhost:${env.COMPASS_HTTP_PORT || 8780}`;

  return {
    envDir: repoRoot,
    envPrefix: 'COMPASS_',
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
