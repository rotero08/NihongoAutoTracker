/**
 * ── Settings Entry Point ─────────────────────────────────────────────────────
 *
 * Bootstraps the Svelte settings application. In dev mode, optionally
 * injects mock data and pre-populates the API key from environment.
 */

import { configStorage } from '@/lib/storage/config';
import { readingQueueStorage, stremioQueueStorage, videoQueueStorage } from '@/lib/storage/queues';
import '@/styles/app.css';
import { mount } from 'svelte';
import App from './App.svelte';

/* ── Dev-mode mock data injection ─────────────────────────────────────────── */
async function injectMockData() {
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK_DATA === 'true') {
    // Run queue emptiness checks in parallel to minimize latency on startup
    const [existingVideo, existingReading, existingStremio] = await Promise.all([
      videoQueueStorage.getValue(),
      readingQueueStorage.getValue(),
      stremioQueueStorage.getValue()
    ]);

    if (existingVideo.length === 0 && existingReading.length === 0 && existingStremio.length === 0) {
      const { MOCK_VIDEO_QUEUE, MOCK_READING_QUEUE, MOCK_STREMIO_QUEUE } = await import('@/dev/mock-data');
      await Promise.all([
        videoQueueStorage.setValue(MOCK_VIDEO_QUEUE as any),
        readingQueueStorage.setValue(MOCK_READING_QUEUE as any),
        stremioQueueStorage.setValue(MOCK_STREMIO_QUEUE as any)
      ]);
    }
  }

  if (import.meta.env.DEV && import.meta.env.VITE_NT_API_KEY) {
    const cfg = await configStorage.getValue();
    if (!cfg?.apiKey) {
      await configStorage.setValue({ ...cfg, apiKey: import.meta.env.VITE_NT_API_KEY });
    }
  }
}

/* ── Mount ────────────────────────────────────────────────────────────────── */
injectMockData().then(() => {
  mount(App, { target: document.getElementById('app')! });
});
