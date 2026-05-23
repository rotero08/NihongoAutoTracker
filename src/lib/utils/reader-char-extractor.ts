/**
 * ── Reader Character Extractor Utility ──────────────────────────────────────
 * Houses the high-precision DOM binary search text counting engine.
 * Decouples performance-critical paragraph calculations from content scripts.
 */

const ttuCharCountCache = new WeakMap<Element, number>();
let ttuCachedNodes: Element[] = [];
let ttuCachedAccumulated: number[] = [];

export function extractAdvancedCharCount(
    containerSelector = '.book-content, [data-ref="container"], .reader-container, article'
): number | null {
    try {
        const readerContainer = document.querySelector(containerSelector) || document.body;
        const pTags = Array.from(readerContainer.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')).filter(el => {
            if (el.closest('#nt-ttu-chrono-wrapper, nav, .menu, header')) return false;
            return (el.textContent || '').trim().length > 0;
        }) as Element[];

        if (pTags.length === 0) return null;

        // Cache Rebuild
        if (ttuCachedNodes.length !== pTags.length || ttuCachedNodes[0] !== pTags[0]) {
            ttuCachedNodes = pTags;
            ttuCachedAccumulated = new Array(pTags.length);
            let acc = 0;
            for (let i = 0; i < pTags.length; i++) {
                const el = pTags[i];
                let count = ttuCharCountCache.get(el);
                if (count === undefined) {
                    let text = '';
                    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
                    let n;
                    while ((n = walker.nextNode())) {
                        if (!n.parentElement?.closest('rt, rp')) text += n.nodeValue || '';
                    }
                    const matches = text.match(/[\p{L}\p{N}]/gu);
                    count = matches ? matches.length : 0;
                    ttuCharCountCache.set(el, count);
                }
                acc += count;
                ttuCachedAccumulated[i] = acc;
            }
        }

        const vw = window.innerWidth;
        const writingMode = getComputedStyle(readerContainer).writingMode;

        // Binary Search for the last visible/explored paragraph
        let low = 0, high = ttuCachedNodes.length - 1, lastIdx = -1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const rect = ttuCachedNodes[mid].getBoundingClientRect();

            let explored = false;
            if (rect.width === 0 || rect.height === 0) explored = true; // Skip hidden
            else if (writingMode === 'vertical-rl') explored = rect.left >= (vw - 5);
            else if (writingMode === 'vertical-lr') explored = rect.right <= 5;
            else explored = rect.bottom <= 5;

            if (explored) { lastIdx = mid; low = mid + 1; }
            else { high = mid - 1; }
        }

        let total = lastIdx >= 0 ? ttuCachedAccumulated[lastIdx] : 0;

        // Account for partial whispersync highlight adjustments
        const currentIdx = lastIdx + 1;
        if (currentIdx < ttuCachedNodes.length) {
            const spans = ttuCachedNodes[currentIdx].querySelectorAll("[class^='ttu-whispersync-line-highlight-']");
            spans.forEach(s => {
                const r = s.getBoundingClientRect();
                let sExp = false;
                if (writingMode === 'vertical-rl') sExp = r.left >= (vw - 5);
                else if (writingMode === 'vertical-lr') sExp = r.right <= 5;
                else sExp = r.bottom <= 5;

                if (sExp) {
                    const m = s.textContent?.match(/[\p{L}\p{N}]/gu);
                    if (m) total += m.length;
                }
            });
        }

        return total;
    } catch (e) {
        return null;
    }
}