/**
 * ── Consolidated Global Types ────────────────────────────────────────────────
 * Single source of truth for configurations, data structures, and adapter interfaces.
 */

/* ── Base Configuration ── */
export interface TrackerConfig {
  apiKey?: string;
  autoSend?: boolean;
  logMode?: 'auto' | 'manual';
  thresholdType?: 'percent' | 'time';
  thresholdValue?: number;
  threshold?: number;
  queueThresholdType?: 'percent' | 'time';
  queueThresholdValue?: number;

  /* ── Interface Controls ── */
  hideButtons?: boolean;
  hideIfNotJapanese?: boolean;
  hideMusic?: boolean;
  enablePlaylistLogger?: boolean;
  playlistHideNonJapanese?: boolean;
  hidePlaylistBadgeIcon?: boolean;
  showTotalInBadge?: boolean;
  theme?: string;
  font?: string;

  /* ── Overlay Rules ── */
  trackTime?: boolean;
  overlayPosition?: string;
  allowListOnly?: boolean;
  allowSites?: string[];
  skipSites?: string[];

  /* ── Reader Toggles ── */
  readerAutoSave?: boolean;
  readerDirectSend?: boolean;
  ttuAutoSave?: boolean;
  ttuDirectSend?: boolean;
  ttuEnabled?: boolean;
  yatsuEnabled?: boolean;
  yomiyasuEnabled?: boolean;
  titleRegexes?: Array<{ desc: string; re: string }>;

  /* ── Auto-Send Queue Settings ── */
  autoSendEndOfDay?: boolean;
  warnSendAll?: boolean;
  warnUnmatched?: boolean;
  debugMode?: boolean;

  /* ── Custom Theme Registers ── */
  customThemes?: CustomTheme[];
  customColors?: Record<string, string>;
  ttuThemeOverride?: string;
  ttuThemeOverrideId?: string;
  ttuCustomColors?: Record<string, string>;
  yatsuThemeOverride?: string;
  yatsuThemeOverrideId?: string;
  yatsuCustomColors?: Record<string, string>;
  yomiyasuThemeOverride?: string;
  yomiyasuThemeOverrideId?: string;
  yomiyasuCustomColors?: Record<string, string>;

  // Adaptive branding preferences
  useStaticToolbarIcon?: boolean;
  useStaticInPageLogo?: boolean;
  syncPopupWithReaderTheme?: boolean;
  logMusicVideos?: boolean;

  /* ── Optional Stremio via Trakt integration ── */
  stremioEnabled?: boolean;
  traktClientId?: string;
  traktClientSecret?: string;
  traktAccessToken?: string;
  traktRefreshToken?: string;
  traktExpiresAt?: number;
  traktRefreshBackoffUntil?: number;
  traktUserAgent?: string;
  stremioQueueMode?: 'queue' | 'auto';
  stremioPollMinutes?: number;
  stremioDaysBack?: number;
  stremioJapaneseOnly?: boolean;
  stremioActivatedAt?: string;
}

/* ── Custom Theme Schemas ── */
export interface CustomTheme {
  id: string;
  name: string;
  colors: Record<string, string>;
}

/* ── Queued Immersion Logs ── */
export interface QueueSession {
  id: string;
  secs: number;
  date: string;
  chars?: number;
  season?: number;
  episode?: number;
  traktHistoryId?: string;
  episodeTitle?: string;
}

export interface TTUHistorySession {
  id: string;
  date: string;
  timeMs: number;
  chars: number;
}

export interface TTULinkedBook {
  mediaId: string | number;
  volume?: number;
  mediaData: ReadingMediaData;
}

export interface QueuedVideoLog {
  id: string;
  contentTitleNative: string;
  contentTitleEnglish: string;
  description?: string;
  time: number;
  date: string;
  private: boolean;
  tags: string[];
  sessions: QueueSession[];
  channelId?: string;
  channelTitle?: string;
  mediaId?: string;
  mediaData?: VideoMediaData;
}

export interface QueuedReadingLog {
  id: string;
  type: 'reading';
  contentTitleNative: string;
  contentTitleEnglish?: string;
  description?: string;
  chars: number;
  time: number;
  date: string;
  volume?: number;
  private: boolean;
  tags: string[];
  sessions: QueueSession[];
  mediaId?: string;
  mediaData?: ReadingMediaData;
  originalTitle?: string;
  readerName?: string;
}

