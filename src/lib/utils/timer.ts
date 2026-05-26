/**
 * ── Standalone Local Time Tracker Engine ─────────────────────────────────────
 * Keeps absolute track of elapsed active reading time while respecting tab visibility
 * and manual pause operations.
 */
export class TimerEngine {
    private activeMs = 0;
    private lastTimestamp = Date.now();
    private isVisible = true;
    private isPaused = false;

    constructor() {
        if (typeof document !== 'undefined') {
            this.isVisible = !document.hidden;
            document.addEventListener('visibilitychange', this.handleVisibilityChange);
        }
    }

    private handleVisibilityChange = () => {
        if (document.hidden) {
            this.accrue();
            this.isVisible = false;
        } else {
            this.lastTimestamp = Date.now();
            this.isVisible = true;
        }
    };

    private accrue() {
        if (this.isVisible && !this.isPaused) {
            this.activeMs += Date.now() - this.lastTimestamp;
        }
        this.lastTimestamp = Date.now();
    }

    public getTotal(): number {
        if (this.isVisible && !this.isPaused) {
            return this.activeMs + (Date.now() - this.lastTimestamp);
        }
        return this.activeMs;
    }

    public setMs(ms: number) {
        this.accrue();
        this.activeMs = ms;
        this.lastTimestamp = Date.now();
    }

    public pause(shouldPause: boolean) {
        if (shouldPause) {
            this.accrue();
            this.isPaused = true;
        } else {
            this.lastTimestamp = Date.now();
            this.isPaused = false;
        }
    }

    public getIsPaused(): boolean {
        return this.isPaused;
    }

    public destroy() {
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        }
    }
}