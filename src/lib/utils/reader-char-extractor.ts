/**
 * Code for calculating the character count inside ttu and all ttu forks
 * Takes whisper ttsu sync and Jiten into account for its calculations
 */

export interface AdvancedCharData {
    current: number;
    total: number;
    sectionIndex: number | null;
    isPaginated: boolean;
    isLayoutDeferred?: boolean;
}

// Module-level caches to optimize execution overhead
const ttuCharCountCache = new WeakMap<Element, number>();

let ttuCachedNodes: Element[] = [];
let ttuCachedAccumulated: number[] = [];

// Module-level cache to track unique section IDs/classes/texts and assign sequential order integers on the fly
const seenSectionKeys = new Map<string, number>();

// Layout and style caches to avoid forced reflows (Layout Thrashing)
let cachedIsVertical = false;
let cachedIsPaginated = false;
let cachedWritingMode = '';
let lastContainer = null as Element | null;
let lastContainerId = '';
let isCacheValid = false;
let cachedSectionIndex = null as number | null;

// Stopped-state cache references
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

    if (id) {
        // Look specifically for paragraph index first to prevent matching the first digit of parent chapter id
        const paragraphMatch = id.match(/paragraph-(\d+)/i) || id.match(/p-(\d+)/i);
        if (paragraphMatch) {
            const parsed = parseInt(paragraphMatch[1], 10);
            return parsed;
        }

        // Standard sequence tracking prefixes
        const ttuIdMatch = id.match(/ttu-id-(?:chapter-)?(\d+)/i);
        if (ttuIdMatch) {
            const parsed = parseInt(ttuIdMatch[1], 10);
            return parsed;
        }

        const trailingMatch = id.match(/(\d+)$/);
        if (trailingMatch) {
            const parsed = parseInt(trailingMatch[1], 10);
            return parsed;
        }

        const fallbackMatch = id.match(/\d+/);
        if (fallbackMatch) {
            const parsed = parseInt(fallbackMatch[0], 10);
            return parsed;
        }
    }

    // Approach 3 (SPA Fallback): Generate a guaranteed unique key using parent URL and first paragraph text.
    if (typeof window !== 'undefined') {
        let parentUrl = '';
        try {
            if (window.top && window.top.location) {
                parentUrl = window.top.location.href;
            }
        } catch (e) {
            parentUrl = window.location.href;
        }

        const firstP = container.querySelector('p, h1, h2, h3, h4, h5, h6, li');
        const textSignature = firstP ? (firstP.textContent || '').trim().slice(0, 120) : '';
        
        const firstChild = container.firstElementChild;
        const childSignature = firstChild ? firstChild.tagName + '||' + firstChild.className : '';

        const chapterKey = parentUrl + '||' + textSignature + '||' + childSignature;

        if (!seenSectionKeys.has(chapterKey)) {
            const nextVal = seenSectionKeys.size;
            seenSectionKeys.set(chapterKey, nextVal);
        }
        const idx = seenSectionKeys.get(chapterKey) ?? 0;
        return idx;
    }

    return 0;
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
                    
                    const stack: HTMLElement[] = [node as HTMLElement];
                    while (stack.length > 0) {
                        const el = stack.pop()!;
                        
                        if (isJitenOrYomichan(el)) continue;

                        const tag = el.tagName;
                        if (isBlockTag(tag)) {
                            if (el.id === 'nt-ttu-chrono-wrapper' || el.closest('#nt-ttu-chrono-wrapper')) {
                                continue;
                            }
                            return true;
                        }

                        const children = el.children;
                        for (let j = children.length - 1; j >= 0; j--) {
                            const child = children[j];
                            if (child.nodeType === Node.ELEMENT_NODE) {
                                stack.push(child as HTMLElement);
                            }
                        }
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

export function clearExtractorCache() {
    ttuCachedNodes.length = 0;
    ttuCachedNodes = [];
    ttuCachedAccumulated = [];
    isCacheValid = false;
    lastContainer = null;
    lastContainerId = '';
    lastCachedTotal = 0;
    lastCachedSectionIndex = null;
    cachedSectionIndex = null;
    if (containerObserver) {
        containerObserver.disconnect();
        containerObserver = null;
    }
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
            ttuCachedNodes.length = 0;
            ttuCachedNodes = [];
            ttuCachedAccumulated = [];
            watchContainerMutations(readerContainer);
        }

        // Dynamic Mode Change Guard: Check if paginated classes or styles changed in DOM
        let pagStyle = false;
        let currentEl: Element | null = activeContainer;
        while (currentEl && currentEl !== document.body) {
            const elStyle = getComputedStyle(currentEl);
            const cw = elStyle.columnWidth || '';
            const cc = elStyle.columnCount || '';
            if ((cw !== 'auto' && cw !== 'none' && cw !== '') ||
                (cc !== 'auto' && cc !== 'none' && cc !== '')) {
                pagStyle = true;
                break;
            }
            currentEl = currentEl.parentElement;
        }

        const hasPaginatedClass = !!(
            document.querySelector('[class*="paginated"], [id*="paginated"], [data-view-mode="paginated"]') ||
            document.querySelector('.book-reader-paginated') ||
            activeContainer.closest('.book-reader-paginated, [data-view-mode="paginated"]') ||
            pagStyle
        );
        if (hasPaginatedClass !== cachedIsPaginated) {
            isCacheValid = false;
        }

        // 1. Resolve Style Configurations and Section Index (Cached)
        if (!isCacheValid) {
            const style = getComputedStyle(activeContainer);
            cachedWritingMode = style.writingMode || '';
            cachedIsVertical =
                cachedWritingMode === 'vertical-rl' ||
                cachedWritingMode === 'vertical-lr' ||
                readerContainer.classList.contains('book-content--writing-vertical-rl');

            cachedIsPaginated =
                !!document.querySelector('[class*="paginated"], [id*="paginated"], [data-view-mode="paginated"]') ||
                !!document.querySelector('.book-reader-paginated') ||
                !!readerContainer.closest('.book-reader-paginated, [data-view-mode="paginated"]') ||
                pagStyle;

            cachedSectionIndex = getSectionIndex(activeContainer);
        }

        const sectionIndex = cachedSectionIndex;
        lastCachedSectionIndex = sectionIndex;

        // 2. Query Text-bearing Nodes
        let pTags = ttuCachedNodes;
        if (!isCacheValid) {
            pTags = Array.from(readerContainer.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')).filter(el => {
                if (el.closest('#nt-ttu-chrono-wrapper, nav, .menu, header')) return false;
                return (el.textContent || '').trim().length > 0;
            }) as Element[];
        }

        if (pTags.length === 0) {
            // Differentiate temporary loading unmounts from permanent cover/illustration pages.
            // If the reader container contains images, the layout is not deferred, allowing transitions to process.
            const activeReaderContainer = document.querySelector('.reader-container, .book-content-container, #reader-container, .reader-wrapper') || readerContainer;
            const hasImages = !!activeReaderContainer.querySelector('img, image, svg, canvas, picture, [class*="illust"], [class*="image"], [class*="img"]');
            const isDeferred = !hasImages;

            console.log(`[NT DEBUG extractor] pTags=0 → DEFERRED=${isDeferred} | sectionIndex=${sectionIndex} isPaginated=${cachedIsPaginated}`);
            return { current: 0, total: 0, sectionIndex, isPaginated: cachedIsPaginated, isLayoutDeferred: isDeferred };
        }

        // Layout Stability Guard: If layout is not loaded, defer transition processing
        const firstParagraph = pTags[0];
        const firstParaRect = firstParagraph ? firstParagraph.getBoundingClientRect() : null;
        if (firstParaRect && firstParaRect.width === 0 && firstParaRect.height === 0) {
            return { current: 0, total: lastCachedTotal, sectionIndex, isPaginated: cachedIsPaginated, isLayoutDeferred: true };
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
                    // Allocation-free character counter loop replacing standard match checks
                    let matchCount = 0;
                    JP_CHAR_PATTERN.lastIndex = 0;
                    while (JP_CHAR_PATTERN.exec(text) !== null) {
                        matchCount++;
                    }
                    count = matchCount;
                    ttuCharCountCache.set(el, count);
                }
                acc += count;
                ttuCachedAccumulated[i] = acc;
            }
            isCacheValid = true;
        }

        const total = ttuCachedAccumulated[ttuCachedAccumulated.length - 1] || 0;
        lastCachedTotal = total;

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
                    explored = r.bottom <= 0.5;
                } else {
                    if (cachedWritingMode === 'vertical-lr') {
                        explored = r.right <= 0.5;
                    } else {
                        explored = r.left >= (cachedVw + 0.5);
                    }
                }
            } else {
                if (cachedIsPaginated) {
                    explored = r.right <= 0.5;
                } else {
                    explored = r.bottom <= 0.5;
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
                        needsSubParagraphTracking = r.left < -0.5;
                    } else {
                        needsSubParagraphTracking = r.right > (cachedVw + 0.5);
                    }
                } else {
                    needsSubParagraphTracking = r.top < -0.5;
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
                                sExp = sr.bottom <= 0.5;
                            } else {
                                if (cachedWritingMode === 'vertical-rl') {
                                    sExp = sr.left >= (cachedVw + 0.5);
                                } else {
                                    sExp = sr.right <= 0.5;
                                }
                            }
                        } else {
                            if (cachedIsPaginated) {
                                sExp = sr.right <= 0.5;
                            } else {
                                sExp = sr.bottom <= 0.5;
                            }
                        }

                        if (sExp) {
                            const content = s.textContent || '';
                            let matchCount = 0;
                            JP_CHAR_PATTERN.lastIndex = 0;
                            while (JP_CHAR_PATTERN.exec(content) !== null) {
                                matchCount++;
                            }
                            current += matchCount;
                        }
                    });
                } else {
                    // Fallback to text node precision tracking when highlights are absent
                    const walker = document.createTreeWalker(activeEl, NodeFilter.SHOW_TEXT);
                    let n;

                    if (!reusableRange && typeof document !== 'undefined') {
                        reusableRange = document.createRange();
                    }

                    // Node limit removed to ensure 100% accuracy on extremely long web novel paragraphs
                    while ((n = walker.nextNode())) {
                        const parent = n.parentElement;
                        if (!parent || shouldIgnoreNode(parent)) {
                            continue;
                        }

                        const text = n.nodeValue || '';
                        if (!text.trim()) {
                            continue;
                        }
                        JP_CHAR_PATTERN.lastIndex = 0;
                        if (!JP_CHAR_PATTERN.test(text)) {
                            continue;
                        }

                        let sExp = false;
                        // Goal 1 Optimization: Measure parent bounding box directly to bypass DOM range creation
                        if (parent.tagName === 'SPAN' || parent.tagName === 'RUBY' || parent.tagName === 'RT') {
                            const nr = parent.getBoundingClientRect();
                            if (nr.width > 0 && nr.height > 0) {
                                if (cachedIsVertical) {
                                    if (cachedIsPaginated) {
                                        sExp = nr.bottom <= 0.5;
                                    } else {
                                        if (cachedWritingMode === 'vertical-rl') {
                                            sExp = nr.left >= (cachedVw + 0.5);
                                        } else {
                                            sExp = nr.right <= 0.5;
                                        }
                                    }
                                } else {
                                    if (cachedIsPaginated) {
                                        sExp = nr.right <= 0.5;
                                    } else {
                                        sExp = nr.bottom <= 0.5;
                                    }
                                }
                            }
                        } else if (reusableRange) {
                            reusableRange.selectNodeContents(n);
                            const nr = reusableRange.getBoundingClientRect();

                            if (nr.width === 0 || nr.height === 0) continue;

                            if (cachedIsVertical) {
                                if (cachedIsPaginated) {
                                    sExp = nr.bottom <= 0.5;
                                } else {
                                    if (cachedWritingMode === 'vertical-rl') {
                                        sExp = nr.left >= (cachedVw + 0.5);
                                    } else {
                                        sExp = nr.right <= 0.5;
                                    }
                                }
                            } else {
                                if (cachedIsPaginated) {
                                    sExp = nr.right <= 0.5;
                                } else {
                                    sExp = nr.bottom <= 0.5;
                                }
                            }
                        }

                        if (sExp) {
                            let matchCount = 0;
                            JP_CHAR_PATTERN.lastIndex = 0;
                            while (JP_CHAR_PATTERN.exec(text) !== null) {
                                matchCount++;
                            }
                            current += matchCount;
                        }
                    }
                }
            }
        }

        console.log(`[NT DEBUG extractor] pTags=${ttuCachedNodes.length} current=${current} total=${total} sectionIndex=${sectionIndex} isPag=${cachedIsPaginated}`);
        return { current, total, sectionIndex, isPaginated: cachedIsPaginated };
    } catch (e) {
        console.error(`[NT Extractor] Fatal crash in character extraction:`, e);
        return null;
    }
}
