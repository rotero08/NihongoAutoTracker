/**
 * ── Player Tracker Engine ────────────────────────────────────────────────────
 *
 * Encapsulates video tracking states, hardware clock progress accumulations,
 * manual logger inputs, and transaction queues integrations.
 */

import { updateVideoQueueAtomic, videoQueueStorage } from '@/lib/storage/queues';
import { submitLog } from '@/lib/api/nihongotracker';
import { cleanUrl } from '@/lib/utils/url';
import { stripVideoTitle } from '@/lib/utils/text-parsing';
import { getChannelMediaData } from '@/lib/utils/youtube-extraction';
import { addDebugLog } from '@/lib/storage/debug';

export class PlayerTrackerEngine {
    private watchedSecs = 0;
    private completedSessionSecs = 0;
    private lastSyncSecs = 0;
    private lastAutoCheckSecs = 0;
    private playClockStart = -1;
    private currentSessionId = crypto.randomUUID();
    private currentUrl = "";
    private hasTriggered = false;

    constructor(
        private onUpdateBadge: (currentSecs: number, totalSecs: number) => void,
        private onResetSession: () => void,
        private getJapaneseClassification: () => { isJapanese: boolean; isMusic: boolean }
    ) { }

    public getWatchedSecs(): number {
        return this.watchedSecs;
    }

    public getCompletedSessionSecs(): number {
        return this.completedSessionSecs;
    }

    public getLiveWatched(): number {
        return this.watchedSecs + (this.playClockStart >= 0 ? (performance.now() - this.playClockStart) / 1000 : 0);
    }

    public getTotal(): number {
        return this.completedSessionSecs + this.getLiveWatched();
    }

    public getHasTriggered(): boolean {
        return this.hasTriggered;
    }

    public setHasTriggered(val: boolean): void {
        this.hasTriggered = val;
    }

    public flushPlayClock(discard = false): void {
        if (this.playClockStart < 0) return;
        const elapsed = (performance.now() - this.playClockStart) / 1000;
        this.playClockStart = -1;
        if (!discard && elapsed > 0 && elapsed < 7200) {
            this.watchedSecs += elapsed;
        }
    }

    public startPlayClock(): void {
        this.playClockStart = performance.now();
    }

    public initSession(url: string, completedSecs: number): void {
        this.currentUrl = cleanUrl(url);
        this.completedSessionSecs = completedSecs;
        this.watchedSecs = 0;
        this.playClockStart = -1;
        this.lastSyncSecs = 0;
        this.lastAutoCheckSecs = 0;
        this.hasTriggered = false;
        this.currentSessionId = crypto.randomUUID();
    }

    public reset(): void {
        this.flushPlayClock();
        this.watchedSecs = 0;
        this.completedSessionSecs = 0;
        this.lastSyncSecs = 0;
        this.lastAutoCheckSecs = 0;
        this.currentSessionId = crypto.randomUUID();
        this.hasTriggered = false;
    }

    public async upsertQueueLive(
        videoTitle: string,
        channelName: string,
        channelId: string | null
    ): Promise<void> {
        const clean = this.currentUrl;
        const finalTitle = stripVideoTitle(videoTitle);
        const secs = this.getLiveWatched();

        await updateVideoQueueAtomic(async (queue) => {
            const idx = queue.findIndex(q => q.contentTitleEnglish === clean);
            const mediaData = await getChannelMediaData(channelId, channelName);

            if (idx !== -1) {
                const item = queue[idx] as any;
                item.sessions = item.sessions || [];

                const sIdx = item.sessions.findIndex((s: any) => s.id === this.currentSessionId);
                if (sIdx >= 0) {
                    item.sessions[sIdx].secs = secs;
                    item.sessions[sIdx].date = new Date().toISOString();
                } else {
                    item.sessions.push({ id: this.currentSessionId, secs, date: new Date().toISOString() });
                }

                const completedSecs = item.sessions.reduce((a: number, s: any) => a + s.secs, 0);
                item.time = Math.max(1, Math.round(completedSecs / 60));
                item.description = finalTitle;
                item.contentTitleNative = channelName;
                if (channelId && !item.channelId) item.channelId = channelId;
                item.mediaData = { ...(item.mediaData || {}), ...mediaData };
                item.mediaId = item.mediaData?.channelId || channelId || item.mediaId || "web-video";
            } else {
                queue.push({
                    id: crypto.randomUUID(),
                    contentTitleNative: channelName,
                    contentTitleEnglish: clean,
                    time: Math.max(1, Math.round(secs / 60)),
                    date: new Date().toISOString(),
                    private: false,
                    tags: [],
                    description: finalTitle,
                    sessions: [{ id: this.currentSessionId, secs, date: new Date().toISOString() }],
                    channelId,
                    mediaId: mediaData?.channelId || channelId || "web-video",
                    mediaData,
                } as any);
            }
            return queue;
        });

        try {
            const queue = await videoQueueStorage.getValue();
            browser.runtime.sendMessage({ action: 'QUEUE_UPDATED', count: queue.length });
        } catch { }
    }

