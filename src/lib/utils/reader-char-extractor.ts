/**
 * ── Reader Character Extractor Utility ──────────────────────────────────────
 * Houses the high-precision DOM binary search text counting engine.
 * Decouples performance-critical paragraph calculations from content scripts.
 */

const ttuCharCountCache = new WeakMap<Element, number>();
let ttuCachedNodes: Element[] = [];
let ttuCachedAccumulated: number[] = [];

export interface AdvancedCharData {
    current: number;
    total: number;
    sectionIndex: number | null;
}

export function extractAdvancedCharCount(
    containerSelector = '.book-content, [data-ref="container"], .reader-container, article'
): AdvancedCharData | null {
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
                        // Exclude ruby wrappers, embedded SVGs, fallback elements, and illustration containers
                        if (!n.parentElement?.closest('rt, rp, svg, figcaption, noscript, .ttu-illustration-container, .ttu-img-container')) {
                            text += n.nodeValue || '';
                        }
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
        const style = getComputedStyle(readerContainer);
        const writingMode = style.writingMode;

        // Determine if text is vertical-rl or vertical-lr
        const isVerticalText =
            writingMode === 'vertical-rl' ||
            writingMode === 'vertical-lr' ||
            readerContainer.classList.contains('book-content--writing-vertical-rl');

        // Detect if the reader is in Paginated mode
        const colWidth = style.columnWidth || '';
        const colCount = style.columnCount || '';
        const isPaginated =
            (colWidth !== 'auto' && colWidth !== 'none' && colWidth !== '') ||
            (colCount !== 'auto' && colCount !== 'none' && colCount !== '') ||
            !!readerContainer.closest('.book-reader-paginated, [data-view-mode="paginated"]') ||
            !!document.querySelector('.book-reader-paginated') ||
            !!document.querySelector('.book-content-container');

        // Binary Search for the last visible/explored paragraph
        let low = 0, high = ttuCachedNodes.length - 1, lastIdx = -1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const rect = ttuCachedNodes[mid].getBoundingClientRect();

            let explored = false;
            if (rect.width === 0 || rect.height === 0) {
                explored = true; // Skip hidden
            } else if (isVerticalText) {
                if (isPaginated) {
                    // Vertical Paginated: previous pages move UP out of the viewport
                    explored = rect.bottom <= 5;
                } else {
                    // Vertical Continuous: previous pages move LEFT or RIGHT
                    if (writingMode === 'vertical-lr') {
                        explored = rect.right <= 5;
                    } else {
                        explored = rect.left >= (vw - 5);
                    }
                }
            } else {
                if (isPaginated) {
                    // Horizontal Paginated: previous pages move LEFT out of the viewport
                    explored = rect.right <= 5;
                } else {
                    // Horizontal Continuous: previous pages move UP out of the viewport
                    explored = rect.bottom <= 5;
                }
            }

            if (explored) { lastIdx = mid; low = mid + 1; }
            else { high = mid - 1; }
        }

        let current = lastIdx >= 0 ? ttuCachedAccumulated[lastIdx] : 0;

        // Account for partial whispersync highlight adjustments
        const currentIdx = lastIdx + 1;
        if (currentIdx < ttuCachedNodes.length) {
            const spans = ttuCachedNodes[currentIdx].querySelectorAll("[class^='ttu-whispersync-line-highlight-']");
            spans.forEach(s => {
                const r = s.getBoundingClientRect();
                let sExp = false;
                if (isVerticalText) {
                    if (isPaginated) {
                        sExp = r.bottom <= 5;
                    } else {
                        if (writingMode === 'vertical-lr') {
                            sExp = r.right <= 5;
                        } else {
                            sExp = r.left >= (vw - 5);
                        }
                    }
                } else {
                    if (isPaginated) {
                        sExp = r.right <= 5;
                    } else {
                        sExp = r.bottom <= 5;
                    }
                }

                if (sExp) {
                    const m = s.textContent?.match(/[\p{L}\p{N}]/gu);
                    if (m) current += m.length;
                }
            });
        }

        const total = ttuCachedAccumulated[ttuCachedAccumulated.length - 1] || 0;

        // Extract numeric section index from parent wrapper
        const container = readerContainer.querySelector('.book-content-container') || readerContainer;
        const id = container.id || '';
        const match = id.match(/ttu-id(\d+)/);
        const sectionIndex = match ? parseInt(match[1], 10) : null;

        return { current, total, sectionIndex };
    } catch (e) {
        return null;
    }
}