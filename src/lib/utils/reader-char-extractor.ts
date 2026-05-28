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

// Stopped-state cache references (Goal 3)
let lastCachedTotal = 0;
let lastCachedSectionIndex: number | null = null;

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
 * Robust regular expression that captures letters/numbers and placeholder symbols.
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

        // TERMINATION GUARD: Stop walking up parent nodes once we reach paragraph/block elements
        if (tag === 'P' || tag === 'LI' || /^(H[1-6])$/i.test(tag)) {
            break;
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
            // Prevent unbounded memory growth over extended SPA reader sessions
            if (seenSectionIds.size > 500) {
                seenSectionIds.clear();
            }
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

    const isBlockTag = (tag: string) => /^(P|LI|H[1-6]|DIV|ARTICLE|SECTION|BODY|HTML)$/i.test(tag);

    const isJitenOrYomichan = (el: HTMLElement) => {
        const tag = el.tagName;
        if (tag === 'RT' || tag === 'RP' || tag === 'RUBY') return true;
        const cl = el.classList;
        if (cl) {
            if (cl.contains('jiten-word') || cl.contains('yomichan') || cl.contains('yomitan')) return true;
            for (let i = 0; i < cl.length; i++) {
                const c = cl[i].toLowerCase();
                if (c.indexOf('jiten') !== -1 || c.indexOf('yomi') !== -1) return true;
            }
        }
        if (el.getAttribute('ajb') === 'true') return true;
        return false;
    };

    containerObserver = new MutationObserver((mutations) => {
        let realMutation = false;
        for (let i = 0; i < mutations.length; i++) {
            const m = mutations[i];
            const target = m.target as HTMLElement;
            if (!target) continue;

            // Direct Block Filter Guard: Ignore subtree changes inside inline elements completely
            if (!isBlockTag(target.tagName)) continue;

            if (m.type === 'childList') {
                const checkNode = (node: Node): boolean => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return false;
                    const el = node as HTMLElement;

                    // Ignore dictionary dynamic wrappings
                    if (isJitenOrYomichan(el)) return false;

                    const tag = el.tagName;
                    if (isBlockTag(tag)) {
                        if (el.id === 'nt-ttu-chrono-wrapper' || el.closest('#nt-ttu-chrono-wrapper')) {
                            return false;
                        }
                        return true;
                    }

                    for (let j = 0; j < el.children.length; j++) {
                        if (checkNode(el.children[j])) return true;
                    }
                    return false;
                };

                let hasBlockChange = false;
                for (let j = 0; j < m.addedNodes.length; j++) {
                    if (checkNode(m.addedNodes[j])) { hasBlockChange = true; break; }
                }
                if (!hasBlockChange) {
                    for (let j = 0; j < m.removedNodes.length; j++) {
                        if (checkNode(m.removedNodes[j])) { hasBlockChange = true; break; }
                    }
                }

                if (hasBlockChange) {
                    realMutation = true;
                    break;
                }
            } else if (m.type === 'characterData') {
                const parent = m.target.parentElement;
                if (parent) {
                    if (isJitenOrYomichan(parent)) continue;
                }
                realMutation = true;
                break;
            }
        }

        if (realMutation) {
            isCacheValid = false;
        }
    });

    containerObserver.observe(container, {
        childList: true,
        subtree: true,
        characterData: true
    });
}

export function extractAdvancedCharCount(
    containerSelector = '.book-content, [data-ref="container"], .reader-container, article',
    isTimerRunning = true
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
            // Solve Detached DOM Memory Leak: Clean cached elements to prevent holding old chapters in memory
            ttuCachedNodes = [];
            ttuCachedAccumulated = [];
            watchContainerMutations(readerContainer);
        }

        // Goal 3: Complete Stopped-State Optimization Bypass (O(1) retrieval when stopped & cache valid)
        if (!isTimerRunning && lastContainer === readerContainer && currentContainerId === lastContainerId && isCacheValid) {
            return {
                current: 0,
                total: lastCachedTotal,
                sectionIndex: lastCachedSectionIndex,
                isPaginated: cachedIsPaginated
            };
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
        lastCachedSectionIndex = sectionIndex;

        if (pTags.length === 0) {
            lastCachedTotal = 0;
            return { current: 0, total: 0, sectionIndex, isPaginated: cachedIsPaginated };
        }

        // Layout Stability Guard: If layout is not loaded, defer transition processing
        const firstParagraph = pTags[0];
        const firstParaRect = firstParagraph ? firstParagraph.getBoundingClientRect() : null;
        if (firstParaRect && firstParaRect.width === 0 && firstParaRect.height === 0) {
            return { current: 0, total: lastCachedTotal, sectionIndex, isPaginated: cachedIsPaginated };
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

        const total = ttuCachedAccumulated[ttuCachedAccumulated.length - 1] || 0;
        lastCachedTotal = total;

        // Bypasses calculations when stopped, but still preserves cached metrics
        if (!isTimerRunning) {
            return { current: 0, total, sectionIndex, isPaginated: cachedIsPaginated };
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
                explored = true; // Treats unrendered nodes as explored
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

            // Continuous Scroll Boundary Check
            let needsSubParagraphTracking = false;
            if (cachedIsPaginated) {
                // Goal 1: Bypass text-node measurements in columns unless split or highlighted
                const isSplit = cachedIsVertical
                    ? (r.bottom > cachedVh || r.top < 0)
                    : (r.right > cachedVw || r.left < 0);
                needsSubParagraphTracking = isSplit || activeEl.querySelector("[class^='ttu-whispersync-line-highlight-']") !== null;
            } else {
                if (cachedIsVertical) {
                    if (cachedWritingMode === 'vertical-lr') {
                        needsSubParagraphTracking = r.left < -1;
                    } else {
                        needsSubParagraphTracking = r.right > (cachedVw + 1);
                    }
                } else {
                    needsSubParagraphTracking = r.top < -1;
                }
            }

            if (needsSubParagraphTracking) {
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
                    let checkedNodesCount = 0;

                    if (!reusableRange && typeof document !== 'undefined') {
                        reusableRange = document.createRange();
                    }

                    while ((n = walker.nextNode()) && checkedNodesCount < 150) {
                        const parent = n.parentElement;
                        if (!parent || shouldIgnoreNode(parent)) {
                            continue;
                        }

                        const text = n.nodeValue || '';
                        if (!text.trim() || !JP_CHAR_PATTERN.test(text)) {
                            continue;
                        }

                        checkedNodesCount++;

                        let sExp = false;
                        // Goal 1 Optimization: Measure parent bounding box directly to bypass DOM range creation
                        if (parent.tagName === 'SPAN' || parent.tagName === 'RUBY' || parent.tagName === 'RT') {
                            const nr = parent.getBoundingClientRect();
                            if (nr.width > 0 && nr.height > 0) {
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
                            }
                        } else if (reusableRange) {
                            reusableRange.selectNodeContents(n);
                            const nr = reusableRange.getBoundingClientRect();

                            if (nr.width === 0 || nr.height === 0) continue;

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
                        }

                        if (sExp) {
                            const matches = text.match(JP_CHAR_PATTERN);
                            if (matches) {
                                current += matches.length;
                            }
                        }
                    }
                }
            }
        }

        return { current, total, sectionIndex, isPaginated: cachedIsPaginated };
    } catch (e) {
        return null;
    }
}