export interface QueuedStremioLog {
  id: string;
  type: 'stremio';
  logType: 'anime' | 'movie' | 'tv show';
  contentTitleNative: string;
  contentTitleEnglish?: string;
  contentTitleRomaji?: string;
  description?: string;
  episodes: number;
  time: number;
  date: string;
  private: boolean;
  tags: string[];
  sessions: QueueSession[];
  mediaId?: string;
  mediaData?: AnimeMediaData;
  traktHistoryId: string;
  traktHistoryIds?: string[];
  traktType: 'episode' | 'movie';
  season?: number;
  episode?: number;
}

/* ── Platform Metadata ── */
export interface VideoMediaData {
  channelId?: string;
  channelTitle?: string;
  channelImage?: string;
  channelDescription?: string;
}

export interface ReadingMediaData {
  contentId?: string | number;
  contentTitleNative?: string;
  contentTitleEnglish?: string;
  contentTitleRomaji?: string;
  contentImage?: string;
  coverImage?: string;
  chapters?: number;
  volumes?: number;
}

export interface AnimeMediaData {
  contentId?: string | number;
  contentTitleNative?: string;
  contentTitleEnglish?: string;
  contentTitleRomaji?: string;
  contentImage?: string;
  coverImage?: string;
  description?: unknown;
  type?: string;
  episodes?: number;
  episodeDuration?: number;
  runtime?: number;
  isAdult?: boolean;
}

/* ── Log Submissions ── */
export interface LogPayload {
  type: 'video' | 'reading' | 'anime' | 'movie' | 'tv show';
  mediaId: string | number;
  description: string;
  mediaData?: VideoMediaData | ReadingMediaData | AnimeMediaData;
  time: number;
  date: string;
  private: boolean;
  episodes: number;
  pages: number;
  unknownDate: boolean;
  chars?: number;
  volume?: number;
}

/* ── System Debug Logs ── */
export interface DebugLogEntry {
  level: 'INFO' | 'WARN' | 'ERROR';
  source: string;
  message: string;
  data?: string;
  timestamp: string;
}

/* ── Theme Compilation Colors ── */
export interface UIThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderHover: string;
  text: string;
  muted: string;
  accent: string;
  accentHover: string;
  success: string;
  error: string;
  [key: string]: string;
}

export interface UIThemeTypography {
  mono: string;
  sans: string;
}

export interface UITheme {
  name?: string;
  colors: UIThemeColors;
  typography: UIThemeTypography;
  borderRadius: number;
  borderRadiusSmall: number;
}

/* ── Default System Theme Configuration ── */
export const DEFAULT_THEME: UITheme = {
  name: 'Dark Amber (Default)',
  colors: {
    background: '#07070e',
    surface: '#0d0d1c',
    surfaceAlt: '#10101f',
    border: '#1a2235',
    borderHover: '#222d42',
    text: '#dde4f0',
    muted: '#7a8ca5',
    accent: '#f0b429',
    accentHover: '#ffd060',
    success: '#3ddc84',
    error: '#f0706a',
  },
  typography: {
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    sans: "system-ui, -apple-system, sans-serif",
  },
  borderRadius: 6,
  borderRadiusSmall: 4,
};

/* ── Base Site Adapters ── */
export interface ReaderAdapter {
  readonly name: string;
  readonly hostname: string;
  isEnabled(config: TrackerConfig): boolean;
  findInsertPoint(): { el: Element; pos: InsertPosition } | null;
  extractCharCount(): number | null;
  getTitle(rawTitle?: string): string;
  onUpdateStyles?(wrapper: HTMLElement): void;
  getThemeOverride?(config: TrackerConfig): string | undefined;

  // Category 7 Interface Abstract Queries
  isReadingViewActive(doc: Document): boolean;
  onTick(ttuState: any, stateRefs: any): void;
}

export interface VideoSiteAdapter {
  readonly name: string;
  readonly matchPatterns: string[];
  isEnabled(config: TrackerConfig): boolean;
  getChannelId(): Promise<string | null>;
  getChannelName(): Promise<string>;
  isLikelyJapanese(): boolean;
  isMusic(): boolean;
  getTimestampContainer?(vid: HTMLVideoElement): HTMLElement | null;

  // Category 7 Interface Abstract Queries
  isAdPlaying(doc: Document): boolean;
  getPlaylistContainers(doc: Document): HTMLElement[];
  injectPlaylistButton(container: HTMLElement, btn: HTMLButtonElement): void;
}
