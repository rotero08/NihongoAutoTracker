/**
 * ── WXT Configuration File ──────────────────────────────────────────────────
 * Central build and packing configuration for the browser extension.
 * WXT dynamically reads package version, eliminating hardcoded desync risks.
 */

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
      if (!trimmedLine || trimmedLine.startsWith('#') || !trimmedLine.includes('=')) {
        continue;
      }
      const [key, ...valueParts] = trimmedLine.split('=');
      const value = valueParts.join('=').trim();
      if (key) {
        process.env[key.trim()] = value.replace(/^["']|["']$/g, '');
      }
    }
  }
} catch (error) {
  // Fall back silently if the .env file is missing or unreadable
}

const currentBrowser = process.env.WXT_BROWSER || 'chrome';

// Persistent dev profiles, one per browser family. Both are always configured:
// the browser actually launched can come from the CLI (`wxt -b chrome`) rather
// than from WXT_BROWSER, and a profile that is only set up for the env value
// leaves the other browser on a throwaway profile that forgets pinned icons,
// installed extensions and settings on every run.
const firefoxProfilePath = path.resolve(process.cwd(), '.wxt/firefox-profile');
const chromiumProfilePath = path.resolve(process.cwd(), '.wxt/chromium-profile');

for (const profilePath of [firefoxProfilePath, chromiumProfilePath]) {
  try {
    fs.mkdirSync(profilePath, { recursive: true });
  } catch (error) {
    console.warn(`[wxt.config] Could not create the dev profile at ${profilePath}; the browser will start with a temporary one.`, error);
  }
}

export default defineConfig({
  srcDir: 'src',
  browser: currentBrowser,
  modules: ['@wxt-dev/module-svelte'],

  svelte: {
    vite: {
      compilerOptions: {
        hmr: false,
      },
    },
  },

  web_accessible_resources: [
    { resources: ['ttu-live-bridge.js'], matches: ['https://reader.ttsu.app/*', 'https://app.yatsu.moe/*', 'https://manga.manabe.es/*'] }
  ],

  webExt: {
    keepProfileChanges: true,
    firefoxProfile: firefoxProfilePath,
    chromiumProfile: chromiumProfilePath,
    startUrls: [
      'https://www.youtube.com/watch?v=jNVxpEiJIR4',
      'https://www.youtube.com/watch?v=JPcsLaGA7fI&list=PLI76y3FWv18CrvaxtcS5QcAb7qaUQHtmB',
      'https://reader.ttsu.app',
      'https://app.yatsu.moe',
      'https://manga.manabe.es/ranobe/1?yomiyasuId=6601e1448da0d5f8523883fa',
      'https://www.yomiuri.co.jp/editorial/20260506-GYT1T00155/',
    ],
  },

  manifest: {
    name: 'NihongoAutoTracker',
    description: 'An unofficial NihongoTracker extension to automate your Japanese immersion logging.',
    version: '4.3.2', // DO NOT CHANGE THIS MANUALLY, USE pnpm release TO RELEASE, AND IT WILL CHANGE AUTOMATICALLY
    permissions: [
      'storage',
      'contextMenus',
      'notifications',
      'tabs',
      'alarms',
      'scripting',
      'activeTab'
    ],
    host_permissions: [
      'https://nihongotracker.app/*',
      'https://*.nihongotracker.app/*',
      'https://api.trakt.tv/*',
    ],
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "96": "icon/96.png",
      "128": "icon/128.png"
    },
    action: {
      default_icon: {
        "16": "icon/16.png",
        "32": "icon/32.png",
        "48": "icon/48.png",
        "96": "icon/96.png",
        "128": "icon/128.png"
      },
      // @ts-ignore
      default_area: 'navbar',
    },
    browser_specific_settings: {
      gecko: {
        id: 'nihongo-auto-tracker@nta.com',
        // @ts-ignore
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
});
