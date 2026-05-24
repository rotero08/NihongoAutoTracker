/**
 * ── Shared Type Definitions ──────────────────────────────────────────────────
 *
 * Central interface/type definitions used across the extension.
 * These provide a single source of truth for data shapes flowing
 * between storage, API, content scripts, popup, and settings.
 */

/* ── Configuration ────────────────────────────────────────────────────────── */

/**
 * Complete tracker configuration persisted in browser.storage.local.
 * Fields are optional because the extension progressively builds the config
 * as the user interacts with settings.
 */
export interface TrackerConfig {
  /** NihongoTracker API key */
  apiKey?: string;

  /* ── Video tracking ────────────────────── */
  /** Whether to auto-send logs (vs. queue them) */
  autoSend?: boolean;
  /** Legacy field: 'auto' | 'manual' */
  logMode?: 'auto' | 'manual';
  /** Threshold type for auto-send: 'percent' | 'time' */
  thresholdType?: 'percent' | 'time';
  /** Threshold value (percent 0-100 or minutes) */
  thresholdValue?: number;
  /** Legacy threshold field */
  threshold?: number;
  /** Queue threshold type: 'percent' | 'time' */
  queueThresholdType?: 'percent' | 'time';
  /** Queue threshold value */
  queueThresholdValue?: number;

  /* ── UI toggles ────────────────────────── */
  /** Hide the video badge/button on all pages */
  hideButtons?: boolean;
  /** Hide badge if content is not detected as Japanese */
  hideIfNotJapanese?: boolean;
  /** Hide badge on music videos */
  hideMusic?: boolean;
  /** Show playlist logger button on YouTube */
  enablePlaylistLogger?: boolean;
  /** Default to hiding non-JP videos in playlist modal */
  playlistHideNonJapanese?: boolean;
  /** Badge display: true = "session / total", false = "session only" */
  showTotalInBadge?: boolean;

  /** Selected UI Theme identifier */
  theme?: string;
  /** Selected Font Family identifier */
  font?: string;

  /* ── Overlay ───────────────────────────── */
  /** Include reading time in context-menu logs */
  trackTime?: boolean;
  /** Overlay position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'hidden' */
  overlayPosition?: string;
  /** Only show overlay on allow-listed sites */
  allowListOnly?: boolean;

  /* ── Site lists ────────────────────────── */
  /** Domains where overlay is always shown */
  allowSites?: string[];
  /** Domains where overlay is never shown */
  skipSites?: string[];

  /* ── Reader settings ───────────────────── */
  /** Auto-sync reader sessions to queue */
  readerAutoSave?: boolean;
  /** Directly send reader logs if media is matched */
  readerDirectSend?: boolean;
  /** Legacy TTU-specific auto-save */
  ttuAutoSave?: boolean;
  /** Legacy TTU-specific direct-send */
  ttuDirectSend?: boolean;
  /** Enable TTU Reader tracking */
  ttuEnabled?: boolean;
  /** Enable Yatsu Reader tracking */
  yatsuEnabled?: boolean;
  /** Enable Manabe Reader tracking */
  manabeEnabled?: boolean;
  /** Custom title/volume regex rules */
  titleRegexes?: Array<{ desc: string; re: string }>;

  /* ── Queue management ──────────────────── */
  /** Auto-send all queued logs at end of day */
  autoSendEndOfDay?: boolean;
  /** Suppress "unmatched media" warning dialog */
  warnUntracked?: boolean;
  /** Suppress "send all" confirmation dialog */
  warnSendAll?: boolean;

  /* ── Debug ─────────────────────────────── */
  /** Enable advanced debug mode (shows debug tab) */
  debugMode?: boolean;
}

/* ── Queue items ──────────────────────────────────────────────────────────── */

/** A single session recorded within a queue item */
export interface QueueSession {
  id: string;
  secs: number;
  date: string;
  chars?: number;
}

/**
 * A video log waiting in the queue to be sent.
 * Created by the video tracker when the user watches enough of a video.
 */
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

/**
 * A reading log waiting in the queue to be sent.
 * Created by reader trackers (TTU, Yatsu, Manabe).
 */
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

/* ── Media data ───────────────────────────────────────────────────────────── */

/** Metadata about a YouTube channel / video source */
export interface VideoMediaData {
  channelId?: string;
  channelTitle?: string;
  channelImage?: string;
  channelDescription?: string;
}

/** Metadata about a reading source (AniList or manual) */
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

/* ── API payloads ─────────────────────────────────────────────────────────── */

/** The shape of a log submission payload to the NT API */
export interface LogPayload {
  type: 'video' | 'reading';
  mediaId: string | number;
  description: string;
  mediaData?: VideoMediaData | ReadingMediaData;
  time: number;
  date: string;
  private: boolean;
  episodes: number;
  pages: number;
  unknownDate: boolean;
  chars?: number;
  volume?: number;
}

/* ── Debug logs ───────────────────────────────────────────────────────────── */

/** A single debug log entry */
export interface DebugLogEntry {
  level: 'INFO' | 'WARN' | 'ERROR';
  source: string;
  message: string;
  data?: string;
  timestamp: string;
}

/* ── TTU-specific types ───────────────────────────────────────────────────── */

/** A linked book in the TTU reader (persisted in storage) */
export interface TTULinkedBook {
  title?: string;
  mediaId: string | number;
  mediaData: ReadingMediaData;
  volume: number;
}

/** A single session entry in the TTU history storage */
export interface TTUHistorySession {
  id: string;
  date: string;
  timeMs: number;
  chars: number;
}

/* ── Theme Definitions ────────────────────────────────────────────────────── */

export interface UIThemeColors {
  bg: string;
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
}

export interface UIThemeTypography {
  mono: string;
  sans: string;
}

export interface UITheme {
  name: string;
  colors: UIThemeColors;
  typography: UIThemeTypography;
  borderRadius: number;
  borderRadiusSmall: number;
}