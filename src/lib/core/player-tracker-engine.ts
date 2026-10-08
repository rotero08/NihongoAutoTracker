/**
 * ── Player Tracker Engine ────────────────────────────────────────────────────
 *
 * Encapsulates video tracking states, hardware clock progress accumulations,
 * manual logger inputs, and transaction queues integrations.
 */

import { submitLog } from '@/lib/api/nihongotracker';
import { addDebugLog } from '@/lib/storage/debug';
import { updateVideoQueueAtomic } from '@/lib/storage/queues';
import type { QueuedVideoLog, TrackerConfig } from '@/lib/types';
import { stripVideoTitle } from '@/lib/utils/text-parsing';
import { cleanUrl } from '@/lib/utils/url';
import {
    getAutoSendThreshold,
    getQueueThreshold,
    hasReachedThreshold,
    isAutoSendEnabled,
} from '@/lib/utils/video-thresholds';
import { getChannelMediaData, pickChannelId, WEB_VIDEO_ID } from '@/lib/utils/youtube-extraction';
import { browser } from 'wxt/browser';

export interface VideoClassification {
    isJapanese: boolean;
    isMusic: boolean;
    isLive: boolean;
}

/** Seconds of new watch time between two writes of a queued session. */
const QUEUE_SYNC_INTERVAL_SECS = 10;
/** Seconds of new watch time between two direct-send threshold checks. */
const AUTO_SEND_CHECK_INTERVAL_SECS = 5;
/** Longest uninterrupted stretch accepted from the wall clock (it keeps running through system sleep). */
const MAX_WALL_CLOCK_SEGMENT_SECS = 7200;

const sessionMinutes = (secs: number) => Math.max(1, Math.round(secs / 60));
const sumSessionSecs = (item: QueuedVideoLog) => (item.sessions || []).reduce((total, s) => total + s.secs, 0);

export class PlayerTrackerEngine {
    private watchedSecs = 0;
    private completedSessionSecs = 0;
    private lastSyncSecs = 0;
    private lastAutoCheckSecs = 0;
    private currentSessionId = crypto.randomUUID();
    private currentUrl = "";
    private hasTriggered = false;
    private activeVid: HTMLVideoElement | null = null;
    private isUserSeeking = false;

    /*
     * The play clock measures the stretch being watched right now.
     * `playClockStart` is -1 while stopped. While running it is either a video
     * position (`isUsingVideoTime`) or a `performance.now()` timestamp — never
     * compare one against the other: the two bases differ by the age of the tab.
     */
    private playClockStart = -1;
    private isUsingVideoTime = false;
    private lastKnownVideoTime = -1;

