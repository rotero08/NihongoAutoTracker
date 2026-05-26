/**
 * ── TTU Reader Chronometer UI Controller ─────────────────────────────────────
 * 
 * Manages the initialization, visual rendering, and event handlers of the 
 * in-reader tracking dropdown menu. Integrates AniList media searching, book 
 * linking, session timing, local queue synchronisation, and manual logging.
 */

import { searchAniList } from '@/lib/api/anilist';
import { submitLog } from '@/lib/api/nihongotracker';
import { readingQueueStorage } from '@/lib/storage/queues';
import { ttuHistoryStorage, ttuLinkStorage } from '@/lib/storage/ttu';
import { fmt } from '@/lib/utils/time';
import { showToast } from '@/lib/utils/toast';
import { injectTTUStyles } from './reader-overlay';

/**
 * Initializes and mounts the TTU chronometer UI toolbar and its dropdown menu.
 * 
 * @param pt - Injection target element and position
 * @param ttuState - Reactive proxy object containing current session state
 * @param stateRefs - Reference tracking parameters for sessions and characters
 * @param helpers - Helper utilities delegated from the text-tracker content script
 */
export function setupTTUChronometerUI(
    pt: { el: Element; pos: InsertPosition },
    ttuState: any,
    stateRefs: {
        globalSessionStartChar: number;
        globalManualCharOffset: number;
        globalLastTick: number;
        lastSectionIndex: number;
        lastSectionTotal: number;
        visitedSections: Map<number, number>;
    },
    helpers: {
        getTTUTitle: () => string;
        parseTitleWithConfig: (t: string) => { query: string; volume?: number };
        extractTTUCharCount: () => number | null;
        getReaderName: () => string;
        getCurrentReaderConfig: () => any;
        liveSyncQueue: () => Promise<void>;
        saveSessionAndQueue: () => Promise<void>;
    }
) {
    // Inject stylesheet definitions once into the document head
    injectTTUStyles();

    // Clean up any stale wrappers to prevent duplicate controls
    const oldWrapper = document.getElementById('nt-ttu-chrono-wrapper');
    if (oldWrapper) oldWrapper.remove();

    const wrapper = document.createElement('div');
    wrapper.id = 'nt-ttu-chrono-wrapper';

    wrapper.innerHTML = `
  <button id="nt-ttu-chrono-btn" title="Click to open Tracker Menu or Double Click to toggle Tracker">
    <svg viewBox="0 0 24 24"><path id="nt-ttu-main-icon-path" d="M8 5v14l11-7z"/></svg>
  </button>
  <div id="nt-ttu-dropdown">
    <div class="nt-ttu-dd-section">
      <div class="nt-ttu-dd-title">Current Session</div>
      <div class="nt-ttu-stats-row">
        <div class="nt-ttu-stat"><span class="nt-ttu-stat-label">Time</span><span class="nt-ttu-stat-val" id="nt-ttu-val-time" title="Edit">0:00</span></div>
        <div class="nt-ttu-stat"><span class="nt-ttu-stat-label">Chars</span><span class="nt-ttu-stat-val" id="nt-ttu-val-chars" title="Edit">0</span></div>
        <div class="nt-ttu-stat"><span class="nt-ttu-stat-label">Speed</span><span class="nt-ttu-stat-val no-hover" id="nt-ttu-val-speed">0 c/m</span></div>
      </div>
      <div class="nt-ttu-controls">
        <button class="nt-ttu-btn-icon" id="nt-ttu-btn-toggle" title="Play/Pause"><svg viewBox="0 0 24 24"><path id="nt-ttu-play-path" d="M8 5v14l11-7z"/></svg></button>
        <button class="nt-ttu-btn-icon" id="nt-ttu-btn-reset" title="Reset Session"><svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
        <button class="nt-ttu-btn-icon primary" id="nt-ttu-btn-log" title="Save & Queue"><svg viewBox="0 0 24 24"><path d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg></button>
        <button class="nt-ttu-btn-icon primary" id="nt-ttu-btn-direct" title="Match media to send directly" disabled style="opacity: 0.3; cursor: not-allowed;"><svg style="width: 16px; height: 16px;" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
        <button class="nt-ttu-btn-icon" id="nt-ttu-btn-settings" title="Open Tracker Settings"><svg viewBox="0 0 24 24" fill="currentColor" style="width: 15px; height: 15px;"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg></button>
      </div>
      <div class="nt-ttu-linker" id="nt-ttu-linker-sec">
        <div class="nt-ttu-link-compact" id="nt-ttu-link-compact" style="display:none">
          <div class="nt-ttu-link-compact-inner" id="nt-ttu-link-label-wrap" title="Click to edit">
            <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg><span id="nt-ttu-link-label">Linked to AniList</span>
          </div>
          <button type="button" id="nt-ttu-vol-pill" class="nt-ttu-vol-pill" title="Volume">Vol 1</button>
          <button id="nt-ttu-unlink-btn" class="nt-ttu-unlink-btn" title="Unlink Media"><svg style="width:12px; height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
        <div class="nt-ttu-link-edit" id="nt-ttu-link-edit">
          <div class="nt-ttu-link-edit-row">
            <div class="nt-ttu-link-wrap">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input type="text" id="nt-ttu-link-input" class="nt-ttu-link-input" placeholder="Search AniList..." spellcheck="false" autocomplete="off"/>
            </div>
            <div class="nt-ttu-link-vol-anchor" id="nt-ttu-vol-anchor"></div>
          </div>
          <div class="nt-ttu-link-results" id="nt-ttu-link-results"></div>
        </div>
      </div>
    </div>
    <div class="nt-ttu-dd-section" style="border-top: 1px solid var(--nt-border); background: rgba(0,0,0,0.2);">
      <div class="nt-ttu-dd-title">Total Book Progress</div>
      <div class="nt-ttu-stats-row" style="margin-bottom:0;">
        <div class="nt-ttu-stat"><span class="nt-ttu-stat-label">Total Time</span><span class="nt-ttu-stat-val no-hover" id="nt-ttu-total-time" style="color:var(--nt-accent);">0m</span></div>
        <div class="nt-ttu-stat"><span class="nt-ttu-stat-label">Total Chars</span><span class="nt-ttu-stat-val no-hover" id="nt-ttu-total-chars" style="color:var(--nt-accent);">0</span></div>
        <div class="nt-ttu-stat"><span class="nt-ttu-stat-label">Avg Speed</span><span class="nt-ttu-stat-val no-hover" id="nt-ttu-total-speed" style="color:var(--nt-accent);">0/h</span></div>
      </div>
    </div>
    <details class="nt-ttu-history" id="nt-ttu-history-wrap">
      <summary>Past Sessions History</summary>
      <div class="nt-ttu-history-list" id="nt-ttu-history-list"></div>
    </details>
  </div>
  `;

    // Prevent interactions within the panel from bubbling up and triggering book pages flipping
    wrapper.addEventListener('click', e => e.stopPropagation());
    wrapper.addEventListener('dblclick', e => e.stopPropagation());
    const dropdown = wrapper.querySelector('#nt-ttu-dropdown')!;
    dropdown.addEventListener('click', e => e.stopPropagation());

    // UI Element Query Bindings
    const btn = wrapper.querySelector('#nt-ttu-chrono-btn')!;
    const toggleBtn = wrapper.querySelector('#nt-ttu-btn-toggle')!;
    const timeVal = wrapper.querySelector('#nt-ttu-val-time')!;
    const charsVal = wrapper.querySelector('#nt-ttu-val-chars')!;
    const speedVal = wrapper.querySelector('#nt-ttu-val-speed')!;
    const totalSpeedVal = wrapper.querySelector('#nt-ttu-total-speed')!;
    const btnLog = wrapper.querySelector('#nt-ttu-btn-log') as HTMLButtonElement;
    const btnDirect = wrapper.querySelector('#nt-ttu-btn-direct') as HTMLButtonElement;
    const btnSettings = wrapper.querySelector('#nt-ttu-btn-settings') as HTMLButtonElement;

    const linkerCompact = wrapper.querySelector('#nt-ttu-link-compact') as HTMLElement;
    const linkerLabelWrap = wrapper.querySelector('#nt-ttu-link-label-wrap') as HTMLElement;
    const linkerEdit = wrapper.querySelector('#nt-ttu-link-edit') as HTMLElement;
    const linkLabel = wrapper.querySelector('#nt-ttu-link-label') as HTMLElement;
    const linkInput = wrapper.querySelector('#nt-ttu-link-input') as HTMLInputElement;
    const linkResults = wrapper.querySelector('#nt-ttu-link-results') as HTMLElement;
    const volPill = wrapper.querySelector('#nt-ttu-vol-pill') as HTMLButtonElement;
    const volAnchor = wrapper.querySelector('#nt-ttu-vol-anchor') as HTMLElement;

    // Isolate mouse event bubbling inside search lists
    linkResults.addEventListener('mousedown', e => e.preventDefault());
    linkResults.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
    ['keydown', 'keyup', 'keypress'].forEach(evt => linkInput.addEventListener(evt, e => e.stopPropagation()));

    const historyList = wrapper.querySelector('#nt-ttu-history-list') as HTMLElement;
    if (historyList) historyList.addEventListener('wheel', e => e.stopPropagation(), { passive: true });

    let cachedHistoryMins = 0;
    let cachedHistoryChars = 0;

    // Fallback baseline initialization
    if (stateRefs.globalSessionStartChar === -1) {
        stateRefs.globalSessionStartChar = helpers.extractTTUCharCount() || 0;
    }

    const escapeHtml = (unsafe: string) => (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;");

    /**
     * Re-renders the media linking area based on active custom links in storage.
     */
    const refreshLinkerUI = async (force = false) => {
        if (!force && document.activeElement === linkInput) {
            return;
        }

        const title = helpers.getTTUTitle();
        const links = await ttuLinkStorage.getValue() || {};
        const match = links[title];
        const rCfg = helpers.getCurrentReaderConfig();
        const hideUnavailable = rCfg.hideUnavailableActions;

        if (match && match.mediaId) {
            linkerEdit.style.display = 'none';
            linkerCompact.style.display = 'flex';
            linkLabel.textContent = match.mediaData.contentTitleNative || 'Linked';
            linkInput.value = match.mediaData.contentTitleNative || helpers.parseTitleWithConfig(title).query;

            const v = Math.max(1, Number(match.volume || 1));
            volPill.textContent = `Vol ${v}`;

            const unlinkBtn = linkerCompact.querySelector('#nt-ttu-unlink-btn');
            if (unlinkBtn && volPill.parentElement !== linkerCompact) {
                linkerCompact.insertBefore(volPill, unlinkBtn);
            }

            // Adjust active direct-send visual layouts
            if (rCfg.directSend) {
                btnDirect.style.display = '';
                btnDirect.disabled = false;
                btnDirect.style.opacity = '1';
                btnDirect.style.cursor = 'pointer';
                btnDirect.title = 'Send session to NT directly';
            } else {
                if (hideUnavailable) {
                    btnDirect.style.display = 'none';
                } else {
                    btnDirect.style.display = '';
                    btnDirect.disabled = true;
                    btnDirect.style.opacity = '0.3';
                    btnDirect.style.cursor = 'not-allowed';
                    btnDirect.title = 'Direct send disabled in settings';
                }
            }
        } else {
            linkerEdit.style.display = 'flex';
            linkerCompact.style.display = 'none';
            linkInput.value = helpers.parseTitleWithConfig(title).query;

            const { volume } = helpers.parseTitleWithConfig(title);
            const v = Math.max(1, Number(volume || Number((volPill.textContent || '').replace(/\D/g, '')) || 1));
            volPill.textContent = `Vol ${v}`;

            if (volAnchor && volPill.parentElement !== volAnchor) {
                volAnchor.appendChild(volPill);
            }

            if (hideUnavailable) {
                btnDirect.style.display = 'none';
            } else {
                btnDirect.style.display = '';
                btnDirect.disabled = true;
                btnDirect.style.opacity = '0.3';
                btnDirect.style.cursor = 'not-allowed';
                btnDirect.title = 'Match media to send directly';
            }
        }
    };

    const getVolFromPill = () => {
        const n = Number((volPill.textContent || '').replace(/\D/g, ''));
        return Math.max(1, Number.isFinite(n) && n > 0 ? n : 1);
    };

    // Volume input transition commit
    volPill.addEventListener('click', async (e) => {
        e.stopPropagation();
        if ((volPill as any)._editing) return;
        (volPill as any)._editing = true;

        const current = getVolFromPill();
        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.className = 'nt-ttu-vol-input';
        input.value = String(current);

        volPill.style.display = 'none';
        volPill.insertAdjacentElement('afterend', input);
        input.focus();
        input.select();

        const cleanup = () => {
            input.remove();
            volPill.style.display = '';
            (volPill as any)._editing = false;
        };

        const commit = async () => {
            const next = Math.max(1, Number(String(input.value || '').replace(/\D/g, '')) || 1);
            volPill.textContent = `Vol ${next}`;
            const title = helpers.getTTUTitle();
            const links = await ttuLinkStorage.getValue() || {};

            if (links[title]) {
                links[title].volume = next;
                await ttuLinkStorage.setValue(links);
            }

            const queue = await readingQueueStorage.getValue();
            const existing = queue.find((q: any) => q.originalTitle === title || q.contentTitleNative === title);
            if (existing) {
                existing.volume = next;
                await readingQueueStorage.setValue(queue);
            }
        };

        input.addEventListener('keydown', (ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') {
                ev.preventDefault();
                void commit().finally(cleanup);
            }
            if (ev.key === 'Escape') {
                ev.preventDefault();
                cleanup();
            }
        });
        input.addEventListener('blur', () => {
            void commit().finally(cleanup);
        });
    });

    linkerLabelWrap.addEventListener('click', () => {
        linkerCompact.style.display = 'none';
        linkerEdit.style.display = 'flex';
        if (volAnchor && volPill.parentElement !== volAnchor) {
            volAnchor.appendChild(volPill);
        }
        linkInput.focus();
    });

    wrapper.querySelector('#nt-ttu-unlink-btn')!.addEventListener('click', async (e) => {
        e.stopPropagation();
        const title = helpers.getTTUTitle();
        const links = await ttuLinkStorage.getValue() || {};
        delete links[title];
        await ttuLinkStorage.setValue(links);

        const queue = await readingQueueStorage.getValue();
        const existing = queue.find(q => q.originalTitle === title || q.contentTitleNative === title);
        if (existing) {
            existing.mediaId = 'web-reading';
            existing.mediaData = undefined;
            await readingQueueStorage.setValue(queue);
        }
        refreshLinkerUI(true);
    });

    let linkDebounce: any;
    const performLinkSearch = () => {
        clearTimeout(linkDebounce);
        const query = linkInput.value.trim();
        if (query.length < 2) {
            linkResults.classList.remove('open');
            return;
        }

        linkDebounce = setTimeout(async () => {
            linkResults.innerHTML = '<div style="padding:4px;text-align:center;font-size:10px;color:#aaa">Searching...</div>';
            linkResults.classList.add('open');

            try {
                const results = await searchAniList(query, 5);

                if (results.length === 0) {
                    linkResults.innerHTML = '<div style="padding:4px;text-align:center;font-size:10px;color:#aaa">No results found</div>';
                    return;
                }

                linkResults.innerHTML = '';
                results.forEach((m: any) => {
                    const row = document.createElement('div');
                    row.className = 'nt-ttu-link-item';
                    const native = m.title?.contentTitleNative || m.contentTitleNative || 'Unknown';
                    const img = m.coverImage || m.contentImage || '';

                    row.innerHTML = `
        ${img ? `<img class="nt-ttu-link-cover" src="${img}" />` : `<div class="nt-ttu-link-cover" style="background:#444"></div>`}
        <div class="nt-ttu-link-info"><div class="nt-ttu-link-t">${escapeHtml(native)}</div></div>
        `;

                    row.addEventListener('click', async () => {
                        const title = helpers.getTTUTitle();
                        const { volume } = helpers.parseTitleWithConfig(title);
                        const selectedVolume = Math.max(1, getVolFromPill() || volume || 1);
                        volPill.textContent = `Vol ${selectedVolume}`;

                        const links = await ttuLinkStorage.getValue() || {};
                        links[title] = {
                            mediaId: m.contentId,
                            volume: selectedVolume,
                            mediaData: {
                                contentId: m.contentId,
                                contentTitleNative: native,
                                contentTitleEnglish: m.title?.contentTitleEnglish || m.contentTitleEnglish || '',
                                contentTitleRomaji: m.title?.contentTitleRomaji || m.contentTitleRomaji,
                                contentImage: img,
                                coverImage: img,
                                chapters: m.textChapters || m.chapters,
                                volumes: m.volumes,
                            }
                        };
                        await ttuLinkStorage.setValue(links);

                        const queue = await readingQueueStorage.getValue();
                        const existing = queue.find(q => q.originalTitle === title || q.contentTitleNative === title);
                        if (existing) {
                            existing.mediaId = m.contentId;
                            existing.volume = selectedVolume;
                            existing.mediaData = links[title].mediaData;
                            existing.contentTitleNative = native;
                            existing.contentTitleEnglish = m.title?.contentTitleEnglish || m.contentTitleEnglish || '';
                            existing.description = native;
                            await readingQueueStorage.setValue(queue);
                        }

                        linkResults.classList.remove('open');
                        linkInput.blur();
                        refreshLinkerUI(true);

                        if (ttuState.timeMs > 0 || ttuState.chars > 0) {
                            helpers.liveSyncQueue();
                        }
                    });
                    linkResults.appendChild(row);
                });
            } catch {
                linkResults.innerHTML = '<div style="padding:4px;text-align:center;font-size:10px;color:#f0706a">Search failed</div>';
            }
        }, 400);
    };

    linkInput.addEventListener('input', performLinkSearch);
    linkInput.addEventListener('focus', () => {
        if (linkInput.value.trim().length >= 2 && linkResults.children.length > 0) {
            linkResults.classList.add('open');
        } else {
            performLinkSearch();
        }
    });
    linkInput.addEventListener('blur', () => {
        setTimeout(() => {
            linkResults.classList.remove('open');
            refreshLinkerUI();
        }, 200);
    });

    /**
     * Refreshes the local history logs listing for this book.
     */
    const updateHistoryData = async () => {
        const history = await ttuHistoryStorage.getValue() || {};
        const sessions = history[helpers.getTTUTitle()] || [];

        cachedHistoryMins = sessions.reduce((acc: any, s: any) => acc + Math.round(s.timeMs / 60000), 0);
        cachedHistoryChars = sessions.reduce((acc: any, s: any) => acc + s.chars, 0);

        const listEl = wrapper.querySelector('#nt-ttu-history-list')!;
        if (sessions.length === 0) {
            listEl.innerHTML = '<div style="color:#777;text-align:center;padding:12px;">No past sessions yet</div>';
        } else {
            let html = '';
            [...sessions].reverse().forEach((s: any) => {
                const mins = Math.max(1, Math.round(s.timeMs / 60000));
                const d = new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                html += `<div class="nt-ttu-history-item" data-session-id="${s.id}"><span>${d}</span><span>${mins}m</span><span>${s.chars} chars</span><button class="nt-ttu-history-del" title="Delete session">×</button></div>`;
            });
            listEl.innerHTML = html;

            listEl.querySelectorAll('.nt-ttu-history-del').forEach((btn) => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const row = (e.currentTarget as HTMLElement).closest('.nt-ttu-history-item') as HTMLElement | null;
                    const sessionId = row?.dataset.sessionId;
                    if (!sessionId) return;

                    const currentTitle = helpers.getTTUTitle();
                    const historyNow = await ttuHistoryStorage.getValue() || {};
                    const curr = historyNow[currentTitle] || [];
                    historyNow[currentTitle] = curr.filter((s: any) => s.id !== sessionId);
                    await ttuHistoryStorage.setValue(historyNow);

                    const q = await readingQueueStorage.getValue();
                    const filtered = q.filter((item: any) => !((item.sessions || []).some((s: any) => s.id !== sessionId)));
                    if (filtered.length !== q.length) {
                        await readingQueueStorage.setValue(filtered);
                    }

                    await updateHistoryData();
                    updateUI();
                });
            });
        }
    };

    /**
     * Synchronizes and repaints general stats metrics in the dropdown dashboard.
     */
    const updateUI = () => {
        if (timeVal.tagName !== 'INPUT') timeVal.textContent = fmt(ttuState.timeMs);
        if (charsVal.tagName !== 'INPUT') charsVal.textContent = ttuState.chars.toString();

        const totalMins = cachedHistoryMins + Math.floor(ttuState.timeMs / 60000);
        const totalChars = cachedHistoryChars + ttuState.chars;
        const sessSpeed = ttuState.timeMs > 0 ? Math.round((ttuState.chars / (ttuState.timeMs / 60000)) * 60) : 0;
        const totSpeed = totalMins > 0 ? Math.round((totalChars / totalMins) * 60) : 0;

        speedVal.textContent = sessSpeed + '/h';
        totalSpeedVal.textContent = totSpeed + '/h';
        wrapper.querySelector('#nt-ttu-total-time')!.textContent = totalMins + 'm';
        wrapper.querySelector('#nt-ttu-total-chars')!.textContent = totalChars.toString();

        const pauseSvg = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';
        const playSvg = 'M8 5v14l11-7z';
        const playPath = toggleBtn.querySelector('#nt-ttu-play-path');
        const mainIconPath = btn.querySelector('#nt-ttu-main-icon-path');

        if (playPath) {
            playPath.setAttribute('d', ttuState.running ? pauseSvg : playSvg);
            toggleBtn.setAttribute('title', ttuState.running ? 'Pause Timer' : 'Start Timer');
        }
        if (mainIconPath) {
            mainIconPath.setAttribute('d', ttuState.running ? pauseSvg : playSvg);
        }

        const rCfg = helpers.getCurrentReaderConfig();
        const hideUnavailable = rCfg.hideUnavailableActions;

        if (rCfg.autoSave !== false) {
            if (hideUnavailable) {
                btnLog.style.display = 'none';
            } else {
                btnLog.style.display = '';
                btnLog.disabled = true;
                btnLog.style.opacity = '0.3';
                btnLog.style.cursor = 'not-allowed';
                btnLog.title = 'Auto-sync is enabled (Sends automatically via Settings Queue)';
            }
        } else {
            btnLog.style.display = '';
            btnLog.disabled = false;
            btnLog.style.opacity = '1';
            btnLog.style.cursor = 'pointer';
            btnLog.title = 'Save & Queue';
        }
    };

    /**
     * Converts simple text nodes to editable numerical form fields on click.
     */
    const makeEditable = (el: Element, isTime: boolean) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const input = document.createElement('input');
            input.type = 'text';
            input.value = isTime ? fmt(ttuState.timeMs) : ttuState.chars.toString();

            Object.assign(input.style, {
                width: '100%',
                textAlign: 'center',
                background: '#1a1a1a',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '4px',
                padding: '2px 4px',
                fontFamily: 'monospace',
                fontSize: '14px',
                boxSizing: 'border-box'
            });

            const commit = () => {
                if (isTime) {
                    const parts = input.value.split(':').map(Number);
                    let ms = -1;
                    if (!parts.some(isNaN)) {
                        if (parts.length === 1) ms = parts[0] * 60 * 1000;
                        else if (parts.length === 2) ms = (parts[0] * 60 + parts[1]) * 1000;
                        else if (parts.length === 3) ms = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
                    }
                    if (ms >= 0) ttuState.timeMs = ms;
                } else {
                    const val = parseInt(input.value.replace(/\D/g, ''));
                    if (!isNaN(val) && val >= 0) {
                        const currentCount = helpers.extractTTUCharCount() || 0;
                        let diff = currentCount - (stateRefs.globalSessionStartChar !== -1 ? stateRefs.globalSessionStartChar : 0);
                        if (diff < 0) diff = 0;
                        stateRefs.globalManualCharOffset = val - diff;
                        ttuState.chars = val;
                    }
                }
                input.replaceWith(el);
                updateUI();
            };
            input.addEventListener('blur', commit);
            input.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') input.blur();
            });
            el.replaceWith(input);
            input.focus();
            input.select();
        });
    };

    makeEditable(timeVal, true);
    makeEditable(charsVal, false);

    // Dropdown open/close trigger hook
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
        if (dropdown.classList.contains('open')) {
            await updateHistoryData();
            await refreshLinkerUI();
        }
        updateUI();
    });

    btn.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();
        ttuState.running = !ttuState.running;
        if (ttuState.running) {
            const currentCount = helpers.extractTTUCharCount();
            if (currentCount !== null) {
                stateRefs.globalSessionStartChar = currentCount - (ttuState.chars - stateRefs.globalManualCharOffset);
            }
            stateRefs.globalLastTick = Date.now();
        }
        updateUI();
    });

    // Close dropdown on outside page clicks
    document.addEventListener('click', (e) => {
        if (!e.composedPath().includes(wrapper)) {
            dropdown.classList.remove('open');
        }
    });

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        ttuState.running = !ttuState.running;
        if (ttuState.running) {
            const currentCount = helpers.extractTTUCharCount();
            if (currentCount !== null) {
                stateRefs.globalSessionStartChar = currentCount - (ttuState.chars - stateRefs.globalManualCharOffset);
            }
            stateRefs.globalLastTick = Date.now();
        }
        updateUI();
    });

    wrapper.querySelector('#nt-ttu-btn-reset')!.addEventListener('click', (e) => {
        e.stopPropagation();
        ttuState.timeMs = 0;
        ttuState.chars = 0;
        const currentCount = helpers.extractTTUCharCount();
        stateRefs.globalSessionStartChar = currentCount !== null ? currentCount : -1;
        stateRefs.globalManualCharOffset = 0;

        // Reset transition states to prevent old visited section offsets from corrupting the new session
        stateRefs.lastSectionIndex = -1;
        stateRefs.lastSectionTotal = 0;
        stateRefs.visitedSections.clear();

        updateUI();
    });

    let isProcessingLog = false;
    btnLog.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (helpers.getCurrentReaderConfig().autoSave !== false) return;
        if (isProcessingLog) return;

        isProcessingLog = true;
        btnLog.style.opacity = '0.3';
        btnLog.style.cursor = 'wait';

        try {
            await helpers.saveSessionAndQueue();
            await updateHistoryData();
        } finally {
            isProcessingLog = false;
            updateUI();
        }
    });

    let isProcessingDirect = false;
    btnDirect.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (ttuState.timeMs === 0 && ttuState.chars === 0) return;
        if (isProcessingDirect) return;

        const title = helpers.getTTUTitle();
        const links = await ttuLinkStorage.getValue() || {};
        const linkedMedia = links[title];
        if (!linkedMedia) return;

        isProcessingDirect = true;
        btnDirect.style.opacity = '0.3';
        btnDirect.style.cursor = 'wait';

        const secs = Math.round(ttuState.timeMs / 1000);
        const minutes = Math.max(1, Math.round(secs / 60));
        try {
            const ok = await submitLog({
                type: 'reading',
                mediaId: linkedMedia.mediaId,
                mediaData: linkedMedia.mediaData,
                description: linkedMedia.mediaData.contentTitleNative || title,
                chars: ttuState.chars,
                time: minutes,
                date: new Date().toISOString(),
                episodes: 0,
                pages: 0,
                volume: linkedMedia.volume || 1,
                private: false,
                tags: []
            });
            if (!ok) return;

            const dateStr = new Date().toISOString();
            const sessionLog = { id: ttuState.id, date: dateStr, timeMs: ttuState.timeMs, chars: ttuState.chars };
            const history = await ttuHistoryStorage.getValue() || {};
            if (!history[title]) history[title] = [];
            history[title].push(sessionLog);
            await ttuHistoryStorage.setValue(history);

            const queue = await readingQueueStorage.getValue();
            const existing = queue.find((q: any) => q.originalTitle === title || q.contentTitleNative === title);
            if (existing) {
                existing.sessions = (existing.sessions || []).filter((s: any) => s.id !== ttuState.id);
                existing.chars = existing.sessions.reduce((acc: any, s: any) => acc + s.chars, 0);
                existing.time = existing.sessions.reduce((acc: any, s: any) => acc + s.secs, 0);
                await readingQueueStorage.setValue(queue);
            }

            ttuState.id = crypto.randomUUID();
            ttuState.timeMs = 0;
            ttuState.chars = 0;
            const currentCount = helpers.extractTTUCharCount();
            stateRefs.globalSessionStartChar = currentCount !== null ? currentCount : -1;
            stateRefs.globalManualCharOffset = 0;
            ttuState.running = false;

            await updateHistoryData();
        } catch {
            showToast('Error', 'Failed to send log', true);
        } finally {
            isProcessingDirect = false;
            const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
            if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
            updateUI();
        }
    });

    btnSettings.addEventListener('click', (e) => {
        e.preventDefault(); // Prevents host page from handling the click event
        e.stopPropagation(); // Restricts event bubbling

        // Route message safely to background script to avoid cross-domain browser blocks
        browser.runtime.sendMessage({ action: 'OPEN_SETTINGS', tab: 'readers' }).catch(() => { });
    });

    // Reactive custom event triggers
    wrapper.addEventListener('nt-linker-refresh', () => {
        refreshLinkerUI();
        updateUI();
    });

    wrapper.addEventListener('nt-history-refresh', () => {
        updateHistoryData().then(() => updateUI());
    });

    pt.el.insertAdjacentElement(pt.pos, wrapper);
    updateHistoryData().then(() => updateUI());
    refreshLinkerUI();
}