import { addDebugLog } from '@/lib/storage/debug';

// WeakMap cache for character counts to prevent re-parsing text nodes
const charCountCache = new WeakMap<Element, number>();

// Flat cache registries to track elements during active reading sessions
let cachedNodes: Element[] = [];
let cachedAccumulated: number[] = [];
const seenSectionIds = new Map<string, number>();

// Cache paragraph client rects to prevent layout thrashing
interface GeometryCache {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
}
const paragraphGeometryCache = new WeakMap<Element, GeometryCache>();

export interface AdvancedCharData {
    current: number;
    total: number;
    sectionIndex: number | null;
    isPaginated: boolean;
}

export function clearCharacterExtractorCache() {
    cachedNodes = [];
    cachedAccumulated = [];
}

/**
 * Returns a cached bounding box for a given paragraph element,
 * updating the cache only if necessary.
 */
function getCachedGeometry(element: Element, forceUpdate = false): GeometryCache {
    let cached = paragraphGeometryCache.get(element);
    if (!cached || forceUpdate) {
        const rect = element.getBoundingClientRect();
        cached = {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
        };
        paragraphGeometryCache.set(element, cached);
    }
    return cached;
}

/**
 * Calculates a sequential index for the active section container.
 */
function getSectionIndex(container: Element): number | null {
    const id = container.id || '';

    let containers = Array.from(document.querySelectorAll('.book-content-container'));
    if (containers.length === 0) {
        containers = Array.from(document.querySelectorAll('[id^="ttu-id"], [id^="ttu-p-"]'));
    }

    if (containers.length > 1) {
        const index = containers.indexOf(container);
        if (index !== -1) return index;
    }

    if (id) {
        if (!seenSectionIds.has(id)) {
            seenSectionIds.set(id, seenSectionIds.size);
        }
        return seenSectionIds.get(id) ?? null;
    }

    return null;
}

/**
 * Extracts character counts performantly using binary search, element caching,
 * and layout-thrashing guards.
 */
