/**
 * ── Popup Entry Point ────────────────────────────────────────────────────────
 *
 * Bootstraps the Svelte popup application. In dev mode with VITE_MOCK_DATA=true,
 * injects mock queue data so the popup has content to display without needing
 * real browsing sessions.
 */

import { configStorage } from '@/lib/storage/config';
import { readingQueueStorage, videoQueueStorage } from '@/lib/storage/queues';
import '@/styles/app.css';
import { mount } from 'svelte';
import App from './App.svelte';

/* ── Dev-mode mock data injection ─────────────────────────────────────────── */
async function injectMockData() {
  const isDev = typeof import.meta.env !== 'undefined' && import.meta.env.DEV;
  const mockDataEnabled = typeof import.meta.env !== 'undefined' && import.meta.env.VITE_MOCK_DATA === 'true';
  const ntApiKey = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_NT_API_KEY : undefined;

  if (isDev && mockDataEnabled) {
    // Read both queues in parallel to save storage IPC round-trip latency
    const [existingVideo, existingReading] = await Promise.all([
      videoQueueStorage.getValue(),
      readingQueueStorage.getValue()
    ]);

    /* Only inject if queues are empty (don't overwrite real data) */
    if (existingVideo.length === 0 && existingReading.length === 0) {
      const { MOCK_VIDEO_QUEUE, MOCK_READING_QUEUE } = await import('@/dev/mock-data');

      // Perform mock data writes in parallel
      await Promise.all([
        videoQueueStorage.setValue(MOCK_VIDEO_QUEUE as any),
        readingQueueStorage.setValue(MOCK_READING_QUEUE as any)
      ]);
      console.log('[DEV] Mock data injected into queues');
    }
  }

  /* Pre-populate API key from env if not set */
  if (isDev && ntApiKey) {
    const cfg = await configStorage.getValue();
    if (!cfg?.apiKey) {
      await configStorage.setValue({ ...cfg, apiKey: ntApiKey });
      console.log('[DEV] API key pre-populated from .env');
    }
  }
}

/* ── Mount ────────────────────────────────────────────────────────────────── */
// Mount the application instantly to paint the primary layout skeleton on the first frame
mount(App, { target: document.getElementById('app')! });

// Run development mock data injection asynchronously so it doesn't block the critical mounting path
const isDev = typeof import.meta.env !== 'undefined' && import.meta.env.DEV;
if (isDev) {
  injectMockData().catch((err) => {
    console.error('[DEV] Failed to inject mock data:', err);
  });
}