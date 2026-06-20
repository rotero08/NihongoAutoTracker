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
const isFirefox = currentBrowser === 'firefox';
const isChromium = ['chrome', 'edge', 'opera'].includes(currentBrowser);

const firefoxProfilePath = path.resolve(process.cwd(), '.wxt/firefox-profile');
const chromiumProfilePath = path.resolve(process.cwd(), `.wxt/${currentBrowser}-profile`);

try {
  if (isFirefox && !fs.existsSync(firefoxProfilePath)) {
    fs.mkdirSync(firefoxProfilePath, { recursive: true });
  }
  if (isChromium && !fs.existsSync(chromiumProfilePath)) {
    fs.mkdirSync(chromiumProfilePath, { recursive: true });
  }
} catch (error) {
  // Fall back silently
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
    ...(isFirefox && { firefoxProfile: firefoxProfilePath }),
    ...(isChromium && { chromiumProfile: chromiumProfilePath }),
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
    version: '4.2.5', // DO NOT CHANGE THIS MANUALLY, USE pnpm release TO RELEASE, AND IT WILL CHANGE AUTOMATICALLY
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
