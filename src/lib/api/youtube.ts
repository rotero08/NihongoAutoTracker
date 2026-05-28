/**
 * ── YouTube Data API Re-exports ──────────────────────────────────────────────
 *
 * This module is preserved for backward compatibility and to prevent breaking
 * imports. It re-exports functionality from youtube-extraction.ts and toast.ts
 * to maintain a single source of truth (SSOT) and eliminate code duplication (DRY).
 */

export {
  fetchYouTubeVideoData,
  getYouTubeChannelId,
  getChannelNameFallback,
} from '@/lib/utils/youtube-extraction';

export { notify } from '@/lib/utils/toast';