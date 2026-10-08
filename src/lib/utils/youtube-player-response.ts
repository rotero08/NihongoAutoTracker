/**
 * ── YouTube Player Snapshot Bridge ───────────────────────────────────────────
 *
 * YouTube's player data lives in the page's MAIN world, out of reach of isolated
 * content scripts. `youtube-player-inject.content.ts` publishes a small, flat
 * snapshot of it on a DOM attribute; this module is the single reader.
 *
 * The snapshot is the only per-video source that can be proven fresh across SPA
 * navigations: every read is validated against the video id in the URL, and the
 * MAIN world is asked to republish whenever the two disagree.
 */

export const PLAYER_SNAPSHOT_ATTR = 'data-nat-player-snapshot';
export const PLAYER_SNAPSHOT_REQUEST_EVENT = 'nat-request-player-snapshot';

/** Descriptions are only sampled for language detection, so the bridge truncates them. */
export const PLAYER_SNAPSHOT_DESCRIPTION_LIMIT = 1500;

export interface YouTubeCaptionTrack {
  languageCode: string;
  /** "asr" for YouTube's auto-generated track, empty for uploaded tracks. */
  kind: string;
}

export interface YouTubePlayerSnapshot {
  videoId: string;
  title: string;
  author: string;
  channelId: string;
  description: string;
  /** Microformat category ("Music", "Gaming", …). Not localised by YouTube. */
  category: string;
  isLiveNow: boolean;
  captionTracks: YouTubeCaptionTrack[];
  /** Language of the default audio track; only present on multi-audio uploads. */
  defaultAudioLanguage: string;
}

/**
 * Extract the video id from a YouTube URL (`/watch?v=`, `/live/`, `/embed/`,
 * `/shorts/`, `youtu.be/`). Returns null for pages that are not a single video.
 */
export function getYouTubeVideoId(url: string = window.location.href): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.split('/').filter(Boolean)[0] || null;
    }
    const fromQuery = parsed.searchParams.get('v');
    if (fromQuery) return fromQuery;

    const fromPath = parsed.pathname.match(/^\/(?:live|embed|shorts|v)\/([\w-]{6,})/);
    return fromPath ? fromPath[1] : null;
  } catch {
    return null;
  }
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The attribute is written by page-world code, so it is validated like any untrusted input. */
function parseSnapshot(raw: string): YouTubePlayerSnapshot | null {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const videoId = asString(data.videoId);
  if (!videoId) return null;

  const captionTracks: YouTubeCaptionTrack[] = Array.isArray(data.captionTracks)
    ? data.captionTracks
      .filter((track: unknown) => track && typeof track === 'object')
      .map((track: any) => ({ languageCode: asString(track.languageCode), kind: asString(track.kind) }))
    : [];

  return {
    videoId,
    title: asString(data.title),
    author: asString(data.author),
    channelId: asString(data.channelId),
    description: asString(data.description),
    category: asString(data.category),
    isLiveNow: data.isLiveNow === true,
    captionTracks,
    defaultAudioLanguage: asString(data.defaultAudioLanguage),
  };
}

let lastRaw: string | null = null;
let lastParsed: YouTubePlayerSnapshot | null = null;

function readSnapshot(): YouTubePlayerSnapshot | null {
  const raw = document.documentElement.getAttribute(PLAYER_SNAPSHOT_ATTR);
  if (!raw) return null;
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastParsed = parseSnapshot(raw);
  }
  return lastParsed;
}

/**
 * Player data for the video currently in the URL, or null when it cannot be
 * confirmed to belong to that video (the caller must then treat the video as
 * unknown rather than fall back to whatever is on screen).
 *
 * Pass `null` on pages whose URL carries no video id (miniplayer, YouTube
 * Music browsing): the freshest snapshot is returned unvalidated.
 */
export function getPlayerSnapshot(
  videoId: string | null = getYouTubeVideoId(),
): YouTubePlayerSnapshot | null {
  if (typeof document === 'undefined') return null;

  let snapshot = readSnapshot();
  if (!snapshot || !videoId || snapshot.videoId !== videoId) {
    // Synchronous round-trip: the MAIN-world listener rewrites the attribute
    // before dispatchEvent returns.
    window.dispatchEvent(new CustomEvent(PLAYER_SNAPSHOT_REQUEST_EVENT));
    snapshot = readSnapshot();
  }

  if (!snapshot) return null;
  if (videoId && snapshot.videoId !== videoId) return null;
  return snapshot;
}
