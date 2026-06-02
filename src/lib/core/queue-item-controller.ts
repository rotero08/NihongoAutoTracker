/**
 * ── Queue Item Stateful Controller ──────────────────────────────────────────
 * Encapsulates transactional state and synchronization routines for queue items.
 * Uses the Svelte 5 .svelte.ts extension to compile reactive runes correctly.
 */

import { submitLog, resolveVideoChannelMedia } from '@/lib/api/nihongotracker';
import { stripVideoTitle } from '@/lib/utils/text-parsing';
import { addDebugLog } from '@/lib/storage/debug';
import { configStorage } from '@/lib/storage/config';
import {
  updateReadingQueueAtomic,
  updateVideoQueueAtomic,
  updateStremioQueueAtomic,
  stremioProcessedStorage
} from '@/lib/storage/queues';
import type { ReadingMediaData } from '@/lib/types';

export class QueueItemController {
  // Svelte 5 reactive states compiled via .svelte.ts
  public sending = $state(false);
  public isUnlinkHovered = $state(false);
  public titleValue = $state("");
  public isEditingVol = $state(false);
  public volInputValue = $state(1);

  constructor(
    private getItem: () => any,
    private getType: () => "video" | "reading" | "stremio",
    private onStatusMessage: (msg: string, err?: boolean) => void,
    private onConfirm: (title: string, msg: string, warnKey?: string) => Promise<boolean>,
    private onRefresh: () => void
  ) {
    const rawTitle = this.item.description || this.item.contentTitleNative || "Unknown Title";
    this.titleValue = this.type === "stremio"
      ? this.item.contentTitleNative || this.item.contentTitleRomaji || this.item.contentTitleEnglish || rawTitle.replace(/^(Trakt|Stremio):\s*/, "")
      : this.type === "video" ? stripVideoTitle(rawTitle) : rawTitle.replace(/^(Trakt|Stremio):\s*/, "");
  }

  // Reactive prop getters
  get item() {
    return this.getItem();
  }

  get type() {
    return this.getType();
  }

  private getUpdater() {
    if (this.type === "reading") return updateReadingQueueAtomic;
    if (this.type === "stremio") return updateStremioQueueAtomic;
    return updateVideoQueueAtomic;
  }

  public async persistField(field: string, value: any) {
    const updater = this.getUpdater();
    await updater((queue: any[]) => {
      const idx = queue.findIndex((x) => x.id === this.item.id);
      if (idx > -1) {
        const nextQueue = [...queue];
        nextQueue[idx] = { ...nextQueue[idx], [field]: value };
        return nextQueue;
      }
      return queue;
    });
    this.onRefresh();
  }

  public async handleUnlink() {
    const updater = this.getUpdater();
    await updater((queue: any[]) => {
      const idx = queue.findIndex((x) => x.id === this.item.id);
      if (idx > -1) {
        const nextQueue = [...queue];
        nextQueue[idx] = {
          ...nextQueue[idx],
          mediaId: this.type === "reading" ? "web-reading" : undefined,
          mediaData: undefined,
        };
        return nextQueue;
      }
      return queue;
    });
    this.onRefresh();
    this.onStatusMessage("✓ Match unlinked");
  }

  public async handleSend() {
    this.sending = true;
    const config = await configStorage.getValue();

    if (this.type === "reading" && (!this.item.mediaId || this.item.mediaId === "web-reading")) {
      if (config.warnUnmatched !== false) {
        const proceed = await this.onConfirm(
          "Unmatched Media Warning",
          "This reading log is not linked to any AniList entry and will be logged as unmatched. Are you sure you want to proceed?",
          "warnUnmatched"
        );
        if (!proceed) {
          this.sending = false;
          return;
        }
      }
    }

    if (this.type === "video") {
      try {
        await this.ensureVideoMediaData();
      } catch (e) {}
    }

    const payloads = this.buildPayloads();
    let success = true;
    let lastError = "";

    for (const payload of payloads) {
      const result = await submitLog(payload);
      if (!result?.success) {
        success = false;
        lastError = result?.error || "Unknown error";
        await addDebugLog("ERROR", "QueueItemController", `Manual log failed: ${payload.description}`, lastError);
      }
    }

    if (success) {
      const updater = this.getUpdater();
      await updater((queue: any[]) => queue.filter((x) => x.id !== this.item.id));
      this.onRefresh();
    } else {
      this.sending = false;
      this.onStatusMessage(`⚠ Failed: ${lastError}`, true);
    }
  }

  public async handleDelete() {
    const proceed = await this.onConfirm("Delete Log", "Are you sure you want to delete this pending log?");
    if (!proceed) return;

    const updater = this.getUpdater();
    await updater((queue: any[]) => queue.filter((x) => x.id !== this.item.id));
    if (this.type === "stremio") {
      await this.markStremioProcessed();
    }
    this.onStatusMessage("✓ Log removed");
    this.onRefresh();
  }