export function extractAdvancedCharCount(
    containerSelector = '.book-content, [data-ref="container"], .reader-container, article'
): AdvancedCharData | null {
    try {
        const viewportWidth = window.innerWidth;
        const readerContainer = document.querySelector(containerSelector) || document.body;

        // Select valid reading paragraphs
        const paragraphs = Array.from(readerContainer.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')).filter(element => {
            if (element.closest('#nt-ttu-chrono-wrapper, nav, .menu, header')) return false;
            return (element.textContent || '').trim().length > 0;
        }) as Element[];

        const contentContainer = readerContainer.querySelector('.book-content-container') || readerContainer;
        const computedStyle = getComputedStyle(contentContainer);
        const writingMode = computedStyle.writingMode;

        const isVerticalText =
            writingMode === 'vertical-rl' ||
            writingMode === 'vertical-lr' ||
            readerContainer.classList.contains('book-content--writing-vertical-rl');

        const columnWidth = computedStyle.columnWidth || '';
        const columnCount = computedStyle.columnCount || '';
        const isPaginated =
            (columnWidth !== 'auto' && columnWidth !== 'none' && columnWidth !== '') ||
            (columnCount !== 'auto' && columnCount !== 'none' && columnCount !== '') ||
            !!readerContainer.closest('.book-reader-paginated, [data-view-mode="paginated"]') ||
            !!document.querySelector('.book-reader-paginated');

        if (paragraphs.length === 0) {
            const container = readerContainer.querySelector('.book-content-container') || readerContainer;
            const sectionIndex = getSectionIndex(container);
            return { current: 0, total: 0, sectionIndex, isPaginated };
        }

        // Rebuild character position registry if structural changes occur
        if (cachedNodes.length !== paragraphs.length || cachedNodes[0] !== paragraphs[0]) {
            cachedNodes = paragraphs;
            cachedAccumulated = new Array(paragraphs.length);
            let accumulatedCount = 0;
            for (let i = 0; i < paragraphs.length; i++) {
                const element = paragraphs[i];
                let count = charCountCache.get(element);
                if (count === undefined) {
                    let text = '';
                    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
                    let node;
                    while ((node = walker.nextNode())) {
                        if (!node.parentElement?.closest('rt, rp, svg, figcaption, noscript, .ttu-illustration-container, .ttu-img-container')) {
                            text += node.nodeValue || '';
                        }
                    }
                    const matches = text.match(/[\p{L}\p{N}]/gu);
                    count = matches ? matches.length : 0;
                    charCountCache.set(element, count);
                }
                accumulatedCount += count;
                cachedAccumulated[i] = accumulatedCount;
            }
        }

        // Binary search for the last visible paragraph
        let low = 0;
        let high = cachedNodes.length - 1;
        let lastVisibleIndex = -1;

        // We only force-refresh layouts for nodes within current search boundaries
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const geom = getCachedGeometry(cachedNodes[mid], true);

            let isExplored = false;
            if (geom.width === 0 || geom.height === 0) {
                isExplored = true;
            } else if (isVerticalText) {
                if (isPaginated) {
                    isExplored = geom.bottom <= 1;
                } else {
                    if (writingMode === 'vertical-lr') {
                        isExplored = geom.right <= 1;
                    } else {
                        isExplored = geom.left >= (viewportWidth + 1);
                    }
                }
            } else {
                if (isPaginated) {
                    isExplored = geom.right <= 1;
                } else {
                    isExplored = geom.bottom <= 1;
                }
            }

            if (isExplored) {
                lastVisibleIndex = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        let current = lastVisibleIndex >= 0 ? cachedAccumulated[lastVisibleIndex] : 0;

        // Process partial progress inside the active paragraph
        const nextIndex = lastVisibleIndex + 1;
        if (nextIndex < cachedNodes.length) {
            const activeElement = cachedNodes[nextIndex];
            const highlightedSpans = activeElement.querySelectorAll("[class^='ttu-whispersync-line-highlight-']");

            if (highlightedSpans.length > 0) {
                highlightedSpans.forEach(span => {
                    if (span.closest('rt, rp, svg, figcaption, noscript')) return;
                    const rect = span.getBoundingClientRect();
                    let isSpanExplored = false;
                    if (isVerticalText) {
                        if (isPaginated) {
                            isSpanExplored = rect.bottom <= 1;
                        } else {
                            if (writingMode === 'vertical-lr') {
                                isSpanExplored = rect.right <= 1;
                            } else {
                                isSpanExplored = rect.left >= (viewportWidth + 1);
                            }
                        }
                    } else {
                        if (isPaginated) {
                            isSpanExplored = rect.right <= 1;
                        } else {
                            isSpanExplored = rect.bottom <= 1;
                        }
                    }

                    if (isSpanExplored) {
                        const matches = span.textContent?.match(/[\p{L}\p{N}]/gu);
                        if (matches) current += matches.length;
                    }
                });
            } else {
                const textWalker = document.createTreeWalker(activeElement, NodeFilter.SHOW_TEXT);
                let textNode;
                while ((textNode = textWalker.nextNode())) {
                    const parent = textNode.parentElement;
                    if (!parent || parent.closest('rt, rp, svg, figcaption, noscript, .ttu-illustration-container, .ttu-img-container')) {
                        continue;
                    }

                    const nodeRange = document.createRange();
                    nodeRange.selectNodeContents(textNode);
                    const rangeRect = nodeRange.getBoundingClientRect();

                    if (rangeRect.width === 0 || rangeRect.height === 0) continue;

                    let isRangeExplored = false;
                    if (isVerticalText) {
                        if (isPaginated) {
                            isRangeExplored = rangeRect.bottom <= 1;
                        } else {
                            if (writingMode === 'vertical-lr') {
                                isRangeExplored = rangeRect.right <= 1;
                            } else {
                                isRangeExplored = rangeRect.left >= (viewportWidth + 1);
                            }
                        }
                    } else {
                        if (isPaginated) {
                            isRangeExplored = rangeRect.right <= 1;
                        } else {
                            isRangeExplored = rangeRect.bottom <= 1;
                        }
                    }

                    if (isRangeExplored) {
                        const rawText = textNode.nodeValue || '';
                        const matches = rawText.match(/[\p{L}\p{N}]/gu);
                        if (matches) current += matches.length;
                    }
                }
            }
        }

        const total = cachedAccumulated[cachedAccumulated.length - 1] || 0;
        const sectionContainer = readerContainer.querySelector('.book-content-container') || readerContainer;
        const sectionIndex = getSectionIndex(sectionContainer);

        return { current, total, sectionIndex, isPaginated };
    } catch (error) {
        void addDebugLog('ERROR', 'CharExtractor', 'Error extracting character counts', error);
        return null;
    }
}