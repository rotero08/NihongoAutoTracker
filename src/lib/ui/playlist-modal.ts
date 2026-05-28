/**
 * ── Playlist Modal Interface Renderer ───────────────────────────────────────
 */
import { submitLog } from '@/lib/api/nihongotracker';
import { JP_RE } from '@/lib/constants';
import { configStorage } from '@/lib/storage/config';
import { DYNAMIC_LOGO_SVG } from '@/lib/ui/themes';
import { stripVideoTitle } from '@/lib/utils/text-parsing';
import { showToast } from '@/lib/utils/toast';
import { fetchYouTubeVideoData, getChannelNameFallback, getYouTubeChannelId } from '@/lib/utils/youtube-extraction';
import { getTheme } from './themes';
import { injectModalStyles } from './video-modal';

function setSafeHTML(el: HTMLElement, html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  el.textContent = '';
  while (doc.body.firstChild) {
    el.appendChild(doc.body.firstChild);
  }
}

const inlineLogo = DYNAMIC_LOGO_SVG;

let globalTitleResizeObserver: ResizeObserver | null = null;
let activeObservedElements: HTMLElement[] = [];

let pendingMaskUpdates = new Set<HTMLElement>();
let maskRafId: number | null = null;

function scheduleMaskUpdate(el: HTMLElement) {
  pendingMaskUpdates.add(el);
  if (maskRafId === null) {
    maskRafId = requestAnimationFrame(() => {
      maskRafId = null;

      const measurements = Array.from(pendingMaskUpdates).map((target) => ({
        target,
        scrollWidth: target.scrollWidth,
        clientWidth: target.clientWidth,
        scrollLeft: target.scrollLeft,
      }));
      pendingMaskUpdates.clear();

      measurements.forEach(({ target, scrollWidth, clientWidth, scrollLeft }) => {
        const isOverflowing = scrollWidth > clientWidth;
        if (!isOverflowing) {
          target.style.webkitMaskImage = 'none';
          target.style.maskImage = 'none';
          return;
        }

        const maxScrollLeft = scrollWidth - clientWidth;
        const atStart = scrollLeft <= 2;
        const atEnd = scrollLeft >= maxScrollLeft - 2;

        let maskVal = '';
        if (atStart) {
          maskVal = 'linear-gradient(to right, black 85%, transparent 100%)';
        } else if (atEnd) {
          maskVal = 'linear-gradient(to right, transparent 0%, black 15%)';
        } else {
          maskVal = 'linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)';
        }

        target.style.webkitMaskImage = maskVal;
        target.style.maskImage = maskVal;
      });
    });
  }
}

function cleanupActiveObservers() {
  if (globalTitleResizeObserver) {
    activeObservedElements.forEach(el => {
      globalTitleResizeObserver?.unobserve(el);
    });
  }
  activeObservedElements = [];
}