    constructor(
        private onUpdateBadge: (currentSecs: number, totalSecs: number) => void,
        private onResetSession: () => void,
        /** `fresh` bypasses any caching: used right before a queue/send decision. */
        private classify: (fresh: boolean) => VideoClassification
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

    public setCompletedSessionSecs(secs: number): void {
        this.completedSessionSecs = secs;
    }

    public getIsUserSeeking(): boolean {
        return this.isUserSeeking;
    }

    public clearVideoElement(): void {
        this.flushPlayClock();
        this.activeVid = null;
    }

    private readVideoTime(): number {
        const time = this.activeVid?.currentTime;
        return typeof time === 'number' && Number.isFinite(time) ? time : NaN;
    }

    private anchorToVideoTime(start: number, current: number = start): void {
        this.isUsingVideoTime = true;
        this.playClockStart = start;
        this.lastKnownVideoTime = current;
    }

    private stopClock(): void {
        this.playClockStart = -1;
        this.isUsingVideoTime = false;
    }

    /** End of the running stretch, in the clock's own base (video mode only). */
    private resolveVideoEnd(preferred: number): number {
        // While seeking, or once the element was handed another source (ad
        // break, next video), the live position is not part of this stretch.
        if (this.isUserSeeking || Number.isNaN(preferred) || preferred < this.playClockStart) {
            return this.lastKnownVideoTime;
        }
        return preferred;
    }

    /** Seconds on the running clock, measured up to `videoEnd` in video mode. */
    private measureElapsed(videoEnd: number = this.readVideoTime()): number {
        if (this.playClockStart < 0) return 0;
        if (this.isUsingVideoTime) {
            const elapsed = this.resolveVideoEnd(videoEnd) - this.playClockStart;
            return elapsed > 0 ? elapsed : 0;
        }
        const elapsed = (performance.now() - this.playClockStart) / 1000;
        return elapsed > 0 && elapsed < MAX_WALL_CLOCK_SEGMENT_SECS ? elapsed : 0;
    }

    public getLiveWatched(currentVidTime?: number): number {
        if (this.playClockStart < 0) {
            return Math.floor(this.watchedSecs);
        }
        if (this.isUsingVideoTime) {
            const reference = this.resolveVideoEnd(currentVidTime ?? this.readVideoTime());
            const elapsed = Math.floor(reference) - Math.floor(this.playClockStart);
            return Math.floor(this.watchedSecs) + (elapsed > 0 ? elapsed : 0);
        }
        return Math.floor(this.watchedSecs + this.measureElapsed());
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
        const elapsed = this.measureElapsed();
        this.stopClock();
        if (!discard) {
            this.watchedSecs += elapsed;
        }
    }

    /**
     * Something else took over the element (an ad break, a new source): bank the
     * content watched up to the last position seen and stop counting. Positions
     * reported from here on belong to different media, so the last known one is
     * forgotten rather than compared against.
     */
    public interruptPlayback(): void {
        if (this.playClockStart >= 0) {
            this.watchedSecs += this.measureElapsed(this.lastKnownVideoTime);
            this.stopClock();
        }
        this.lastKnownVideoTime = -1;
        this.isUserSeeking = false;
    }

    public startPlayClock(vid?: HTMLVideoElement | null): void {
        if (vid) {
            this.activeVid = vid;
        }
        const now = this.readVideoTime();
        if (!Number.isNaN(now)) {
            // A session that starts within the opening seconds counts from zero.
            this.anchorToVideoTime(this.watchedSecs === 0 && now < 5.0 ? 0.0 : now, now);
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

        const currentVidTime = this.readVideoTime();
        if (!Number.isNaN(currentVidTime)) {
            // Jump without seek events (micro-seek, out-of-order timeupdate): bank
            // what was watched up to the jump and re-anchor. Only a running clock
            // is re-anchored — a stopped one stays stopped until playback resumes.
            if (this.isUsingVideoTime && this.playClockStart >= 0 && this.lastKnownVideoTime >= 0) {
                const delta = currentVidTime - this.lastKnownVideoTime;
                if (delta > 10 || delta < -3) {
                    this.watchedSecs += this.measureElapsed(this.lastKnownVideoTime);
                    this.anchorToVideoTime(currentVidTime);
                }
            }
            this.lastKnownVideoTime = currentVidTime;
        }

        const liveSecs = this.getLiveWatched(currentVidTime);
        this.onUpdateBadge(liveSecs, this.getTotal(liveSecs));
    }

    public handleSeeking(): void {
        if (this.playClockStart >= 0) {
            this.watchedSecs += this.measureElapsed(this.lastKnownVideoTime);
        }
        this.stopClock();
        this.isUserSeeking = true;
    }

    public handleSeeked(vid: HTMLVideoElement): void {
        this.isUserSeeking = false;
        this.activeVid = vid;
        const now = this.readVideoTime();
        if (Number.isNaN(now)) return;

        if (vid.paused || vid.ended) {
            // Scrubbing while paused moves the position without resuming playback.
            this.stopClock();
            this.lastKnownVideoTime = now;
        } else {
            this.anchorToVideoTime(now);
        }
    }

    public initSession(url: string, completedSecs: number, vid?: HTMLVideoElement | null): void {
        this.currentUrl = cleanUrl(url);
        this.completedSessionSecs = completedSecs;
        this.watchedSecs = 0;
        this.stopClock();
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

    /** Start a new session for the same video (after a send, or once its queue entry is gone). */
    public reset(): void {
        this.flushPlayClock();
        this.watchedSecs = 0;
        this.completedSessionSecs = 0;
        this.lastSyncSecs = 0;
        this.lastAutoCheckSecs = 0;
        this.currentSessionId = crypto.randomUUID();
        this.hasTriggered = false;
        this.activeVid = null;
        this.lastKnownVideoTime = -1;
        this.isUserSeeking = false;
    }

    private notifyQueueUpdated(): void {
        browser.runtime.sendMessage({ action: 'QUEUE_UPDATED' }).catch(() => {
            /* Background asleep or context invalidated: it refreshes from the storage event anyway. */
        });
    }

    /**
     * Write the current session into the pending queue, creating the entry on
     * first call. Callers must have checked `passesQueueRules` first.
     */
    public async upsertQueueLive(
        videoTitle: string,
        channelName: string,
        channelId: string | null
    ): Promise<void> {
        // Capture the session before the first await: by the time the channel
        // lookup and the storage transaction resolve, the engine may already be
        // tracking the next video.
        const sessionId = this.currentSessionId;
        const url = this.currentUrl;
        const secs = this.getLiveWatched();
        if (!url || secs < 1) return;

        const finalTitle = stripVideoTitle(videoTitle);
        const mediaData = await getChannelMediaData(channelId, channelName);
        const now = new Date().toISOString();
        let inserted = false;

        await updateVideoQueueAtomic((queue) => {
            const item = queue.find(q => q.contentTitleEnglish === url);

            if (item) {
                item.sessions = item.sessions || [];

                const session = item.sessions.find(s => s.id === sessionId);
                if (session) {
                    session.secs = secs;
                    session.date = now;
                } else {
                    item.sessions.push({ id: sessionId, secs, date: now });
                }

                item.time = sessionMinutes(sumSessionSecs(item));
                if (finalTitle) item.description = finalTitle;
                if (channelName) {
                    item.contentTitleNative = channelName;
                    item.channelTitle = channelName;
                }
                if (channelId && channelId !== WEB_VIDEO_ID && (!item.channelId || item.channelId === WEB_VIDEO_ID)) {
                    item.channelId = channelId;
                }
                item.mediaData = { ...(item.mediaData || {}), ...mediaData };
                item.mediaId = pickChannelId(item.mediaData.channelId, channelId, item.mediaId);
            } else {
                inserted = true;
                queue.push({
                    id: crypto.randomUUID(),
                    contentTitleNative: channelName,
                    contentTitleEnglish: url,
                    time: sessionMinutes(secs),
                    date: now,
                    private: false,
                    tags: [],
                    description: finalTitle,
                    sessions: [{ id: sessionId, secs, date: now }],
                    channelId: channelId && channelId !== WEB_VIDEO_ID ? channelId : undefined,
                    channelTitle: channelName,
                    mediaId: pickChannelId(mediaData.channelId, channelId),
                    mediaData,
                });
            }
            return queue;
        });

        if (inserted) {
            void addDebugLog('INFO', 'VideoTracker', `Automatically queued video: ${finalTitle}`);
        }
        this.notifyQueueUpdated();
    }

    /**
     * Record the final duration of the current session. Only updates a session
     * that is already queued (i.e. one that passed the queue rules while it was
     * playing) — it never adds a video or a session to the queue.
     */
    public async finalizeSession(): Promise<void> {
        this.flushPlayClock();
        const sessionId = this.currentSessionId;
        const url = this.currentUrl;
        const secs = Math.floor(this.watchedSecs);
        if (!url || secs < 1) return;

        let updated = false;
        await updateVideoQueueAtomic((queue) => {
            const item = queue.find(q => q.contentTitleEnglish === url);
            const session = item?.sessions?.find(s => s.id === sessionId);
            if (!item || !session || session.secs === secs) return queue;

            session.secs = secs;
            item.time = sessionMinutes(sumSessionSecs(item));
            updated = true;
            return queue;
        });

        if (updated) this.notifyQueueUpdated();
    }

    public reachedQueueThreshold(cfg: TrackerConfig, vid: HTMLVideoElement): boolean {
        return hasReachedThreshold(getQueueThreshold(cfg), this.getLiveWatched(), vid.duration, {
            isLive: this.classify(false).isLive,
            minutes: 1,
        });
    }

    /** Japanese content, and not a music video unless the user opted in. */
    private isLoggableContent(cfg: TrackerConfig): boolean {
        const { isJapanese, isMusic } = this.classify(true);
        return isJapanese && (!isMusic || !!cfg.logMusicVideos);
    }

    /**
     * The single gate in front of the pending queue: queue mode is active, the
     * watch threshold is met, the video is Japanese and it is not excluded music.
     */
    public passesQueueRules(cfg: TrackerConfig, vid: HTMLVideoElement): boolean {
        return !isAutoSendEnabled(cfg)
            && this.reachedQueueThreshold(cfg, vid)
            && this.isLoggableContent(cfg);
    }

    public async handleTimeUpdate(
        vid: HTMLVideoElement,
        cfg: TrackerConfig,
        channelId: string | null,
        channelName: string,
        videoTitle: string
    ): Promise<void> {
        try {
            this.updateBadgeLive(vid);

            const liveSecs = this.getLiveWatched();

            if (this.hasTriggered || vid.duration <= 0) return;

            if (!isAutoSendEnabled(cfg)) {
                if ((liveSecs - this.lastSyncSecs) < QUEUE_SYNC_INTERVAL_SECS) return;
                if (!this.reachedQueueThreshold(cfg, vid)) return;

                this.lastSyncSecs = liveSecs;
                if (this.isLoggableContent(cfg)) {
                    await this.upsertQueueLive(videoTitle, channelName, channelId);
                }
                return;
            }

            if ((liveSecs - this.lastAutoCheckSecs) < AUTO_SEND_CHECK_INTERVAL_SECS) return;
            this.lastAutoCheckSecs = liveSecs;

            if (!this.isLoggableContent(cfg)) return;

            const triggered = hasReachedThreshold(getAutoSendThreshold(cfg), liveSecs, vid.duration, {
                isLive: this.classify(false).isLive,
                minutes: 5,
            });
            if (!triggered) return;

            this.hasTriggered = true;
            const sessionId = this.currentSessionId;
            const url = this.currentUrl;
            const mediaData = await getChannelMediaData(channelId, channelName);
            const finalTitle = stripVideoTitle(videoTitle);

            if (import.meta.env.DEV) {
                console.log(`[NAT DEV - VideoTracker] Auto-logging threshold reached for: ${finalTitle}`);
            }

            const ok = await submitLog({
                type: 'video',
                mediaId: pickChannelId(mediaData.channelId, channelId),
                description: finalTitle,
                mediaData,
                time: sessionMinutes(liveSecs),
                date: new Date().toISOString(),
                private: false,
                episodes: 0,
                pages: 0,
                unknownDate: false
            });

            // The request can outlive the session; only touch engine state that is still ours.
            const sameSession = this.currentSessionId === sessionId;

            if (ok?.success) {
                await addDebugLog('INFO', 'VideoTracker', `Auto-logged video successfully: ${finalTitle}`);
                await updateVideoQueueAtomic((queue) => queue.filter(q => q.contentTitleEnglish !== url));
                if (sameSession) this.onResetSession();
            } else {
                if (sameSession) this.hasTriggered = false;
                await addDebugLog('ERROR', 'VideoTracker', `Auto-log failed for: ${finalTitle}`, ok?.error);
            }
        } catch (err) {
            await addDebugLog('ERROR', 'VideoTracker', 'Exception encountered inside timeupdate tick', err);
            if (import.meta.env.DEV) {
                console.error(`[NAT DEV - VideoTracker] handleTimeUpdate critical exception:`, err);
            }
        }
    }
}
