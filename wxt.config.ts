import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'NihongoAutoTracker',
    version: '3.3.0',
    permissions: ['storage', 'contextMenus', 'notifications', 'tabs'],
    host_permissions: [
      'https://nihongotracker.app/*',
      'https://*.nihongotracker.app/*',
    ],
    browser_specific_settings: {
      gecko: {
        id: 'nihongo-auto-tracker@nta.com',
        data_collection_permissions: {
          required: ["none"]
        }
      },
    },
  },
});
