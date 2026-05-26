/**
 * ── Playlist Modal Interface Renderer ───────────────────────────────────────
 */
import { getTheme } from './themes';
import type { UITheme } from '@/lib/types';
import { configStorage } from '@/lib/storage/config';
import { fetchYouTubeVideoData, getChannelNameFallback, getYouTubeChannelId } from '@/lib/utils/youtube-extraction';
import { stripVideoTitle } from '@/lib/utils/text-parsing';
import { submitLog } from '@/lib/api/nihongotracker';
import { JP_RE } from '@/lib/constants';
import { showToast } from '@/lib/utils/toast';
import { injectModalStyles } from './video-modal';
import rawLogoSvg from '@/../public/NihongoAutoTracker.svg?raw';

// Loads authentic branding asset cleanly without drop shadows
const inlineLogo = rawLogoSvg.replace(/<svg\b/i, '<svg style="width:100%;height:100%;display:block;object-fit:contain;filter:none !important;box-shadow:none !important;"');

// Single global observer instantiated once to monitor text overflow changes efficiently
let globalTitleResizeObserver: ResizeObserver | null = null;

export async function showPlaylistSelectorModal(btn: HTMLElement, isInline: boolean, themeName: string) {
  const activeTheme = getTheme(themeName);
  injectModalStyles(activeTheme);

  const existing = document.getElementById('nt-playlist-modal');
  if (existing) { existing.remove(); return; }

  const parent = isInline
    ? document.querySelector('ytd-playlist-panel-renderer')
    : (document.querySelector('ytd-browse') || document.querySelector('ytd-two-column-browse-results-renderer #primary') || document.body);

  const rendererSelector = isInline
    ? 'ytd-playlist-panel-video-renderer'
    : 'ytd-playlist-video-renderer, ytd-podcast-episode-row-renderer, ytd-rich-item-renderer, ytd-rich-grid-media, ytd-compact-video-renderer';

  const items = Array.from(parent?.querySelectorAll(rendererSelector) || []);

  const config = await configStorage.getValue() as any;
  let hideNonJp = config.playlistHideNonJapanese ?? true;

  const videos = items.map(el => {
    // Broadened selectors to safely extract titles and anchors from both classic rows and modern view models
    const titleEl = el.querySelector('#video-title') || el.querySelector('#title') || el.querySelector('.yt-core-attributed-string');
    const titleText = titleEl?.textContent?.trim() || el.querySelector('a')?.textContent?.trim() || 'Unknown';

    const urlEl = el.querySelector('a#wc-endpoint') || el.querySelector('a#video-title-link') || el.querySelector('a[href*="watch?v="]') || el.querySelector('a');
    const lengthEl = el.querySelector('ytd-thumbnail-overlay-time-status-renderer') || el.querySelector('.badge-shape-wiz__text');

    let domTime = 1;
    const timeText = lengthEl?.textContent?.trim() || "";
    const parts = timeText.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0])) domTime = Math.max(1, Math.round((parts[0] * 60 + parts[1]) / 60));
    else if (parts.length === 3 && !isNaN(parts[0])) domTime = Math.max(1, Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) / 60));

    const url = urlEl?.getAttribute('href') || '';
    const idMatch = url.match(/[?&]v=([^&]+)/);

    return {
      title: titleText,
      url: url,
      id: idMatch ? idMatch[1] : null,
      time: domTime,
      isJp: (titleText.match(JP_RE) || []).length > 0,
      channelId: null as string | null,
      channelTitle: null as string | null,
      channelImage: null as string | null,
      channelDesc: null as string | null
    };
  }).filter(v => v.id);

  if (videos.length === 0) { showToast("Playlist Error", "No valid videos found in playlist", true); return; }

  const modal = document.createElement('div');
  modal.id = 'nt-playlist-modal';
  modal.className = 'nt-modal';
  modal.style.position = 'fixed';
  modal.style.visibility = 'hidden';
  modal.style.zIndex = '2147483647';

  modal.innerHTML = `
  <div class="nt-modal-header" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
  <div style="display:flex; gap:12px; align-items:center;">
  <div class="nt-logo-sq" style="border:none; display:flex; align-items:center; justify-content:center;">
  ${inlineLogo}
  </div>
  <div class="nt-title-area"><span class="nt-brand-name">Log Playlist Videos</span></div>
  </div>
  <div id="pl-top-actions" style="display:flex; gap:10px;">
  <button id="pl-toggle-jp" style="background:none; border:none; color:var(--color-text-muted); font-size:10px; cursor:pointer; font-weight:bold; font-family:inherit;">${hideNonJp ? 'Show Non-JP' : 'Hide Non-JP'}</button>
  <button id="pl-toggle-all" style="background:none; border:none; color:var(--color-accent); font-size:10px; cursor:pointer; font-weight:bold; font-family:inherit;">Select All</button>
  </div>
  </div>

  <div id="nt-playlist-modal-list" style="max-height:300px; overflow-y:auto; overflow-x:hidden; margin-bottom:8px; display:flex; flex-direction:column; gap:4px; flex-shrink:1;"></div>

    <div id="nt-playlist-confirm-layer" style="display:none; flex-direction:column; align-items:center; gap:12px; margin-bottom:8px; padding:10px 0; text-align:center; flex-shrink:0;">
    <div style="font-size:14px; color:var(--color-text); font-weight:bold;">Confirm Logging</div>
    <div style="font-size:12px; color:var(--color-text-muted);">Are you sure you want to log <span id="pl-confirm-count" style="color:var(--color-accent); font-weight:bold;">0</span> videos directly?</div>
    </div>

    <div class="nt-modal-footer" id="pl-footer-main" style="margin-top: 4px;">
    <button id="pl-cancel" class="nt-btn-ghost">Cancel</button><button id="pl-submit" class="nt-btn-amber">Log Selected</button>
    </div>

    <div class="nt-modal-footer" id="pl-footer-confirm" style="display:none; margin-top: 4px;">
    <button id="pl-confirm-no" class="nt-btn-ghost">Go Back</button><button id="pl-confirm-yes" class="nt-btn-amber">Yes, Log Them</button>
    </div>`;

  // Build playlist rows with DocumentFragment for batch DOM insertion
  const listEl = modal.querySelector('#nt-playlist-modal-list')!;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const row = document.createElement('label');
    row.className = 'pl-vid-row';
    row.id = `pl-row-${i}`;
    row.style.cssText = `${hideNonJp && !v.isJp ? 'display:none;' : 'display:flex;'} gap:4px; align-items:center; font-size:11px; cursor:pointer; padding:3px 0; width:100%; box-sizing:border-box;`;
    row.innerHTML = `<input type="checkbox" class="nt-pl-chk pl-vid-chk" data-idx="${i}" style="margin:0; flex-shrink:0; width:14px; height:14px;" />
    <span style="font-family:ui-monospace,SFMono-Regular,monospace; color:#8A8A9A; width:14px; text-align:right; flex-shrink:0; font-size:10px; margin-right:2px;">${i + 1}.</span>
    <div class="pl-scroll-title" id="pl-title-${i}" style="flex:1; overflow-x:auto; white-space:nowrap; padding: 2px 0; font-size:11px; scrollbar-width:none; -ms-overflow-style:none;">
    ${v.title.replace(/</g, '&lt;')}
    </div>
    <span id="pl-time-${i}" style="color:var(--color-accent); font-family:ui-monospace,SFMono-Regular,monospace; flex-shrink:0; text-align:right; font-weight:bold; font-size:10px; min-width:32px;">...</span>`;
    fragment.appendChild(row);
  }
  listEl.appendChild(fragment);

  document.body.appendChild(modal);

  // Initialize unified ResizeObserver if not already created
  if (!globalTitleResizeObserver) {
    globalTitleResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const updater = (entry.target as any).__ntUpdateMask;
        if (typeof updater === 'function') {
          updater();
        }
      }
    });
  }

  const titleEls = modal.querySelectorAll('.pl-scroll-title');
  titleEls.forEach((el) => {
    const updateMask = () => {
      const isOverflowing = el.scrollWidth > el.clientWidth;
      if (!isOverflowing) {
        (el as HTMLElement).style.webkitMaskImage = 'none';
        (el as HTMLElement).style.maskImage = 'none';
        return;
      }

      const maxScrollLeft = el.scrollWidth - el.clientWidth;
      const scrollLeft = el.scrollLeft;

      const atStart = scrollLeft <= 2;
      const atEnd = scrollLeft >= maxScrollLeft - 2;

      if (atStart) {
        (el as HTMLElement).style.webkitMaskImage = 'linear-gradient(to right, black 85%, transparent 100%)';
        (el as HTMLElement).style.maskImage = 'linear-gradient(to right, black 85%, transparent 100%)';
      } else if (atEnd) {
        (el as HTMLElement).style.webkitMaskImage = 'linear-gradient(to right, transparent 0%, black 15%)';
        (el as HTMLElement).style.maskImage = 'linear-gradient(to right, transparent 0%, black 15%)';
      } else {
        (el as HTMLElement).style.webkitMaskImage = 'linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)';
        (el as HTMLElement).style.maskImage = 'linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)';
      }
    };

    // Store update method directly on element for execution within unified observer
    (el as any).__ntUpdateMask = updateMask;
    globalTitleResizeObserver?.observe(el);

    el.addEventListener('scroll', updateMask, { passive: true });
    updateMask();
  });

  requestAnimationFrame(() => {
    const popRect = modal.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const gap = 6; // Closer spacing to the button
    const margin = 12;

    // Determine vertical placement: try placing below first, then above
    let top = btnRect.bottom + gap;
    const fitsBelow = (top + popRect.height) <= window.innerHeight - margin;
    const fitsAbove = (btnRect.top - popRect.height - gap) >= margin;

    if (!fitsBelow && (fitsAbove || (btnRect.top > window.innerHeight - btnRect.bottom))) {
      top = btnRect.top - popRect.height - gap;
    }

    // Determine horizontal placement: prioritize aligning to the edges of the button
    let left = btnRect.left; // Default left-align with button
    if (isInline) {
      left = btnRect.right - popRect.width; // Right-align for inline sidebar panels
    } else {
      // Try left-aligning with the button first
      const fitsLeftAlign = (btnRect.left + popRect.width) <= window.innerWidth - margin;
      // Try right-aligning with the button second
      const fitsRightAlign = (btnRect.right - popRect.width) >= margin;

      if (fitsLeftAlign) {
        left = btnRect.left;
      } else if (fitsRightAlign) {
        left = btnRect.right - popRect.width;
      } else {
        // Fallback: Center the modal if neither side fits cleanly within screen boundaries
        left = btnRect.left + (btnRect.width / 2) - (popRect.width / 2);
      }
    }

    // Viewport margin safety clamping as a fallback if everything else overflows
    if (left + popRect.width > window.innerWidth - margin) {
      left = window.innerWidth - popRect.width - margin;
    }
    if (left < margin) {
      left = margin;
    }

    if (top < margin) {
      top = margin;
    } else if (top + popRect.height > window.innerHeight - margin) {
      top = window.innerHeight - popRect.height - margin;
    }

    modal.style.top = `${top}px`;
    modal.style.left = `${left}px`;
    modal.style.visibility = ''; // Make modal visible once position is applied
  });

  const cleanupObservers = () => {
    titleEls.forEach(el => globalTitleResizeObserver?.unobserve(el));
  };

  const clickOutsideHandler = (e: MouseEvent) => {
    if (!modal.contains(e.target as Node) && !btn.contains(e.target as Node)) {
      cleanupObservers();
      modal.remove();
      document.removeEventListener('click', clickOutsideHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', clickOutsideHandler), 10);

  // Fetch detailed metadata in sequential execution chunks of 3 rather than overloading concurrently
  (async () => {
    const chunkSize = 3;
    for (let idx = 0; idx < videos.length; idx += chunkSize) {
      if (!modal.isConnected) break;
      const chunk = videos.slice(idx, idx + chunkSize);
      await Promise.all(chunk.map(async (v, chunkIdx) => {
        const itemIdx = idx + chunkIdx;
        try {
          const data = await fetchYouTubeVideoData(`https://www.youtube.com/watch?v=${v.id}`);
          if (data?.video?.episodeDuration) v.time = Math.max(1, data.video.episodeDuration);
          if (data?.channel?.contentId) {
            v.channelId = data.channel.contentId;
            v.channelTitle = data.channel.title?.contentTitleNative || data.channel.title?.contentTitleEnglish;
            v.channelImage = data.channel.contentImage;
            v.channelDesc = data.channel.description?.[0]?.description;
          }
        } catch (e) { }
        if (!modal.isConnected) return;
        const timeEl = modal.querySelector(`#pl-time-${itemIdx}`);
        if (timeEl) timeEl.textContent = `${v.time} min`;
      }));
    }
  })();

  modal.querySelector('#pl-toggle-jp')!.addEventListener('click', (e) => {
    hideNonJp = !hideNonJp;
    (e.target as HTMLElement).textContent = hideNonJp ? 'Show Non-JP' : 'Hide Non-JP';
    const rows = modal.querySelectorAll<HTMLElement>('.pl-vid-row');
    rows.forEach((row, i) => {
      if (i < videos.length) {
        row.style.display = (hideNonJp && !videos[i].isJp) ? 'none' : 'flex';
      }
    });
  });

  let allSelected = false;
  modal.querySelector('#pl-toggle-all')!.addEventListener('click', (e) => {
    allSelected = !allSelected;
    const chks = modal.querySelectorAll('.pl-vid-chk') as NodeListOf<HTMLInputElement>;
    chks.forEach(c => {
      const row = c.closest('label');
      if (row && row.style.display !== 'none') c.checked = allSelected;
    });
    (e.target as HTMLElement).textContent = allSelected ? 'Unselect All' : 'Select All';
  });

  modal.querySelector('#pl-cancel')!.addEventListener('click', () => {
    cleanupObservers();
    document.removeEventListener('click', clickOutsideHandler);
    modal.remove();
  });

  modal.querySelector('#pl-submit')!.addEventListener('click', () => {
    const checked = Array.from(modal.querySelectorAll('.pl-vid-chk:checked'));
    if (checked.length === 0) return;

    modal.querySelector('#pl-top-actions')!.setAttribute('style', 'display:none !important');
    modal.querySelector('#nt-playlist-modal-list')!.setAttribute('style', 'display:none !important');
    modal.querySelector('#pl-footer-main')!.setAttribute('style', 'display:none !important');

    modal.querySelector('#pl-confirm-count')!.textContent = String(checked.length);
    modal.querySelector('#nt-playlist-confirm-layer')!.setAttribute('style', 'display:flex; flex-direction:column; align-items:center; gap:12px; margin-bottom:16px; padding:20px 0; text-align:center;');
    modal.querySelector('#pl-footer-confirm')!.setAttribute('style', 'display:flex; gap:12px; margin-top:20px;');
  });

  modal.querySelector('#pl-confirm-no')!.addEventListener('click', () => {
    modal.querySelector('#pl-top-actions')!.setAttribute('style', 'display:flex; gap:10px;');
    modal.querySelector('#nt-playlist-modal-list')!.setAttribute('style', 'max-height:300px; overflow-y:auto; overflow-x:hidden; margin-bottom:16px; display:flex; flex-direction:column; gap:8px;');
    modal.querySelector('#pl-footer-main')!.setAttribute('style', 'display:flex; gap:12px; margin-top:20px;');

    modal.querySelector('#nt-playlist-confirm-layer')!.setAttribute('style', 'display:none !important');
    modal.querySelector('#pl-footer-confirm')!.setAttribute('style', 'display:none !important');
  });

  modal.querySelector('#pl-confirm-yes')!.addEventListener('click', async () => {
    cleanupObservers();
    document.removeEventListener('click', clickOutsideHandler);
    const checked = Array.from(modal.querySelectorAll('.pl-vid-chk:checked')).map((c: any) => videos[c.dataset.idx]);

    const yesBtn = modal.querySelector('#pl-confirm-yes')!;
    yesBtn.textContent = 'Logging...';
    yesBtn.setAttribute('disabled', 'true');
    modal.querySelector('#pl-confirm-no')!.setAttribute('disabled', 'true');

    let successCount = 0;
    const fallbackChanName = await getChannelNameFallback();
    const fallbackChanId = await getYouTubeChannelId();

    for (const v of checked) {
      const finalChanId = v.channelId || fallbackChanId || "web-video";
      const finalChanTitle = v.channelTitle || fallbackChanName || "Unknown Channel";

      const specificMediaData = {
        channelId: finalChanId,
        channelTitle: finalChanTitle,
        ...(v.channelImage ? { channelImage: v.channelImage } : {}),
        ...(v.channelDesc ? { channelDescription: v.channelDesc } : {})
      };

      const ok = await submitLog({
        type: 'video', mediaId: finalChanId,
        description: stripVideoTitle(v.title), mediaData: specificMediaData,
        time: v.time, date: new Date().toISOString(),
        private: false, episodes: 0, pages: 0, unknownDate: false
      });
      if (ok?.success) successCount++;
    }
    showToast('Success', `Logged ${successCount}/${checked.length} videos`);
    modal.remove();
  });
}