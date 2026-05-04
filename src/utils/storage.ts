import { storage } from '#imports';
export type OverlayPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'hidden';
export type LogMode = 'auto' | 'manual';

export interface TrackerConfig {
  apiKey: string;
  logMode: LogMode;
  autoSend?: boolean;
  threshold: number;
  thresholdType?: 'percent' | 'time';
  thresholdValue?: number;
  trackTime: boolean;
  hideButtons: boolean;
  hideIfNotJapanese?: boolean;
  hideMusic?: boolean; // NEW: Toggle hiding log badge on music videos
  overlayPosition: OverlayPosition;
  showTotalInBadge: boolean;
  ttuEnabled: boolean; // Required explicitly for defaults to apply flawlessly
  ttuAutoSave?: boolean;
  ttuDirectSend?: boolean;
  allowSites?: string[];
  skipSites?: string[];
  allowListOnly?: boolean;
  warnUntracked?: boolean;
  autoSendEndOfDay?: boolean;
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
  time: number;
  date: string;
  private: boolean;
  tags: string[];
  sessions?: { id: string; secs: number; chars: number; date: string }[];
  mediaId?: string;
  mediaData?: any;
  volume?: number;
  originalTitle?: string;
}

export interface TTUHistorySession {
  id: string;
  date: string;
  timeMs: number;
  chars: number;
}

export interface TTULink {
  mediaId: string;
  volume: number;
  mediaData: any;
}

export const configStorage = storage.defineItem<TrackerConfig>('local:config', {
  defaultValue: {
    apiKey: '',
    logMode: 'manual',
    threshold: 95,
    trackTime: true,
    hideButtons: false,
    hideMusic: false,
    overlayPosition: 'top-right',
    showTotalInBadge: true,
    ttuEnabled: true, // Defaults to ON immediately.
    ttuAutoSave: true,
    warnUntracked: true,
    autoSendEndOfDay: false,
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

export const ttuLinkStorage = storage.defineItem<Record<string, TTULink>>('local:ttuLink', {
  defaultValue: {},
});
