import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Svelte compiler configuration.
 * Uses vitePreprocess to handle TypeScript inside <script lang="ts"> blocks
 * and any CSS preprocessing in <style> blocks.
 */
export default {
  preprocess: [vitePreprocess()],
};
