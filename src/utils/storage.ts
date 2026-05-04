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
  showTotalInBadge: boolean;
  ttuEnabled?: boolean;
  allowSites?: string[];
  skipSites?: string[];
  allowListOnly?: boolean;
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
  channelId?: string;
  sessions?: { id: string; secs: number; date: string }[];
}

export interface QueuedReadingLog {
  id: string;
  type: 'reading';
  contentTitleNative: string;
  contentTitleEnglish: string;
  description: string;
  chars: number;
  time: number; // Stored in seconds for granular queue building
  date: string;
  private: boolean;
  tags: string[];
  sessions?: { id: string; secs: number; chars: number; date: string }[];
}

export interface TTUHistorySession {
  id: string;
  date: string;
  timeMs: number;
  chars: number;
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
  defaultValue:[],
});

export const readingQueueStorage = storage.defineItem<QueuedReadingLog[]>('local:readingQueue', {
  defaultValue:[],
});

export const ttuHistoryStorage = storage.defineItem<Record<string, TTUHistorySession[]>>('local:ttuHistory', {
  defaultValue: {},
});
