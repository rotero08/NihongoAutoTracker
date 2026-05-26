import { defineConfig } from 'wxt';
import path from 'path';

// Retrieve the active target browser (defaults to 'chrome' if undefined)
const currentBrowser = process.env.WXT_BROWSER || 'chrome';
const isFirefox = currentBrowser === 'firefox';

export default defineConfig({
  /* ── Source directory ───────────────────────────────────────── */
  srcDir: 'src',

  /* ── Svelte integration via WXT module ─────────────────────── */
  modules: ['@wxt-dev/module-svelte'],

  /* ── Runner configuration to lock toolbar layout profiles ─── */
  webExt: {
    // Tells the runner where to securely store your layout customizations
    ...(isFirefox ? {
      firefoxProfile: path.resolve(__dirname, '.wxt/firefox-profile'),
      keepProfileChanges: true,
    } : {}),

    startUrls: [
      'https://www.youtube.com/watch?v=jNVxpEiJIR4',
      'https://www.youtube.com/watch?v=JPcsLaGA7fI&list=PLI76y3FWv18CrvaxtcS5QcAb7qaUQHtmB',
      'https://reader.ttsu.app',
      'https://app.yatsu.moe',
      'https://manga.manabe.es/ranobe/1?yomiyasuId=6601e1448da0d5f8523883fa',
      'https://www.yomiuri.co.jp/editorial/20260506-GYT1T00155/',
    ],
  },

  /* ── Extension manifest configuration ──────────────────────── */
  manifest: {
    name: 'NihongoAutoTracker',
    description:
      'An unofficial extension for NihongoTracker that automates and streamlines your Japanese immersion logging.',
    version: '3.9.0',
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
});
