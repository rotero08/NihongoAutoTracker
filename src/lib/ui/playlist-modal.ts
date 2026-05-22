/**
 * ── Playlist Modal Helpers ──────────────────────────────────────────────────
 *
 * Shared DOM construction helpers for the YouTube playlist logger modal.
 * The playlist logger scans a YouTube playlist page, shows all videos with
 * checkboxes, and lets the user bulk-log watched time.
 *
 * Extracted from video-tracker.content.ts to keep the content script
 * focused on tracking logic rather than UI construction.
 *
 * The modal uses CSS classes defined in `video-modal.ts` (injected via
 * `injectModalStyles()`), so that file must be called first.
 *
 * ── Future Extensibility ──
 * Pass a UITheme to customize the playlist modal appearance per-site.
 */

import type { UITheme } from './types';
import { DEFAULT_THEME } from './types';

/** A single video entry extracted from a YouTube playlist */
export interface PlaylistVideoEntry {
  /** Video title */
  title: string;
  /** Video URL */
  url: string;
  /** Duration in minutes (0 if unknown) */
  durationMins: number;
  /** Whether this video appears to be Japanese content */
  isJapanese: boolean;
  /** Thumbnail URL */
  thumbnail?: string;
}

/**
 * Generate the HTML for a single video row in the playlist modal.
 *
 * @param video - The video entry data
 * @param index - Index in the playlist (for unique IDs)
 * @param checked - Whether the checkbox should be checked by default
 * @param theme - Optional theme override
 * @returns HTML string for the video row
 */
export function createPlaylistVideoRowHTML(
  video: PlaylistVideoEntry,
  index: number,
  checked: boolean,
  theme: UITheme = DEFAULT_THEME,
): string {
  const c = theme.colors;
  const escapedTitle = video.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `
    <div class="pl-vid-row" style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid ${c.border};" data-url="${video.url}" data-title="${escapedTitle}" data-mins="${video.durationMins}">
      <input type="checkbox" class="nt-pl-chk nt-pl-video-chk" data-idx="${index}" ${checked ? 'checked' : ''} />
      <div style="flex:1; min-width:0;">
        <div class="pl-scroll-title" style="font-size:12px; color:${c.text}; white-space:nowrap; overflow-x:auto; cursor:text;">${escapedTitle}</div>
        <div style="font-size:10px; color:${c.muted}; margin-top:2px;">${video.durationMins > 0 ? video.durationMins + ' min' : 'Unknown duration'}</div>
      </div>
    </div>
  `;
}

/**
 * Generate the header section HTML for the playlist modal.
 *
 * @param logoHtml - Inline SVG logo HTML
 * @param videoCount - Total number of videos in the playlist
 * @param theme - Optional theme override
 * @returns HTML string for the modal header
 */
export function createPlaylistHeaderHTML(
  logoHtml: string,
  videoCount: number,
  _theme: UITheme = DEFAULT_THEME,
): string {
  return `
    <div class="nt-modal-header" style="margin-bottom:16px;">
      <div class="nt-logo-sq">${logoHtml}</div>
      <div class="nt-title-area">
        <span class="nt-brand-name">Playlist Logger</span>
        <span class="nt-badge">${videoCount} videos</span>
      </div>
    </div>
  `;
}
