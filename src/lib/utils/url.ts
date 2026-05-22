/**
 * ── URL Utilities ────────────────────────────────────────────────────────────
 *
 * URL normalization helpers shared between the video tracker and queue management.
 * Ensures consistent URL comparison by stripping unnecessary parameters.
 */

/**
 * Normalize a URL for consistent comparison.
 *
 * For YouTube URLs, extracts just the video ID to create a canonical form:
 *   "https://www.youtube.com/watch?v=abc123&list=xyz" → "https://www.youtube.com/watch?v=abc123"
 *
 * For all other URLs, strips query parameters and hash:
 *   "https://example.com/page?ref=123" → "https://example.com/page"
 *
 * @param url - The raw URL to clean
 * @returns A normalized URL string suitable for comparison
 */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      const v = u.searchParams.get('v');
      if (v) {
        return `https://www.youtube.com/watch?v=${v}`;
      }
    }
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}
