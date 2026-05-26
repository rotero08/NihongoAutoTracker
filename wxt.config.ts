import fs from 'fs';
import path from 'path';
import { defineConfig } from 'wxt';

// Safely load the .env file before WXT processes the configuration
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmedLine = line.trim();
      // Ignore empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('#') || !trimmedLine.includes('=')) {
        continue;
      }
      const [key, ...valueParts] = trimmedLine.split('=');
      const value = valueParts.join('=').trim();
      if (key) {
        // Assign to process.env and strip wrapping quotes
        process.env[key.trim()] = value.replace(/^["']|["']$/g, '');
      }
    }
  }
} catch (error) {
  // Fall back silently if the .env file is missing or unreadable
}

// Retrieve the active target browser (defaults to 'chrome' if undefined)
const currentBrowser = process.env.WXT_BROWSER || 'chrome';
const isFirefox = currentBrowser === 'firefox';
const isChromium = ['chrome', 'edge', 'opera'].includes(currentBrowser);

export default defineConfig({
  /* ── Source directory ───────────────────────────────────────── */
  srcDir: 'src',

  /* ── Target browser for development/builds ──────────────────── */
  browser: currentBrowser,

  /* ── Svelte integration via WXT module ─────────────────────── */
  modules: ['@wxt-dev/module-svelte'],

  /* ── Runner configuration to lock toolbar layout profiles ─── */
  webExt: {
    // Keep profile changes across restarts for both Firefox and Chromium browsers
    keepProfileChanges: true,

    // Tells the runner where to securely store your layout customizations
    ...(isFirefox && {
      firefoxProfile: path.resolve(process.cwd(), '.wxt/firefox-profile'),
    }),
    ...(isChromium && {
      chromiumProfile: path.resolve(process.cwd(), `.wxt/${currentBrowser}-profile`),
    }),

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
    version: '4.0.0',
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