import { storage } from '#imports';

export type OverlayPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'hidden';
export type LogMode = 'auto' | 'manual';

export interface TrackerConfig {
  apiKey: string;
  logMode: LogMode;
  threshold: number;
  trackTime: boolean;
  hideButtons: boolean;
  overlayPosition: OverlayPosition;
  showTotalInBadge: boolean; // Added[cite: 3]
}

export interface QueuedVideoLog {
  id: string;
  contentTitleNative: string;
  contentTitleEnglish: string;
  time: number;
  date: string;
  private: boolean;
  tags: string[];
  description: string;
  channelId?: string; // Added[cite: 3]
  sessions?: { id: string; secs: number; date: string }[]; // Added[cite: 3]
}

export const configStorage = storage.defineItem<TrackerConfig>('local:config', {
  defaultValue: {
    apiKey: '',
    logMode: 'manual',
    threshold: 95,
    trackTime: true,
    hideButtons: false,
    overlayPosition: 'top-right',
    showTotalInBadge: true,
  },
});

export const videoQueueStorage = storage.defineItem<QueuedVideoLog[]>('local:videoQueue', {
  defaultValue: [],
});
