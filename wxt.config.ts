import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'NihongoAutoTracker',
    description: 'Unofficial Japanese immersion tracker for NihongoTracker',
    version: '1.0.0',
    permissions: ['storage', 'contextMenus', 'activeTab', 'tabs', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: {},
  },
});
