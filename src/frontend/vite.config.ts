import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const root = path.dirname(fileURLToPath(import.meta.url));
const tilesDir = path.join(root, 'tiles');

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

export default defineConfig({
  plugins: [
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
});
