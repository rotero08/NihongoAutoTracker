/**
 * ── Development Mock Data ────────────────────────────────────────────────────
 * Test data for popup/settings UI development. Injected only when
 * VITE_MOCK_DATA=true in .env. Provides realistic queue items so you
 * can iterate on the UI without needing real browsing sessions.
 */

import type { QueuedReadingLog, QueuedVideoLog, QueuedStremioLog } from '../lib/types';

/** Sample video queue items for dev testing */
export const MOCK_VIDEO_QUEUE: QueuedVideoLog[] = [
  {
    id: "mock-video-1",
    contentTitleNative: "テスト日本語チャンネル",
    contentTitleEnglish: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    time: 45,
    date: "2026-06-01T12:00:00.000Z",
    description: "【日本語】テスト動画タイトル - Episode 5",
    private: false,
    tags: [],
    channelId: "UCtest123",
    sessions: [
      {
        id: "sess-v1",
        secs: 1200,
        date: "2026-06-01T12:00:00.000Z"
      },
      {
        id: "sess-v2",
        secs: 900,
        date: "2026-06-01T12:00:00.000Z"
      }
    ],
    mediaData: {
      channelId: "UCtest123",
      channelTitle: "テスト日本語チャンネル"
    }
  },
  {
    id: "mock-video-2",
    contentTitleNative: "ゲーム実況チャンネル",
    contentTitleEnglish: "https://www.youtube.com/watch?v=mcraft012",
    time: 22,
    date: "2026-06-01T12:00:00.000Z",
    description: "マインクラフト実況 #12 - YouTube",
    private: false,
    tags: [],
    channelId: "",
    sessions: [],
    mediaData: {
      channelTitle: "ゲーム実況チャンネル"
    }
  },
  {
    id: "db3a496f-7af0-4cdd-9a72-d8a1316ebd35",
    contentTitleNative: "Kuzuha Channel",
    contentTitleEnglish: "https://www.youtube.com/watch?v=jNVxpEiJIR4",
    time: 6,
    date: "2026-06-01T12:00:00.000Z",
    private: false,
    tags: [],
    description:"【 Valorant 】 もってくれ体法制君90％ スクリム 3日目 【 #にじEXヴァロ teamD 】",
    sessions: [
      {
        id: "3e03abe7-dd44-48b0-acd3-dfbe2df72c76",
        secs: 242.28099999999998,
        date: "2026-06-01T12:00:00.000Z"
      },
      {
        id: "ae506e14-34db-410f-9e07-07be50a2193b",
        secs: 90.491,
        date: "2026-06-01T12:00:00.000Z"
      }
    ],
    channelId: "UCSFCh5NL4qXrAy9u-u2lX3g",
    mediaId: "UCSFCh5NL4qXrAy9u-u2lX3g",
    mediaData: {
      channelId: "UCSFCh5NL4qXrAy9u-u2lX3g",
      channelTitle: "Kuzuha Channel",
      channelImage: "https://yt3.googleusercontent.com/ytc/AIdro_kOiA-_aFW-Qz7jxl0wCPDRAKIYL7wDIgs9-iKo7NjztcA=s900-c-k-c0x00ffffff-no-rj",
      channelDescription: "石油王に求婚され養われることを目標にバーチャルライバーを始めた吸血鬼 of 葛葉 (くずは) ですGive me your money or blood.- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -▼ Twitterhttps://twit..."
    }
  },
  {
    id: "660426ba-bfe2-4dc9-ad7d-2f8e0735bb47",
    contentTitleNative: "Teppei",
    contentTitleEnglish: "https://www.youtube.com/watch?v=JPcsLaGA7fI",
    time: 2,
    date: "2026-06-01T12:00:00.000Z",
    private: false,
    tags: [],
    description: "Nihongo con Teppei#1『語学学習について』",
    sessions: [
      {
        id: "18c3a406-2808-403b-89af-47416dcf848b",
        secs: 90.36600000000001,
        date: "2026-06-01T12:00:00.000Z"
      }
    ],
    channelId: "UCH88l3_ltyJm67gAFzDFNRw",
    mediaId: "UCH88l3_ltyJm67gAFzDFNRw",
    mediaData: {
      channelId: "UCH88l3_ltyJm67gAFzDFNRw",
      channelTitle: "Teppei",
      channelImage: "https://yt3.googleusercontent.com/t0qOk45vOWlmIhQYwjNQGT3UI7W47TQSR7xWfOwaSkpMvy7N8jhAJkfkdN6ucxH5Sy42AtvgrQ=s900-c-k-c0x00ffffff-no-rj",
      channelDescription: "https://www.patreon.com/nihongoconteppeihttps://ko-fi.com/nihongoconteppei"
    }
  }
];

