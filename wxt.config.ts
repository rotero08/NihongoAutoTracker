// wxt.config.ts
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'NihongoAutoTracker',
    version: '1.0.0',
    // ADD 'tabs' TO THIS ARRAY
    permissions: ['storage', 'contextMenus', 'notifications', 'tabs'], 
    host_permissions: [
      'https://nihongotracker.app/*',
      'https://*.nihongotracker.app/*'
    ],
  },
});
