import { storage } from 'wxt/storage';

export interface TrackerConfig {
  apiKey: string;
  logMode: 'auto' | 'manual';
  threshold: number;
  trackTextTime: boolean;
  hideButtons: boolean;
}

export const defaultConfig: TrackerConfig = {
  apiKey: '',
  logMode: 'auto',
  threshold: 90,
  trackTextTime: true,
  hideButtons: false,
};

export const configStorage = storage.defineItem<TrackerConfig>(
  'local:config',
  { defaultValue: defaultConfig }
);
