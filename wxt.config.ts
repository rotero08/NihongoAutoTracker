import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  /* ── Source directory ───────────────────────────────────────── */
  srcDir: 'src',

  /* ── Svelte integration via WXT module ─────────────────────── */
  modules: ['@wxt-dev/module-svelte'],

  /* ── Use Firefox for development ─────────────────────────── */
  browser: 'firefox',

  /* ── Runner configuration to lock toolbar layout profiles ─── */
  webExt: {
    // Tells the runner where to securely store your layout customizations
    firefoxProfile: path.resolve(__dirname, '.wxt/firefox-profile'),
    keepProfileChanges: true,

    startUrls: [
      'https://www.youtube.com/watch?v=jNVxpEiJIR4',
      'https://reader.ttsu.app',
      'https://app.yatsu.moe',
    ],
  },

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

    action: {
      // @ts-ignore - Tells Firefox to anchor this button on the navigation bar (toolbar)
      default_area: 'navbar',
    },

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
