/**
 * ── Settings Entry Point ─────────────────────────────────────────────────────
 *
 * Bootstraps the Svelte settings application. In dev mode, optionally
 * injects mock data and pre-populates the API key from environment.
 */

import '@/styles/app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { videoQueueStorage, readingQueueStorage } from '@/lib/storage/queues';
import { configStorage } from '@/lib/storage/config';

/* ── Dev-mode mock data injection ─────────────────────────────────────────── */
async function injectMockData() {
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK_DATA === 'true') {
    const { MOCK_VIDEO_QUEUE, MOCK_READING_QUEUE } = await import('@/dev/mock-data');
    const existingVideo = await videoQueueStorage.getValue();
    const existingReading = await readingQueueStorage.getValue();

    if (existingVideo.length === 0 && existingReading.length === 0) {
      await videoQueueStorage.setValue(MOCK_VIDEO_QUEUE as any);
      await readingQueueStorage.setValue(MOCK_READING_QUEUE as any);
      console.log('[DEV] Mock data injected into queues');
    }
  }

  if (import.meta.env.DEV && import.meta.env.VITE_NT_API_KEY) {
    const cfg = await configStorage.getValue();
    if (!cfg?.apiKey) {
      await configStorage.setValue({ ...cfg, apiKey: import.meta.env.VITE_NT_API_KEY });
      console.log('[DEV] API key pre-populated from .env');
    }
  }
}

/* ── Mount ────────────────────────────────────────────────────────────────── */
injectMockData().then(() => {
  mount(App, { target: document.getElementById('app')! });
});
