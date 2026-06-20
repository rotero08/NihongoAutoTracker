/**
 * ── ttu live-progress bridge (MAIN world) ────────────────────────────────────
 * Runs in the PAGE's JS world (injected via injectScript), where it CAN read the
 * detail of ttu's own CustomEvents. ttu dispatches, immediately on every change:
 *
 *   document.dispatchEvent(new CustomEvent('ttsu:page.change',
 *       { detail: { exploredCharCount } }))           // live, NOT debounced
 *   document.dispatchEvent(new CustomEvent('ttsu:page.change',
 *       { detail: { bookCharCount } }))                // whole-book total
 *
 * A content script in the ISOLATED world cannot read event.detail across the Xray
 * boundary on Firefox, so this bridge copies the values onto shared DOM
 * attributes on <html>. DOM is shared across worlds, so the content-script poll
 * reads them synchronously with ZERO lag.
 *
 * READ-ONLY: only listens and writes two data-* attributes. Touches nothing else.
 *
 * NOTE: ship as an unlisted WXT script at entrypoints/ttu-live-bridge.ts. It is
 * injected by injectTtuLiveBridge() in ttu-live.ts.
 */
export default defineUnlistedScript(() => {
    const EXPLORED_ATTR = 'data-nt-ttu-explored';
    const TOTAL_ATTR = 'data-nt-ttu-total';

    const onPageChange = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (!detail) return;
        const explored = detail.exploredCharCount;
        if (typeof explored === 'number' && isFinite(explored) && explored >= 0) {
            document.documentElement.setAttribute(EXPLORED_ATTR, String(explored));
        }
        const total = detail.bookCharCount;
        if (typeof total === 'number' && isFinite(total) && total > 0) {
            document.documentElement.setAttribute(TOTAL_ATTR, String(total));
        }
    };

    // Capture phase so we still see it even if something stops propagation.
    document.addEventListener('ttsu:page.change', onPageChange, true);
});