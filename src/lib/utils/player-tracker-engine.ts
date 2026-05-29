// START OF FILE player-tracker-engine.ts

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
    private activeVid: HTMLVideoElement | null = null;
    private isUsingVideoTime = false;
    private lastKnownVideoTime = -1;
    private isUserSeeking = false;

    constructor(
        private onUpdateBadge: (currentSecs: number, totalSecs: number) => void,
        private onResetSession: () => void,
        private getJapaneseClassification: () => { isJapanese: boolean; isMusic: boolean }
    ) { }

    public getPlayClockStart(): number {
        return this.playClockStart;
    }

    public getWatchedSecs(): number {
        return this.watchedSecs;
    }

    public getCompletedSessionSecs(): number {
        return this.completedSessionSecs;
    }

    public getIsUserSeeking(): boolean {
        return this.isUserSeeking;
    }

    public clearVideoElement(): void {
        this.activeVid = null;
    }

    public getLiveWatched(currentVidTime?: number): number {
        if (this.playClockStart < 0) {
            return Math.floor(this.watchedSecs);
        }
        const vidTime = currentVidTime !== undefined ? currentVidTime : (this.activeVid && !isNaN(this.activeVid.currentTime) ? this.activeVid.currentTime : NaN);
        if (this.isUsingVideoTime && !isNaN(vidTime)) {
            let referenceVidTime = vidTime;
            if (this.isUserSeeking) {
                referenceVidTime = this.lastKnownVideoTime;
            }

            const baseWatched = Math.floor(this.watchedSecs);
            const currentInt = Math.floor(referenceVidTime);
            const startInt = Math.floor(this.playClockStart);
            const elapsed = currentInt - startInt;

            return baseWatched + (elapsed > 0 ? elapsed : 0);
        } else {
            const elapsed = (performance.now() - this.playClockStart) / 1000;
            return Math.floor(this.watchedSecs + (elapsed > 0 ? elapsed : 0));
        }
    }

    public getTotal(precomputedLiveSecs?: number): number {
        const liveSecs = precomputedLiveSecs !== undefined ? precomputedLiveSecs : this.getLiveWatched();
        return this.completedSessionSecs + liveSecs;
    }

    public getHasTriggered(): boolean {
        return this.hasTriggered;
    }

    public setHasTriggered(val: boolean): void {
        this.hasTriggered = val;
    }

    public getLastSyncSecs(): number {
        return this.lastSyncSecs;
    }

    public flushPlayClock(discard = false): void {
        if (this.playClockStart < 0) return;
        let elapsed = 0;
        if (this.isUsingVideoTime && this.activeVid && !isNaN(this.activeVid.currentTime)) {
            const currentVidTime = this.activeVid.currentTime;
            if (this.isUserSeeking) {
                elapsed = this.lastKnownVideoTime - this.playClockStart;
            } else {
                elapsed = currentVidTime - this.playClockStart;
            }
        } else {
            elapsed = (performance.now() - this.playClockStart) / 1000;
        }
        this.playClockStart = -1;
        this.isUsingVideoTime = false;
        if (!discard && elapsed > 0 && elapsed < 7200) {
            this.watchedSecs += elapsed;
        }
    }

    public startPlayClock(vid?: HTMLVideoElement | null): void {
        if (vid) {
            this.activeVid = vid;
        }
        if (this.activeVid && !isNaN(this.activeVid.currentTime)) {
            this.isUsingVideoTime = true;
            if (this.watchedSecs === 0 && this.activeVid.currentTime < 5.0) {
                this.playClockStart = 0.0;
            } else {
                this.playClockStart = this.activeVid.currentTime;
            }
            this.lastKnownVideoTime = this.activeVid.currentTime;
        } else {
            this.isUsingVideoTime = false;
            this.playClockStart = performance.now();
        }
    }

    public updateBadgeLive(vid: HTMLVideoElement): void {
        if (this.isUserSeeking) {
            return;
        }
        if (this.playClockStart < 0 && !vid.paused && !vid.ended) {
            this.startPlayClock(vid);
        }

        let currentVidTime = NaN;
        if (this.activeVid && !isNaN(this.activeVid.currentTime)) {
            currentVidTime = this.activeVid.currentTime;

            // Delta progression guard to handle out-of-order timeupdate events or micro-seeks
            if (this.lastKnownVideoTime !== -1 && !this.isUserSeeking) {
                const delta = currentVidTime - this.lastKnownVideoTime;
                if (delta > 10 || delta < -3) {
                    if (this.playClockStart >= 0) {
                        const elapsedBeforeSkip = this.lastKnownVideoTime - this.playClockStart;
                        if (elapsedBeforeSkip > 0 && elapsedBeforeSkip < 7200) {
                            this.watchedSecs += elapsedBeforeSkip;
                        }
                    }
                    this.playClockStart = currentVidTime;
                }
            }
            this.lastKnownVideoTime = currentVidTime;
        }

        const liveSecs = this.getLiveWatched(currentVidTime);
        this.onUpdateBadge(liveSecs, this.getTotal(liveSecs));
    }

    public handleSeeking(): void {
        this.isUserSeeking = true;
        if (this.playClockStart >= 0 && this.activeVid && !isNaN(this.activeVid.currentTime)) {
            const elapsedBeforeSkip = this.lastKnownVideoTime - this.playClockStart;
            if (elapsedBeforeSkip > 0 && elapsedBeforeSkip < 7200) {
                this.watchedSecs += elapsedBeforeSkip;
            }
        }
        this.playClockStart = -1;
    }

    public handleSeeked(vid: HTMLVideoElement): void {
        this.isUserSeeking = false;
        this.activeVid = vid;
        if (!isNaN(vid.currentTime)) {
            this.playClockStart = vid.currentTime;
            this.lastKnownVideoTime = vid.currentTime;
            this.isUsingVideoTime = true;
        }
    }

    public initSession(url: string, completedSecs: number, vid?: HTMLVideoElement | null): void {
        this.currentUrl = cleanUrl(url);
        this.completedSessionSecs = completedSecs;
        this.watchedSecs = 0;
        this.playClockStart = -1;
        this.lastSyncSecs = 0;
        this.lastAutoCheckSecs = 0;
        this.hasTriggered = false;
        this.currentSessionId = crypto.randomUUID();
        this.lastKnownVideoTime = -1;
        this.isUserSeeking = false;
        if (vid) {
            this.activeVid = vid;
        }
    }

    public reset(): void {
        this.flushPlayClock();
        this.watchedSecs = 0;
        this.completedSessionSecs = 0;
        this.lastSyncSecs = 0;
        this.lastAutoCheckSecs = 0;
        this.currentSessionId = crypto.randomUUID();
        this.hasTriggered = false;
        this.activeVid = null;
        this.isUsingVideoTime = false;
        this.lastKnownVideoTime = -1;
        this.isUserSeeking = false;
    }

    public async upsertQueueLive(
        videoTitle: string,
        channelName: string,
        channelId: string | null
    ): Promise<void> {
        const clean = this.currentUrl;
        const finalTitle = stripVideoTitle(videoTitle);
        const secs = this.getLiveWatched();

        const mediaData = await getChannelMediaData(channelId, channelName);

        await updateVideoQueueAtomic(async (queue) => {
            const idx = queue.findIndex(q => q.contentTitleEnglish === clean);

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
                if (channelId && channelId !== "web-video" && (!item.channelId || item.channelId === "web-video")) {
                    item.channelId = channelId;
                }
                item.mediaData = { ...(item.mediaData || {}), ...mediaData };
                const possibleMediaId = item.mediaData?.channelId || channelId || item.mediaId;
                item.mediaId = (possibleMediaId && possibleMediaId !== "web-video") ? possibleMediaId : "web-video";
            } else {
                // First automatic queue addition boundary - log persistently in RAM
                await addDebugLog('INFO', 'VideoTracker', `Automatically queued video: ${finalTitle}`);
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
                    channelId: (channelId && channelId !== "web-video") ? channelId : null,
                    mediaId: (mediaData?.channelId && mediaData.channelId !== "web-video") ? mediaData.channelId : (channelId && channelId !== "web-video") ? channelId : "web-video",
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
        if (vid.duration === Infinity) {
            // For live video streams, percentage-based thresholds are mathematically meaningless.
            // If the threshold type is percent, we fall back to a sensible time-based default (1 minute).
            const thresholdMins = tType === 'percent' ? 1 : tValue;
            return (liveSecs / 60) >= thresholdMins;
        }
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
        try {
            this.updateBadgeLive(vid);

            const liveSecs = this.getLiveWatched();

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
                    const isLive = vid.duration === Infinity;
                    const triggered = isLive
                        ? (liveSecs / 60) >= (threshType === 'percent' ? 5 : threshValue)
                        : (threshType === 'percent'
                            ? (vid.currentTime / vid.duration) * 100 >= threshValue
                            : (liveSecs / 60) >= threshValue);

                    if (triggered) {
                        this.hasTriggered = true;
                        const sessionMins = Math.max(1, Math.round(liveSecs / 60));
                        const mediaData = await getChannelMediaData(channelId, channelName);
                        const finalTitle = stripVideoTitle(videoTitle);

                        if (import.meta.env.DEV) {
                            console.log(`[NAT DEV - VideoTracker] Auto-logging threshold reached for: ${finalTitle}`);
                        }

                        const ok = await submitLog({
                            type: 'video',
                            mediaId: (mediaData.channelId && mediaData.channelId !== "web-video") ? mediaData.channelId : (channelId && channelId !== "web-video") ? channelId : "web-video",
                            description: finalTitle,
                            mediaData,
                            time: sessionMins,
                            date: new Date().toISOString(),
                            private: false,
                            episodes: 0,
                            pages: 0,
                            unknownDate: false
                        });

                        if (ok?.success) {
                            await addDebugLog('INFO', 'VideoTracker', `Auto-logged video successfully: ${finalTitle}`);
                            await updateVideoQueueAtomic(async (queue) => queue.filter(q => q.contentTitleEnglish !== this.currentUrl));
                            this.onResetSession();
                        } else {
                            this.hasTriggered = false;
                            await addDebugLog('ERROR', 'VideoTracker', `Auto-log failed for: ${finalTitle}`, ok?.error);
                        }
                    }
                }
            }
        } catch (err) {
            await addDebugLog('ERROR', 'VideoTracker', 'Exception encountered inside timeupdate tick', err);
            if (import.meta.env.DEV) {
                console.error(`[NAT DEV - VideoTracker] handleTimeUpdate critical exception:`, err);
            }
        }
    }
}