    public async finalizeSession(url: string): Promise<void> {
        this.flushPlayClock();
        const secs = this.watchedSecs;
        if (secs < 1) return;
        const clean = cleanUrl(url);

        await updateVideoQueueAtomic(async (queue) => {
            const idx = queue.findIndex(q => q.contentTitleEnglish === clean);
            if (idx === -1) return queue;

            const item = queue[idx] as any;
            item.sessions = item.sessions || [];

            const sIdx = item.sessions.findIndex((s: any) => s.id === this.currentSessionId);
            if (sIdx >= 0) {
                item.sessions[sIdx].secs = secs;
            } else {
                item.sessions.push({ id: this.currentSessionId, secs, date: new Date().toISOString() });
            }

            item.time = Math.max(1, Math.round(item.sessions.reduce((a: number, s: any) => a + s.secs, 0) / 60));
            return queue;
        });

        try {
            const queue = await videoQueueStorage.getValue();
            browser.runtime.sendMessage({ action: 'QUEUE_UPDATED', count: queue.length });
        } catch { }
    }

    public reachedQueueThreshold(cfg: any, vid: HTMLVideoElement): boolean {
        const tType = cfg.queueThresholdType ?? 'time';
        const tValue = cfg.queueThresholdValue ?? 1;
        const liveSecs = this.getLiveWatched();
        if (tType === 'percent') {
            if (!vid.duration || vid.duration <= 0) return false;
            return (vid.currentTime / vid.duration) * 100 >= tValue;
        }
        return (liveSecs / 60) >= tValue;
    }

    public async handleTimeUpdate(
        vid: HTMLVideoElement,
        cfg: any,
        channelId: string | null,
        channelName: string,
        videoTitle: string
    ): Promise<void> {
        if (this.playClockStart < 0 && !vid.paused && !vid.ended) {
            this.playClockStart = performance.now();
        }

        const liveSecs = this.getLiveWatched();
        this.onUpdateBadge(liveSecs, this.getTotal());

        if (this.hasTriggered || vid.duration <= 0) return;

        const autoOn = cfg.autoSend ?? (cfg.logMode === 'auto');

        if (!autoOn && this.reachedQueueThreshold(cfg, vid) && (liveSecs - this.lastSyncSecs) >= 10) {
            this.lastSyncSecs = liveSecs;
            const { isJapanese, isMusic } = this.getJapaneseClassification();
            const skipMusic = isMusic && !cfg.logMusicVideos;

            if (isJapanese && !skipMusic) {
                await this.upsertQueueLive(videoTitle, channelName, channelId);
            }
        }

        if (autoOn && (liveSecs - this.lastAutoCheckSecs) >= 5) {
            this.lastAutoCheckSecs = liveSecs;
            const { isJapanese, isMusic } = this.getJapaneseClassification();
            const skipMusic = isMusic && !cfg.logMusicVideos;

            if (isJapanese && !skipMusic) {
                const threshType = cfg.thresholdType ?? 'percent';
                const threshValue = cfg.thresholdValue ?? cfg.threshold ?? 95;
                const triggered = threshType === 'percent'
                    ? (vid.currentTime / vid.duration) * 100 >= threshValue
                    : (liveSecs / 60) >= threshValue;

                if (triggered) {
                    this.hasTriggered = true;
                    const sessionMins = Math.max(1, Math.round(liveSecs / 60));
                    const mediaData = await getChannelMediaData(channelId, channelName);
                    const finalTitle = stripVideoTitle(videoTitle);

                    const ok = await submitLog({
                        type: 'video',
                        mediaId: mediaData.channelId || channelId || "web-video",
                        description: finalTitle,
                        mediaData,
                        time: sessionMins,
                        date: new Date().toISOString(),
                        private: false,
                        episodes: 0,
                        pages: 0,
                        unknownDate: false
                    });

                    if (ok) {
                        await updateVideoQueueAtomic(async (queue) => queue.filter(q => q.contentTitleEnglish !== this.currentUrl));
                        this.onResetSession();
                    } else {
                        this.hasTriggered = false;
                    }
                }
            }
        }
    }
}
