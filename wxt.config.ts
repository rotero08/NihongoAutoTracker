import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'NihongoAutoTracker',
    version: '2.7.0',
    permissions: ['storage', 'contextMenus', 'notifications', 'tabs'],
    host_permissions: [
      'https://nihongotracker.app/*',
      'https://*.nihongotracker.app/*',
    ],
    browser_specific_settings: {
      gecko: {
        id: 'nihongo-auto-tracker@rotero08.com', // Must be in email format
      },
    },
  },
});
