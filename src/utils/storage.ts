import { storage } from '#imports';

export type OverlayPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'hidden';
export type LogMode = 'auto' | 'manual';

export interface TrackerConfig {
  apiKey: string;
  logMode: LogMode;
  threshold: number;        // 90–100 %
  trackTime: boolean;
  hideButtons: boolean;
  overlayPosition: OverlayPosition;
}

export interface QueuedVideoLog {
  id: string;               // crypto.randomUUID()
  contentTitleNative: string;
  contentTitleEnglish: string;
  time: number;             // minutes
  date: string;             // ISO
  private: boolean;
  tags: string[];
  description: string;
}

export const configStorage = storage.defineItem<TrackerConfig>('local:config', {
  defaultValue: {
    apiKey: '',
    logMode: 'manual',
    threshold: 95,
    trackTime: true,
    hideButtons: false,
    overlayPosition: 'top-right',
  },
});

export const videoQueueStorage = storage.defineItem<QueuedVideoLog[]>('local:videoQueue', {
  defaultValue: [],
});