export async function showPlaylistSelectorModal(btn: HTMLElement, isInline: boolean, themeName: string) {
  const activeTheme = getTheme(themeName);
  injectModalStyles(activeTheme);

  const existing = document.getElementById('nt-playlist-modal');
  if (existing) {
    cleanupActiveObservers();
    existing.remove();
    return;
  }

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
    const titleEl = el.querySelector('#video-title') || el.querySelector('#title') || el.querySelector('.yt-core-attributed-string');
    const titleText = titleEl?.textContent?.trim() || el.querySelector('a')?.textContent?.trim() || 'Unknown';

    const urlEl = el.querySelector('a#wc-endpoint') || el.querySelector('a#video-title-link') || el.querySelector('a[href*="watch?v="]') || el.querySelector('a');
    const lengthEl = el.querySelector('ytd-thumbnail-overlay-time-status-renderer') || el.querySelector('.badge-shape-wiz__text');

    let domTime = 1;
    const timeText = lengthEl?.textContent?.trim() || "";

    const match = timeText.match(/\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/);
    if (match) {
      const hrs = match[1] ? parseInt(match[1], 10) : 0;
      const mins = parseInt(match[2], 10);
      const secs = parseInt(match[3], 10);
      const totalSeconds = hrs * 3600 + mins * 60 + secs;
      domTime = Math.max(1, Math.round(totalSeconds / 60));
    }

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

  setSafeHTML(modal, `
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
    </div>`);

  const listEl = modal.querySelector('#nt-playlist-modal-list')!;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const row = document.createElement('label');
    row.className = 'pl-vid-row';
    row.id = `pl-row-${i}`;
    row.style.cssText = `${hideNonJp && !v.isJp ? 'display:none;' : 'display:flex;'} gap:4px; align-items:center; font-size:11px; cursor:pointer; padding:3px 0; width:100%; box-sizing:border-box;`;
    setSafeHTML(row, `<input type="checkbox" class="nt-pl-chk pl-vid-chk" data-idx="${i}" style="margin:0; flex-shrink:0; width:14px; height:14px;" />
    <span style="font-family:ui-monospace,SFMono-Regular,monospace; color:#8A8A9A; width:14px; text-align:right; flex-shrink:0; font-size:10px; margin-right:2px;">${i + 1}.</span>
    <div class="pl-scroll-title" id="pl-title-${i}" style="flex:1; overflow-x:auto; white-space:nowrap; padding: 2px 0; font-size:11px; scrollbar-width:none; -ms-overflow-style:none;">
    ${v.title.replace(/</g, '&lt;')}
    </div>
    <span id="pl-time-${i}" style="color:var(--color-accent); font-family:ui-monospace,SFMono-Regular,monospace; flex-shrink:0; text-align:right; font-weight:bold; font-size:10px; min-width:32px;">${v.time} min</span>`);
    fragment.appendChild(row);
  }
  listEl.appendChild(fragment);

  document.body.appendChild(modal);

  if (!globalTitleResizeObserver) {
    globalTitleResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        scheduleMaskUpdate(target);
      }
    });
  }

  const titleEls = modal.querySelectorAll('.pl-scroll-title');
  titleEls.forEach((el) => {
    if (el instanceof HTMLElement) {
      globalTitleResizeObserver?.observe(el);
      activeObservedElements.push(el);
      el.addEventListener('scroll', () => scheduleMaskUpdate(el as HTMLElement), { passive: true });
      scheduleMaskUpdate(el as HTMLElement);
    }
  });

  requestAnimationFrame(() => {
    const popRect = modal.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const gap = 6;
    const margin = 12;

    let top = btnRect.bottom + gap;
    const fitsBelow = (top + popRect.height) <= window.innerHeight - margin;
    const fitsAbove = (btnRect.top - popRect.height - gap) >= margin;

    if (!fitsBelow && (fitsAbove || (btnRect.top > window.innerHeight - btnRect.bottom))) {
      top = btnRect.top - popRect.height - gap;
    }

    let left = btnRect.left;
    if (isInline) {
      left = btnRect.right - popRect.width;
    } else {
      const fitsLeftAlign = (btnRect.left + popRect.width) <= window.innerWidth - margin;
      const fitsRightAlign = (btnRect.right - popRect.width) >= margin;

      if (fitsLeftAlign) {
        left = btnRect.left;
      } else if (fitsRightAlign) {
        left = btnRect.right - popRect.width;
      } else {
        left = btnRect.left + (btnRect.width / 2) - (popRect.width / 2);
      }
    }

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
    modal.style.visibility = '';
  });

  const clickOutsideHandler = (e: MouseEvent) => {
    if (!modal.contains(e.target as Node) && !btn.contains(e.target as Node)) {
      cleanupActiveObservers();
      modal.remove();
      document.removeEventListener('click', clickOutsideHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', clickOutsideHandler), 10);

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
    cleanupActiveObservers();
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
    cleanupActiveObservers();
    document.removeEventListener('click', clickOutsideHandler);
    const checked = Array.from(modal.querySelectorAll('.pl-vid-chk:checked')).map((c: any) => videos[c.dataset.idx]);

    const yesBtn = modal.querySelector('#pl-confirm-yes')!;
    yesBtn.textContent = 'Logging...';
    yesBtn.setAttribute('disabled', 'true');
    modal.querySelector('#pl-confirm-no')!.setAttribute('disabled', 'true');

    let successCount = 0;
    const fallbackChanName = await getChannelNameFallback();
    const fallbackChanId = await getYouTubeChannelId();

    const uploadChunkSize = 3;
    for (let idx = 0; idx < checked.length; idx += uploadChunkSize) {
      const chunk = checked.slice(idx, idx + uploadChunkSize);
      await Promise.all(chunk.map(async (v) => {
        try {
          const data = await fetchYouTubeVideoData(`https://www.youtube.com/watch?v=${v.id}`);
          if (data?.video?.episodeDuration) v.time = Math.max(1, data.video.episodeDuration);
          if (data?.channel) {
            v.channelId = data.channel.contentId ?? null;
            v.channelTitle = (data.channel.title?.contentTitleNative || data.channel.title?.contentTitleEnglish) ?? null;
            v.channelImage = data.channel.contentImage ?? null;
            v.channelDesc = data.channel.description?.[0]?.description ?? null;
          }
        } catch (e) { }

        const finalChanId = v.channelId || fallbackChanId || "web-video";
        const finalChanTitle = v.channelTitle || fallbackChanName || "Unknown Channel";

        const specificMediaData = {
          channelId: finalChanId,
          channelTitle: finalChanTitle,
          channelImage: v.channelImage,
          channelDescription: v.channelDesc
        };

        const ok = await submitLog({
          type: 'video', mediaId: finalChanId,
          description: stripVideoTitle(v.title), mediaData: specificMediaData,
          time: v.time, date: new Date().toISOString(),
          private: false, episodes: 0, pages: 0, unknownDate: false
        });
        if (ok?.success) successCount++;
      }));
    }

    showToast('Success', `Logged ${successCount}/${checked.length} videos`);
    modal.remove();
  });
}