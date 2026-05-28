/**
 * ── DOM Mutation Stabilizer ──────────────────────────────────────────────────
 *
 * Watches for Jiten/Yomichan translation popups and manages the
 * silent/stabilization grace-periods. It prevents transient layout
 * updates from corrupting character count and timing calculations.
 */

export class DOMMutationStabilizer {
    private hasInitialJitenParseOccurred = false;
    private isGracePeriodActive = false;
    private graceTimeout: any = null;
    private lastJitenMutationTime = 0;

    private isSilentGraceActive = false;
    private silentGraceTimeout: any = null;
    private lastSilentMutationTime = 0;

    constructor(
        private ttuState: { running: boolean },
        private onSetChronoButtonDisabled: (disabled: boolean, message?: string) => void,
        private onUpdateDropdownOverlayState: (active: boolean, message?: string) => void,
        private onRecalculateChars: () => void,
        private onJitenStatusChange: (active: boolean) => void
    ) { }

    public getGracePeriodActive(): boolean {
        return this.isGracePeriodActive;
    }

    public getSilentGraceActive(): boolean {
        return this.isSilentGraceActive;
    }

    public resetJitenParseFlag(): void {
        this.hasInitialJitenParseOccurred = false;
    }

    /**
     * Infinite-precision Dynamic Debounce Stabilization (Visual overlay for stopped timer)
     * accepts optional fast bypass parameter to skip costly document.querySelector runs (Task 6.2)
     */
    public runGracePeriodIfJiten(alreadyDetected?: boolean): void {
        const isJitenActive = alreadyDetected ?? !!document.querySelector('span.jiten-word, [class*="jiten"], [ajb="true"]');
        if (!isJitenActive) return;

        this.lastJitenMutationTime = Date.now();
        if (this.isGracePeriodActive) {
            if (this.graceTimeout) clearTimeout(this.graceTimeout);
            this.graceTimeout = setTimeout(() => this.checkGracePeriodStabilization(), 300);
            return;
        }

        this.isGracePeriodActive = true;
        this.onSetChronoButtonDisabled(true);
        this.onUpdateDropdownOverlayState(true);

        if (this.graceTimeout) clearTimeout(this.graceTimeout);
        this.graceTimeout = setTimeout(() => this.checkGracePeriodStabilization(), 300);
    }

    private checkGracePeriodStabilization(): void {
        const timeSinceLastMutation = Date.now() - this.lastJitenMutationTime;
        if (timeSinceLastMutation < 300) {
            if (this.graceTimeout) clearTimeout(this.graceTimeout);
            this.graceTimeout = setTimeout(
                () => this.checkGracePeriodStabilization(),
                300 - timeSinceLastMutation
            );
            return;
        }

        this.isGracePeriodActive = false;
        this.hasInitialJitenParseOccurred = true; // Mark parsing as completed
        this.onSetChronoButtonDisabled(false);
        this.onUpdateDropdownOverlayState(false);
        if (this.ttuState.running) {
            this.onRecalculateChars();
        }
    }

    /**
     * Silent Background Protection during running sessions
     */
    public runSilentGracePeriodIfJiten(alreadyDetected?: boolean): void {
        const isJitenActive = alreadyDetected ?? !!document.querySelector('span.jiten-word, [class*="jiten"], [ajb="true"]');
        if (!isJitenActive) return;

        this.lastSilentMutationTime = Date.now();
        if (this.isSilentGraceActive) {
            if (this.silentGraceTimeout) clearTimeout(this.silentGraceTimeout);
            this.silentGraceTimeout = setTimeout(() => this.checkSilentGraceStabilization(), 300);
            return;
        }

        this.setSilentGraceActiveState(true);

        if (this.silentGraceTimeout) clearTimeout(this.silentGraceTimeout);
        this.silentGraceTimeout = setTimeout(() => this.checkSilentGraceStabilization(), 300);
    }

    private checkSilentGraceStabilization(): void {
        const timeSinceLastMutation = Date.now() - this.lastSilentMutationTime;
        if (timeSinceLastMutation < 300) {
            if (this.silentGraceTimeout) clearTimeout(this.silentGraceTimeout);
            this.silentGraceTimeout = setTimeout(
                () => this.checkSilentGraceStabilization(),
                300 - timeSinceLastMutation
            );
            return;
        }

        this.setSilentGraceActiveState(false);
        this.onRecalculateChars();
    }

    private setSilentGraceActiveState(active: boolean): void {
        this.isSilentGraceActive = active;
        this.onJitenStatusChange(active);
    }

    /**
     * Intercept timer pausing while silent/background parsing processes are running
     */
    public handleTimerPaused(): void {
        if (this.isSilentGraceActive) {
            this.setSilentGraceActiveState(false);
            if (this.silentGraceTimeout) clearTimeout(this.silentGraceTimeout);
            this.isSilentGraceActive = false;

            this.isGracePeriodActive = true;
            this.onSetChronoButtonDisabled(
                true,
                'Waiting for Jiten to finish processing layout... Your tracking progress is safe.'
            );
            this.onUpdateDropdownOverlayState(
                true,
                'Waiting for Jiten to finish processing layout... Your tracking progress is safe.'
            );

            this.lastJitenMutationTime = this.lastSilentMutationTime;
            if (this.graceTimeout) clearTimeout(this.graceTimeout);
            this.graceTimeout = setTimeout(() => this.checkGracePeriodStabilization(), 300);
        }
    }
}