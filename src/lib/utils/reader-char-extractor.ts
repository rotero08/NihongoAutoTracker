/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { addDebugLog } from '@/lib/storage/debug';

export interface AdvancedCharData {
    current: number;
    total: number;
    sectionIndex: number | null;
    isPaginated: boolean;
}

// Module-level caches to optimize execution overhead
const ttuCharCountCache = new WeakMap<Element, number>();
const seenSectionIds = new Map<string, number>();

let ttuCachedNodes: Element[] = [];
let ttuCachedAccumulated: number[] = [];

// Layout and style caches to avoid forced reflows (Layout Thrashing)
let cachedIsVertical = false;
let cachedIsPaginated = false;
let cachedWritingMode = '';
let lastContainer: Element | null = null;
let lastContainerId = '';
let isCacheValid = false;

let containerObserver: MutationObserver | null = null;

// Throttled viewport trackers updated on resize
let cachedVw = typeof window !== 'undefined' ? window.innerWidth : 1024;
let cachedVh = typeof window !== 'undefined' ? window.innerHeight : 768;

// Reusable DOM Range to completely eliminate GC allocation spikes during search loops
let reusableRange: Range | null = null;

if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
        cachedVw = window.innerWidth;
        cachedVh = window.innerHeight;
        isCacheValid = false; // Invalidate cache for layout recalculated positions
    }, { passive: true });
}

/**
 * Robust regular expression that captures:
 * - \p{L} and \p{N} (Letters and numbers across all scripts)
 * - \u3007 (〇 - Ideographic Number Zero)
 * - \u25CB (○ - White Circle placeholder)
 * - \u25EF (◯ - Large Circle placeholder)
 * - \u25CF (● - Black Circle placeholder)
 * - \u25A0 (■ - Black Square placeholder)
 * - \u25A1 (□ - White Square placeholder)
 * 
 * Note: Multiplication and cross-style censor markers (such as \u00D7 (×), \u2715 (✕), or \uFF0A (＊)) 
 * are intentionally excluded to keep them from inflating reading statistics.
 */
const JP_CHAR_PATTERN = /[\p{L}\p{N}\u3007\u25CB\u25EF\u25CF\u25A0\u25A1]/gu;

/**
 * High-performance, allocation-free ancestor check to replace expensive querySelector / .closest elements.
 */
function shouldIgnoreNode(node: Node | null): boolean {
    let current = node;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
        const el = current as Element;
        const tag = el.tagName;
        if (tag === 'RT' || tag === 'RP' || tag === 'SVG' || tag === 'FIGCAPTION' || tag === 'NOSCRIPT') {
            return true;
        }
        const cl = el.classList;
        if (cl && (cl.contains('ttu-illustration-container') || cl.contains('ttu-img-container'))) {
            return true;
        }
        current = current.parentNode;
    }
    return false;
}

/**
 * Calculates a sequential integer for the active section container.
 * Resolves DOM order if multiple elements exist, otherwise maps ID hashes sequentially.
 */
function getSectionIndex(container: Element): number | null {
    const id = container.id || '';

    let containers = Array.from(document.querySelectorAll('.book-content-container'));
    if (containers.length === 0) {
        containers = Array.from(document.querySelectorAll('[id^="ttu-id"], [id^="ttu-p-"]'));
    }

    if (containers.length > 1) {
        const idx = containers.indexOf(container);
        if (idx !== -1) {
            return idx;
        }
    }

    // Extract the raw sequential digit from the ID (highly stable for spine indexing)
    if (id) {
        const match = id.match(/\d+/);
        if (match) {
            return parseInt(match[0], 10);
        }

        // Fallback to sequential hashing if no digits exist
        if (!seenSectionIds.has(id)) {
            const nextVal = seenSectionIds.size;
            seenSectionIds.set(id, nextVal);
        }
        return seenSectionIds.get(id) ?? null;
    }

    return null;
}

/**
 * Sets up a mutation observer to invalidate DOM and character caches only on true structural changes.
 * This completely prevents expensive DOM re-queries on simple scroll movements.
 */
