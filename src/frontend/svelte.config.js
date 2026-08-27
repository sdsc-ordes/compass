import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  // Components are compiled as custom elements (see vite.config.ts); declare it
  // here too so svelte-check understands the <svelte:options customElement> tags.
  compilerOptions: {
    customElement: true,
  },
};
