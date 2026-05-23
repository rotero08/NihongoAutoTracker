/**
 * ── Development Mock Data ────────────────────────────────────────────────────
 *
 * Test data for popup/settings UI development. Injected only when
 * VITE_MOCK_DATA=true in .env. Provides realistic queue items so you
 * can iterate on the UI without needing real browsing sessions.
 */

import type { QueuedVideoLog, QueuedReadingLog } from '../lib/types';

/** Sample video queue items for dev testing */
export const MOCK_VIDEO_QUEUE: QueuedVideoLog[] = [
  {
    id: 'mock-video-1',
    contentTitleNative: 'テスト日本語チャンネル',
    contentTitleEnglish: 'https://www.youtube.com/watch?v=test123',
    time: 45,
    date: new Date().toISOString(),
    description: '【日本語】テスト動画タイトル - Episode 5',
    private: false,
    tags: [],
    channelId: 'UCtest123',
    sessions: [
      { id: 'sess-v1', secs: 1200, date: new Date(Date.now() - 3600000).toISOString() },
      { id: 'sess-v2', secs: 900, date: new Date().toISOString() },
    ],
    mediaData: { channelId: 'UCtest123', channelTitle: 'テスト日本語チャンネル' },
  },
  {
    id: 'mock-video-2',
    contentTitleNative: 'ゲーム実況チャンネル',
    contentTitleEnglish: 'https://www.youtube.com/watch?v=game456',
    time: 22,
    date: new Date(Date.now() - 86400000).toISOString(),
    description: 'マインクラフト実況 #12 - YouTube',
    private: false,
    tags: [],
    channelId: '',
    sessions: [],
    mediaData: { channelTitle: 'ゲーム実況チャンネル' },
  },
];

/** Sample reading queue items for dev testing */
export const MOCK_READING_QUEUE: QueuedReadingLog[] = [
  {
    id: 'mock-reading-1',
    type: 'reading',
    contentTitleNative: '転生したらスライムだった件',
    contentTitleEnglish: '',
    description: '転生したらスライムだった件',
    chars: 15420,
    time: 5400,
    date: new Date().toISOString(),
    volume: 3,
    private: false,
    tags: [],
    sessions: [
      { id: 'sess-r1', secs: 2400, chars: 8200, date: new Date(Date.now() - 7200000).toISOString() },
      { id: 'sess-r2', secs: 1800, chars: 4100, date: new Date(Date.now() - 3600000).toISOString() },
      { id: 'sess-r3', secs: 1200, chars: 3120, date: new Date().toISOString() },
    ],
    mediaId: '',
    mediaData: {
      contentId: '',
      contentTitleNative: '転生したらスライムだった件',
      contentTitleEnglish: 'That Time I Got Reincarnated as a Slime',
    },
    originalTitle: '転生したらスライムだった件',
    readerName: 'TTU Reader',
  },
  {
    id: 'mock-reading-2',
    type: 'reading',
    contentTitleNative: '薬屋のひとりごと',
    contentTitleEnglish: '',
    description: '薬屋のひとりごと',
    chars: 3200,
    time: 1800,
    date: new Date(Date.now() - 43200000).toISOString(),
    volume: 1,
    private: false,
    mediaId: '',
    tags: [],
    sessions: [
      { id: 'sess-r4', secs: 1800, chars: 3200, date: new Date(Date.now() - 43200000).toISOString() },
    ],
    originalTitle: '薬屋のひとりごと',
    readerName: 'Yatsu Reader',
  },
];
