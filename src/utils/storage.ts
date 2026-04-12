import { storage } from '#imports';

export interface TrackerConfig {
  apiKey: string;
}

// We use 'local:' to ensure it persists on your machine
export const configStorage = storage.defineItem<TrackerConfig>(
  'local:config',
  { 
    defaultValue: { apiKey: '' } 
  }
);
