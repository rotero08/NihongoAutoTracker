import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  /* ── Source directory ───────────────────────────────────────── */
  srcDir: 'src',

  /* ── Svelte integration via WXT module ─────────────────────── */
  modules: ['@wxt-dev/module-svelte'],

  /* ── Use Firefox for development ─────────────────────────── */
  browser: 'firefox',

  /* ── Extension manifest configuration ──────────────────────── */
  manifest: {
    name: 'NihongoAutoTracker',
    description:
      'An unofficial extension for NihongoTracker that automates and streamlines your Japanese immersion logging.',
    version: '3.4.3',
    permissions: ['storage', 'contextMenus', 'notifications', 'tabs'],
    host_permissions: [
      'https://nihongotracker.app/*',
      'https://*.nihongotracker.app/*',
    ],
    browser_specific_settings: {
      gecko: {
        id: 'nihongo-auto-tracker@nta.com',
        // @ts-ignore — Firefox-specific field not in WXT type definitions
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },

  /* ── Vite plugin configuration ─────────────────────────────── */
  vite: () => ({
    plugins: [
      /* Tailwind CSS v4 — processes @import "tailwindcss" directives */
      tailwindcss(),
    ],
  }),
});