/** Sample reading queue items for dev testing */
export const MOCK_READING_QUEUE: QueuedReadingLog[] = [
  {
    id: "mock-reading-1",
    type: "reading",
    contentTitleNative: "転生したらスライムだった件",
    contentTitleEnglish: "",
    description: "転生したらスライムだった件",
    chars: 15420,
    time: 5400,
    date: "2026-06-01T12:00:00.000Z",
    volume: 3,
    private: false,
    tags: [],
    sessions: [
      {
        id: "sess-r1",
        secs: 2400,
        chars: 8200,
        date: "2026-06-01T12:00:00.000Z"
      },
      {
        id: "sess-r2",
        secs: 1800,
        chars: 4100,
        date: "2026-06-01T12:00:00.000Z"
      },
      {
        id: "sess-r3",
        secs: 1200,
        chars: 3120,
        date: "2026-06-01T12:00:00.000Z"
      }
    ],
    mediaId: "86355",
    mediaData: {
      contentId: "86355",
      contentTitleNative: "転生したらスライムだった件",
      contentTitleEnglish: "That Time I Got Reincarnated as a Slime",
      contentTitleRomaji: "Tensei Shitara Slime Datta Ken",
      contentImage: "https://s4.anilist.co/file/anilistcdn/media/manga/banner/86355-f0kILfzr9zZA.jpg",
      coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/banner/86355-f0kILfzr9zZA.jpg",
      chapters: 168,
      volumes: 23
    },
    originalTitle: "転生したらスライムだった件",
    readerName: "TTU Reader"
  },
  {
    id: "mock-reading-2",
    type: "reading",
    contentTitleNative: "薬屋のひとりごと",
    contentTitleEnglish: "",
    description: "薬屋のひとりごと",
    chars: 3200,
    time: 1800,
    date: "2026-06-01T12:00:00.000Z",
    volume: 1,
    private: false,
    tags: [],
    sessions: [
      {
        id: "sess-r4",
        secs: 1800,
        chars: 3200,
        date: "2026-06-01T12:00:00.000Z"
      }
    ],
    originalTitle: "薬屋のひとりごと",
    readerName: "Yatsu Reader"
  },
  {
    id: "15d604b0-8f53-4c5f-9b09-28e87fc1d25d",
    type: "reading",
    contentTitleNative: "無職転生 ～異世界行ったら本気だす～",
    contentTitleEnglish: "Mushoku Tensei: Jobless Reincarnation",
    originalTitle: "無職転生 ～異世界行ったら本気だす～ 19",
    description: "無職転生 ～異世界行ったら本気だす～",
    chars: 2400,
    time: 12,
    volume: 19,
    date: "2026-06-01T12:00:00.000Z",
    private: false,
    tags: [],
    sessions: [
      {
        id: "f1bdbff4-faaa-4370-a97a-99484e2428a6",
        secs: 1,
        chars: 0,
        date: "2026-06-01T12:00:00.000Z"
      },
      {
        id: "f13cf4d1-8e4b-4e12-bed4-3445d570fca9",
        secs: 8,
        chars: 2400,
        date: "2026-06-01T12:00:00.000Z"
      },
      {
        id: "67c8c5a9-320d-4ac5-aaa4-b7bb716e22cc",
        secs: 3,
        chars: 0,
        date: "2026-06-01T12:00:00.000Z"
      }
    ],
    readerName: "YomiYasu Reader",
    mediaId: "85470",
    mediaData: {
      contentId: "85470",
      contentTitleNative: "無職転生 ～異世界行ったら本気だす～",
      contentTitleEnglish: "Mushoku Tensei: Jobless Reincarnation",
      contentTitleRomaji: "Mushoku Tensei: Isekai Ittara Honki Dasu",
      contentImage: "https://s4.anilist.co/file/anilistcdn/media/manga/banner/85470-akkFSKH9aacB.jpg",
      coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/banner/85470-akkFSKH9aacB.jpg",
      chapters: 334,
      volumes: 26
    }
  },
  {
    id: "e06ce71c-6204-4376-991f-51833d310385",
    type: "reading",
    contentTitleNative: "無職転生 ～異世界行ったら本気だす～",
    contentTitleEnglish: "Mushoku Tensei: Jobless Reincarnation",
    originalTitle: "レーエンデ国物語",
    description: "無職転生 ～異世界行ったら本気だす～",
    chars: 2636,
    time: 1490,
    volume: 1,
    date: "2026-06-01T12:00:00.000Z",
    private: false,
    tags: [],
    sessions: [
      {
        id: "8766550f-0971-4ada-baaa-1b50dea37480",
        secs: 764,
        chars: 1679,
        date: "2026-06-01T12:00:00.000Z"
      },
      {
        id: "54f8662c-5d4f-4ced-9f02-2c3da834510c",
        secs: 6,
        chars: 957,
        date: "2026-06-01T12:00:00.000Z"
      },
      {
        id: "b69a5f8d-7216-495b-9a95-ec64c2b344d5",
        secs: 720,
        chars: 0,
        date: "2026-06-01T12:00:00.000Z"
      }
    ],
    readerName: "TTU Reader",
    mediaId: "85470",
    mediaData: {
      contentId: "85470",
      contentTitleNative: "無職転生 ～異世界行ったら本気だす～",
      contentTitleEnglish: "Mushoku Tensei: Jobless Reincarnation",
      contentTitleRomaji: "Mushoku Tensei: Isekai Ittara Honki Dasu",
      contentImage: "https://s4.anilist.co/file/anilistcdn/media/manga/banner/85470-akkFSKH9aacB.jpg",
      coverImage: "https://s4.anilist.co/file/anilistcdn/media/manga/banner/85470-akkFSKH9aacB.jpg",
      chapters: 334,
      volumes: 26
    }
  }
];