function watchContainerMutations(container: Element) {
    if (containerObserver) {
        containerObserver.disconnect();
    }
    containerObserver = new MutationObserver(() => {
        isCacheValid = false;
    });
    containerObserver.observe(container, {
        childList: true,
        subtree: true,
        characterData: true
    });
}

export function extractAdvancedCharCount(
    containerSelector = '.book-content, [data-ref="container"], .reader-container, article'
): AdvancedCharData | null {
    try {
        const readerContainer = document.querySelector(containerSelector) || document.body;
        const activeContainer = readerContainer.querySelector('.book-content-container') || readerContainer;
        const currentContainerId = activeContainer.id || '';

        // Check if the container reference or its ID changed to trigger a cache refresh
        if (readerContainer !== lastContainer || currentContainerId !== lastContainerId) {
            lastContainer = readerContainer;
            lastContainerId = currentContainerId;
            isCacheValid = false;
            watchContainerMutations(readerContainer);
        }

        // 1. Resolve Style Configurations (Cached)
        if (!isCacheValid) {
            const style = getComputedStyle(activeContainer);
            cachedWritingMode = style.writingMode || '';
            cachedIsVertical =
                cachedWritingMode === 'vertical-rl' ||
                cachedWritingMode === 'vertical-lr' ||
                readerContainer.classList.contains('book-content--writing-vertical-rl');

            const colWidth = style.columnWidth || '';
            const colCount = style.columnCount || '';

            // Highly stable paginated mode detection based on structural container selectors
            cachedIsPaginated =
                !!document.querySelector('.book-content-container, .book-reader-paginated, [data-view-mode="paginated"]') ||
                ((colWidth !== 'auto' && colWidth !== 'none' && colWidth !== '') ||
                    (colCount !== 'auto' && colCount !== 'none' && colCount !== ''));
        }

        // 2. Query Text-bearing Nodes
        let pTags = ttuCachedNodes;
        if (!isCacheValid) {
            pTags = Array.from(readerContainer.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')).filter(el => {
                if (el.closest('#nt-ttu-chrono-wrapper, nav, .menu, header')) return false;
                return (el.textContent || '').trim().length > 0;
            }) as Element[];
        }

        const sectionIndex = getSectionIndex(activeContainer);

        if (pTags.length === 0) {
            return { current: 0, total: 0, sectionIndex, isPaginated: cachedIsPaginated };
        }

        // Layout Stability Guard: If Svelte is rendering but has not applied dimensions,
        // we defer transition processing to prevent premature character jumps.
        const firstParagraph = pTags[0];
        const firstParaRect = firstParagraph ? firstParagraph.getBoundingClientRect() : null;
        if (firstParaRect && firstParaRect.width === 0 && firstParaRect.height === 0) {
            return { current: 0, total: 0, sectionIndex, isPaginated: cachedIsPaginated };
        }

        // 3. Cache Rebuild & Prefix Sum Calculations
        if (!isCacheValid || ttuCachedNodes.length !== pTags.length || ttuCachedNodes[0] !== pTags[0]) {
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
                        if (!shouldIgnoreNode(n.parentElement)) {
                            text += n.nodeValue || '';
                        }
                    }
                    const matches = text.match(JP_CHAR_PATTERN);
                    count = matches ? matches.length : 0;
                    ttuCharCountCache.set(el, count);
                }
                acc += count;
                ttuCachedAccumulated[i] = acc;
            }
            isCacheValid = true;
        }

        // 4. Binary Search for last explored paragraph
        let low = 0;
        let high = ttuCachedNodes.length - 1;
        let lastIdx = -1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const r = ttuCachedNodes[mid].getBoundingClientRect();

            let explored = false;
            if (r.width === 0 || r.height === 0) {
                explored = true; // Treats unrendered nodes as explored to bypass frozen baselines
            } else if (cachedIsVertical) {
                if (cachedIsPaginated) {
                    explored = r.bottom <= 1;
                } else {
                    if (cachedWritingMode === 'vertical-lr') {
                        explored = r.right <= 1;
                    } else {
                        explored = r.left >= (cachedVw + 1);
                    }
                }
            } else {
                if (cachedIsPaginated) {
                    explored = r.right <= 1;
                } else {
                    explored = r.bottom <= 1;
                }
            }

            if (explored) {
                lastIdx = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        let current = lastIdx >= 0 ? ttuCachedAccumulated[lastIdx] : 0;

        // 5. High-Precision Localized Sub-Paragraph Progress Tracker
        const currentIdx = lastIdx + 1;
        if (currentIdx < ttuCachedNodes.length) {
            const activeEl = ttuCachedNodes[currentIdx];
            const r = activeEl.getBoundingClientRect();

            // Optimisation Check: Verify if the active element has actually entered the viewport boundaries
            let hasEntered = false;
            if (cachedIsVertical) {
                if (cachedIsPaginated) {
                    hasEntered = r.top < cachedVh;
                } else {
                    if (cachedWritingMode === 'vertical-lr') {
                        hasEntered = r.left < cachedVw;
                    } else {
                        hasEntered = r.right > 0;
                    }
                }
            } else {
                if (cachedIsPaginated) {
                    hasEntered = r.left < cachedVw;
                } else {
                    hasEntered = r.top < cachedVh;
                }
            }

            if (hasEntered) {
                const spans = activeEl.querySelectorAll("[class^='ttu-whispersync-line-highlight-']");

                if (spans.length > 0) {
                    spans.forEach(s => {
                        if (shouldIgnoreNode(s)) return;

                        const sr = s.getBoundingClientRect();
                        let sExp = false;
                        if (cachedIsVertical) {
                            if (cachedIsPaginated) {
                                sExp = sr.bottom <= 1;
                            } else {
                                if (cachedWritingMode === 'vertical-lr') {
                                    sExp = sr.right <= 1;
                                } else {
                                    sExp = sr.left >= (cachedVw + 1);
                                }
                            }
                        } else {
                            if (cachedIsPaginated) {
                                sExp = sr.right <= 1;
                            } else {
                                sExp = sr.bottom <= 1;
                            }
                        }

                        if (sExp) {
                            const m = s.textContent?.match(JP_CHAR_PATTERN);
                            if (m) current += m.length;
                        }
                    });
                } else {
                    // Fallback to text node precision tracking when highlights are absent
                    const walker = document.createTreeWalker(activeEl, NodeFilter.SHOW_TEXT);
                    let n;

                    // Lazy-load DOM Range to prevent memory churn
                    if (!reusableRange && typeof document !== 'undefined') {
                        reusableRange = document.createRange();
                    }

                    while ((n = walker.nextNode())) {
                        const parent = n.parentElement;
                        if (!parent || shouldIgnoreNode(parent)) {
                            continue;
                        }

                        if (reusableRange) {
                            reusableRange.selectNodeContents(n);
                            const nr = reusableRange.getBoundingClientRect();

                            if (nr.width === 0 || nr.height === 0) continue;

                            let sExp = false;
                            if (cachedIsVertical) {
                                if (cachedIsPaginated) {
                                    sExp = nr.bottom <= 1;
                                } else {
                                    if (cachedWritingMode === 'vertical-lr') {
                                        sExp = nr.right <= 1;
                                    } else {
                                        sExp = nr.left >= (cachedVw + 1);
                                    }
                                }
                            } else {
                                if (cachedIsPaginated) {
                                    sExp = nr.right <= 1;
                                } else {
                                    sExp = nr.bottom <= 1;
                                }
                            }

                            if (sExp) {
                                const text = n.nodeValue || '';
                                const matches = text.match(JP_CHAR_PATTERN);
                                if (matches) {
                                    current += matches.length;
                                }
                            }
                        }
                    }
                }
            }
        }

        const total = ttuCachedAccumulated[ttuCachedAccumulated.length - 1] || 0;

        return { current, total, sectionIndex, isPaginated: cachedIsPaginated };
    } catch (e) {
        return null;
    }
}