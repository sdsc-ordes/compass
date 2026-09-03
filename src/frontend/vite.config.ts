import { defineConfig } from 'vite'
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [

    svelte({
      preprocess: [vitePreprocess()],
      compilerOptions: {
        customElement: true,
      },
    }),
  ],
  // maplibre-gl is BSD-3-Clause and svelte, qrcode, geojson and
  // polygon-clipping are MIT/ISC: all require their notice to travel with the
  // distribution. The widget ships as one minified file with nothing beside
  // it, so the banners are appended to it rather than stripped.
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
})