/** Sample Stremio queue items for dev testing */
export const MOCK_STREMIO_QUEUE: QueuedStremioLog[] = [
  {
    id: "mock-stremio-1",
    type: "stremio",
    logType: "anime",
    contentTitleNative: "葬送のフリーレン",
    contentTitleEnglish: "Frieren: Beyond Journey's End",
    contentTitleRomaji: "Sousou no Frieren",
    description: "葬送のフリーレン",
    episodes: 2,
    time: 48,
    date: "2026-06-01T12:00:00.000Z",
    private: false,
    tags: [],
    sessions: [
      {
        id: "sess-s1",
        secs: 1440,
        date: "2026-06-01T12:00:00.000Z",
        season: 1,
        episode: 1,
        traktHistoryId: "trakt-mock-s1",
        episodeTitle: "冒険の終わり"
      },
      {
        id: "sess-s2",
        secs: 1440,
        date: "2026-06-01T12:00:00.000Z",
        season: 1,
        episode: 2,
        traktHistoryId: "trakt-mock-s2",
        episodeTitle: "別に魔法でなくとも..."
      }
    ],
    mediaId: "154587",
    mediaData: {
      contentId: "154587",
      contentTitleNative: "葬送のフリーレン",
      contentTitleEnglish: "Frieren: Beyond Journey's End",
      contentTitleRomaji: "Sousou no Frieren",
      contentImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-n6b6Y62vSuC5.jpg",
      coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-n6b6Y62vSuC5.jpg",
      type: "anime",
      episodes: 28,
      episodeDuration: 24
    },
    traktHistoryId: "trakt-mock-s1",
    traktHistoryIds: ["trakt-mock-s1", "trakt-mock-s2"],
    traktType: "episode"
  }
];
