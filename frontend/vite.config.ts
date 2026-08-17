import { defineConfig } from 'vite'
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  // src/engine reads ontology/*.ttl, which sits above this root.
  server: { fs: { allow: ['..'] } },
  optimizeDeps: { exclude: ['oxigraph'] },
  plugins: [

    svelte({
      preprocess: [vitePreprocess()],
      compilerOptions: {
        customElement: true,
      },
    }),
  ],
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