  public async handleSearchSelect(result: any) {
    const native = result.title?.contentTitleNative || result.contentTitleNative || "Unknown";
    this.titleValue = native;

    const updater = this.getUpdater();
    await updater((queue: any[]) => {
      const idx = queue.findIndex((x) => x.id === this.item.id);
      if (idx > -1) {
        const nextQueue = [...queue];
        nextQueue[idx] = {
          ...nextQueue[idx],
          description: native,
          contentTitleNative: native,
          contentTitleEnglish: result.title?.contentTitleEnglish || result.contentTitleEnglish || nextQueue[idx].contentTitleEnglish,
          contentTitleRomaji: result.title?.contentTitleRomaji || result.contentTitleRomaji || nextQueue[idx].contentTitleRomaji,
          mediaId: String(result.contentId),
          mediaData: {
            contentId: result.contentId,
            contentTitleNative: native,
            contentTitleEnglish: result.title?.contentTitleEnglish || result.contentTitleEnglish || undefined,
            contentTitleRomaji: result.title?.contentTitleRomaji || result.contentTitleRomaji || undefined,
            contentImage: result.coverImage || result.contentImage || undefined,
            coverImage: result.coverImage || result.contentImage || undefined,
            chapters: result.chapters || undefined,
            volumes: result.volumes || undefined,
          },
        };
        return nextQueue;
      }
      return queue;
    });
    this.onRefresh();
  }

  private async ensureVideoMediaData() {
    const channelId = this.item.channelId || this.item.mediaData?.channelId;
    const channelTitle = this.item.mediaData?.channelTitle || this.item.channelTitle || this.item.contentTitleNative;
    if (this.item.mediaData?.channelImage && this.item.mediaData?.channelDescription) return;
    if (!channelId && !channelTitle) return;
    const media = await resolveVideoChannelMedia({ channelId, channelTitle });
    this.item.mediaData = {
      ...(this.item.mediaData || {}),
      channelId: media.channelId || channelId || "web-video",
      channelTitle: media.channelTitle || channelTitle || this.item.contentTitleNative,
      ...(media.channelImage ? { channelImage: media.channelImage } : {}),
      ...(media.channelDescription ? { channelDescription: media.channelDescription } : {}),
    };
  }

  private async markStremioProcessed() {
    const processed = new Set(await stremioProcessedStorage.getValue());
    for (const historyId of [this.item.traktHistoryId, ...(this.item.traktHistoryIds ?? [])]) {
      if (historyId) processed.add(String(historyId));
    }
    await stremioProcessedStorage.setValue([...processed].slice(-5000));
  }

  private buildPayloads(): any[] {
    const rawTitle = this.item.description || this.item.contentTitleNative || "Unknown Title";
    const desc = this.type === "stremio"
      ? this.item.mediaData?.contentTitleNative || this.item.contentTitleNative || this.titleValue
      : this.titleValue || (this.type === "reading" ? this.item.mediaData?.contentTitleNative || this.item.contentTitleNative : this.item.contentTitleNative);
    const apiTitle = this.type === "video" ? stripVideoTitle(desc) : desc;

    const base: any = {
      type: this.type === "stremio" ? this.item.logType || "anime" : this.type,
      description: apiTitle,
      episodes: this.type === "stremio" ? 1 : 0,
      pages: 0,
      unknownDate: false,
      private: false,
    };

    if (this.type === "reading") {
      base.mediaId = this.item.mediaId || "web-reading";
      base.volume = Math.max(1, Number(this.item.volume || 1));
      base.mediaData = this.item.mediaData || {
        contentId: "web-reading",
        contentTitleNative: this.item.contentTitleNative,
      };
    } else if (this.type === "stremio") {
      base.mediaId = this.item.mediaId || this.item.mediaData?.contentId || `trakt:${this.item.traktHistoryId}`;
      base.mediaData = this.item.mediaData || {
        contentId: base.mediaId,
        contentTitleNative: this.item.contentTitleNative,
        contentTitleEnglish: this.item.contentTitleEnglish,
        contentTitleRomaji: this.item.contentTitleRomaji,
        type: this.item.logType || "anime",
      };
    } else {
      base.mediaId = this.item.mediaData?.channelId || this.item.channelId || "web-video";
      base.mediaData = this.item.mediaData || {
        channelId: this.item.channelId || "web-video",
        channelTitle: this.item.contentTitleNative,
      };
    }

    const sessions = this.item.sessions ?? [];
    if (this.type === "stremio" && sessions.length > 1) {
      return sessions.map((session: any) => ({
        ...base,
        time: Math.max(1, Math.round((session.secs || 0) / 60)),
        date: new Date(session.date).toISOString(),
        chars: 0,
      }));
    }

    const defaultDateStr = sessions.length > 0 ? sessions[0].date : this.item.date || new Date().toISOString();
    return [{
      ...base,
      time: this.type === "reading" ? Math.max(1, Math.round((this.item.time || 0) / 60)) : this.item.time || 0,
      date: new Date(defaultDateStr).toISOString(),
      chars: this.type === "reading" ? this.item.chars || 0 : 0,
    }];
  }
}
