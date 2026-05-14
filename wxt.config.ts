import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'NihongoAutoTracker',
    description: 'An unofficial extension for NihongoTracker that automates and streamlines your Japanese immersion logging.',
    version: '3.4.2',
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
