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
  queueThresholdType?: 'percent' | 'time';
  queueThresholdValue?: number;
  trackTime: boolean;
  hideButtons: boolean;
  hideIfNotJapanese?: boolean;
  hideMusic?: boolean;
  overlayPosition: OverlayPosition;
  showTotalInBadge: boolean;
  ttuEnabled: boolean;
  ttuAutoSave?: boolean;
  ttuDirectSend?: boolean;
  allowSites?: string[];
  skipSites?: string[];
  allowListOnly?: boolean;
  warnUntracked?: boolean;
  autoSendEndOfDay?: boolean;
  debugMode?: boolean; // NEW
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
  mediaData?: any;
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

export interface DebugLog {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  source: string;
  message: string;
  data?: string;
}

export const configStorage = storage.defineItem<TrackerConfig>('local:config', {
  defaultValue: {
    apiKey: '',
    logMode: 'manual',
    threshold: 95,
    queueThresholdType: 'time',
    queueThresholdValue: 1,
    trackTime: true,
    hideButtons: false,
    hideMusic: false,
    overlayPosition: 'top-right',
    showTotalInBadge: true,
    ttuEnabled: true,
    ttuAutoSave: true,
    warnUntracked: true,
    autoSendEndOfDay: false,
    debugMode: false,
  },
});

export const videoQueueStorage = storage.defineItem<QueuedVideoLog[]>('local:videoQueue', { defaultValue:[] });
export const readingQueueStorage = storage.defineItem<QueuedReadingLog[]>('local:readingQueue', { defaultValue:[] });
export const ttuHistoryStorage = storage.defineItem<Record<string, TTUHistorySession[]>>('local:ttuHistory', { defaultValue: {} });
export const ttuLinkStorage = storage.defineItem<Record<string, TTULink>>('local:ttuLink', { defaultValue: {} });

export const debugLogStorage = storage.defineItem<DebugLog[]>('local:debugLogs', { defaultValue:[] });

// ALWAYS COLLECTS LOGS - Masks API Key context dynamically
export async function addDebugLog(level: 'INFO'|'WARN'|'ERROR', source: string, message: string, data?: any) {
  try {
    const logs = await debugLogStorage.getValue() ||[];
    let dataStr = undefined;
    if (data !== undefined) {
      try {
        dataStr = typeof data === 'string' ? data : JSON.stringify(data);
        dataStr = dataStr.replace(/"X-API-Key":"[^"]+"/g, '"X-API-Key":"***"');
        dataStr = dataStr.replace(/"apiKey":"[^"]+"/g, '"apiKey":"***"');
      } catch (e) {
        dataStr = String(data);
      }
    }
    logs.unshift({ timestamp: new Date().toISOString(), level, source, message, data: dataStr });
    if (logs.length > 200) logs.length = 200; // Limit memory footprint
    await debugLogStorage.setValue(logs);
    console.log(`[NT-DEBUG] [${level}] ${source}: ${message}`, data || '');
  } catch (e) {
    console.error('Failed to write debug log', e);
  }
}
