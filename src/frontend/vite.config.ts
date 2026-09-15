import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const root = path.dirname(fileURLToPath(import.meta.url));
const tilesDir = path.join(root, 'tiles');

const repoRoot = path.resolve(root, '..', '..');

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
      serveBathymetryTiles(),
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
