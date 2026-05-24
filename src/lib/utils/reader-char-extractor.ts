/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

const ttuCharCountCache = new WeakMap<Element, number>();
let ttuCachedNodes: Element[] = [];
let ttuCachedAccumulated: number[] = [];

export interface AdvancedCharData {
    current: number;
    total: number;
    sectionIndex: number | null;
    isPaginated: boolean;
}

export function extractAdvancedCharCount(
    containerSelector = '.book-content, [data-ref="container"], .reader-container, article'
): AdvancedCharData | null {
    try {
        const vw = window.innerWidth; // Scoped at the top of the function to ensure visibility
        const readerContainer = document.querySelector(containerSelector) || document.body;
        const pTags = Array.from(readerContainer.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')).filter(el => {
            if (el.closest('#nt-ttu-chrono-wrapper, nav, .menu, header')) return false;
            return (el.textContent || '').trim().length > 0;
        }) as Element[];

        // Detect if the reader is in Paginated mode by checking columns on the correct nested wrapper
        const contentContainer = readerContainer.querySelector('.book-content-container') || readerContainer;
        const style = getComputedStyle(contentContainer);
        const writingMode = style.writingMode;

        // Determine if text is vertical-rl or vertical-lr
        const isVerticalText =
            writingMode === 'vertical-rl' ||
            writingMode === 'vertical-lr' ||
            readerContainer.classList.contains('book-content--writing-vertical-rl');

        const colWidth = style.columnWidth || '';
        const colCount = style.columnCount || '';
        const isPaginated =
            (colWidth !== 'auto' && colWidth !== 'none' && colWidth !== '') ||
            (colCount !== 'auto' && colCount !== 'none' && colCount !== '') ||
            !!readerContainer.closest('.book-reader-paginated, [data-view-mode="paginated"]') ||
            !!document.querySelector('.book-reader-paginated');

        if (pTags.length === 0) {
            // Svelte Ebook Reader cover page or image-only sections have no readable pTags.
            // We extract the section index container and return a zero-progress baseline to prevent reset freezing.
            const container = readerContainer.querySelector('.book-content-container') || readerContainer;
            const id = container.id || '';
            const match = id.match(/ttu-id(\d+)/);
            const sectionIndex = match ? parseInt(match[1], 10) : null;

            console.log(`[TextTracker Diagnostic] extractAdvancedCharCount (Zero-Text Baseline Page):`, {
                isPaginated,
                isVerticalText,
                writingMode,
                sectionIndex,
                containerId: id
            });

            return { current: 0, total: 0, sectionIndex, isPaginated };
        }

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
                    explored = rect.bottom <= 1;
                } else {
                    // Vertical Continuous: previous pages move LEFT or RIGHT
                    if (writingMode === 'vertical-lr') {
                        explored = rect.right <= 1;
                    } else {
                        // Calibrated subpixel right-edge horizontal continuous boundary (vw + 1)
                        explored = rect.left >= (vw + 1);
                    }
                }
            } else {
                if (isPaginated) {
                    // Horizontal Paginated: previous pages move LEFT out of the viewport
                    explored = rect.right <= 1;
                } else {
                    // Horizontal Continuous: previous pages move UP out of the viewport
                    explored = rect.bottom <= 1;
                }
            }

            if (explored) { lastIdx = mid; low = mid + 1; }
            else { high = mid - 1; }
        }

        let current = lastIdx >= 0 ? ttuCachedAccumulated[lastIdx] : 0;

        // Account for partial progress inside the active visible paragraph
        const currentIdx = lastIdx + 1;
        if (currentIdx < ttuCachedNodes.length) {
            const activeEl = ttuCachedNodes[currentIdx];
            const spans = activeEl.querySelectorAll("[class^='ttu-whispersync-line-highlight-']");

            if (spans.length > 0) {
                // Whispersync line-based tracking (Preserved)
                spans.forEach(s => {
                    const r = s.getBoundingClientRect();
                    let sExp = false;
                    if (isVerticalText) {
                        if (isPaginated) {
                            sExp = r.bottom <= 1;
                        } else {
                            if (writingMode === 'vertical-lr') {
                                sExp = r.right <= 1;
                            } else {
                                sExp = r.left >= (vw + 1);
                            }
                        }
                    } else {
                        if (isPaginated) {
                            sExp = r.right <= 1;
                        } else {
                            sExp = r.bottom <= 1;
                        }
                    }

                    if (sExp) {
                        const m = s.textContent?.match(/[\p{L}\p{N}]/gu);
                        if (m) current += m.length;
                    }
                });
            } else {
                // High-precision text-node/ruby-based tracking fallback
                const walker = document.createTreeWalker(activeEl, NodeFilter.SHOW_TEXT);
                let n;
                while ((n = walker.nextNode())) {
                    const parent = n.parentElement;
                    if (!parent) continue;

                    // Exclude ruby annotations, fallback tags, and other non-text elements
                    if (parent.closest('rt, rp, svg, figcaption, noscript, .ttu-illustration-container, .ttu-img-container')) {
                        continue;
                    }

                    // Measure the precise viewport boundaries of this individual text node
                    const range = document.createRange();
                    range.selectNodeContents(n);
                    const r = range.getBoundingClientRect();

                    // If the text node has no layout (e.g., hidden or empty whitespace nodes), skip
                    if (r.width === 0 || r.height === 0) {
                        continue;
                    }

                    let sExp = false;
                    if (isVerticalText) {
                        if (isPaginated) {
                            sExp = r.bottom <= 1;
                        } else {
                            if (writingMode === 'vertical-lr') {
                                sExp = r.right <= 1;
                            } else {
                                sExp = r.left >= (vw + 1);
                            }
                        }
                    } else {
                        if (isPaginated) {
                            sExp = r.right <= 1;
                        } else {
                            sExp = r.bottom <= 1;
                        }
                    }

                    if (sExp) {
                        const text = n.nodeValue || '';
                        const matches = text.match(/[\p{L}\p{N}]/gu);
                        if (matches) {
                            current += matches.length;
                        }
                    }
                }
            }
        }

        const total = ttuCachedAccumulated[ttuCachedAccumulated.length - 1] || 0;

        // Extract numeric section index from parent wrapper
        const container = readerContainer.querySelector('.book-content-container') || readerContainer;
        const id = container.id || '';
        const match = id.match(/ttu-id(\d+)/);
        const sectionIndex = match ? parseInt(match[1], 10) : null;

        console.log(`[TextTracker Diagnostic] extractAdvancedCharCount:`, {
            isPaginated,
            isVerticalText,
            writingMode,
            pTagsTotal: pTags.length,
            lastIdx,
            current,
            total,
            sectionIndex,
            containerId: id
        });

        return { current, total, sectionIndex, isPaginated };
    } catch (e) {
        return null;
    }
}