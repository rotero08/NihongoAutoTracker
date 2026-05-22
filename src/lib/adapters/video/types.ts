/**
 * ── Video Site Adapter Interface ─────────────────────────────────────────────
 * Contract for video site adapters (YouTube, future: Netflix, Crunchyroll).
 */
import type { TrackerConfig } from '../../types';

export interface VideoSiteAdapter {
  readonly name: string;
  readonly matchPatterns: string[];
  isEnabled(config: TrackerConfig): boolean;
  getChannelId(): Promise<string | null>;
  getChannelName(): Promise<string>;
  isLikelyJapanese(): boolean;
  isMusic(): boolean;
}
