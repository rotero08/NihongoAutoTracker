/**
 * ── Playlist Modal Interface Renderer ───────────────────────────────────────
 * Handles programmatically mounting the Svelte 5 PlaylistModal component.
 */

import { submitLog } from '@/lib/api/nihongotracker';
import { JP_RE } from '@/lib/constants';
import { configStorage } from '@/lib/storage/config';
import { DYNAMIC_LOGO_SVG } from '@/lib/ui/themes';
import { stripVideoTitle } from '@/lib/utils/text-parsing';
import { showToast } from '@/lib/utils/toast';
import { fetchYouTubeVideoData, getChannelNameFallback, getYouTubeChannelId } from '@/lib/utils/youtube-extraction';
import { mount, unmount } from 'svelte';
import { applyThemeToDocument, getTheme, resolveThemeColors } from './themes';
import { injectModalStyles } from './video-modal';

const inlineLogo = DYNAMIC_LOGO_SVG;

let globalTitleResizeObserver: ResizeObserver | null = null;
let activeObservedElements: HTMLElement[] = [];
let pendingMaskUpdates = new Set<HTMLElement>();
let maskRafId: number | null = null;
let activePlaylistModalInstance: any = null;

// Simple cache store mapping playlist IDs to parsed video arrays
const playlistVideosCache = new Map<string, any[]>();

/**
 * Extracts the playlist parameter value ('list=...') from the given URL.
 */
function getPlaylistIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('list');
  } catch (e) {
    const match = url.match(/[?&]list=([^&]+)/);
    return match ? match[1] : null;
  }
}

/**
 * Parses and extracts a standard YouTube video ID from any watch or short URL string.
 */
function extractVideoId(url: string): string | null {
  if (!url) return null;
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  if (watchMatch) return watchMatch[1];
  const shortMatch = url.match(/youtu\.be\/([^?&#]+)/);
  if (shortMatch) return shortMatch[1];
  const pathMatch = url.match(/(?:embed|v|shorts)\/([^?&#]+)/);
  if (pathMatch) return pathMatch[1];
  return null;
}

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

export function cleanupPlaylistModal() {
  const elements = document.querySelectorAll('#nt-playlist-modal');
  elements.forEach((el: any) => {
    // Unmount and destroy active svelte observer context to prevent memory leaks
    if (typeof el.__unmount === 'function') {
      try {
        el.__unmount();
      } catch (e) { }
    }
    el.remove();
  });
  activePlaylistModalInstance = null;
  cleanupActiveObservers();
}

export async function showPlaylistSelectorModal(btn: HTMLElement, isInline: boolean, themeName: string) {
  const activeTheme = getTheme(themeName);
  injectModalStyles(activeTheme);

  const existing = document.getElementById('nt-playlist-modal');
  if (existing) {
    cleanupPlaylistModal();
    return;
  }

  // Pre-clean existing containers to guarantee only one exists at a time
  cleanupPlaylistModal();

  const playlistId = getPlaylistIdFromUrl(window.location.href);
  let videos: any[] = [];

  // Attempt to load from cache, but ignore empty cached arrays to allow re-evaluation
  if (playlistId && playlistVideosCache.has(playlistId)) {
    const cached = playlistVideosCache.get(playlistId) || [];
    if (cached.length > 0) {
      videos = cached;
    }
  }

  // If no cached videos are present, query the DOM and compile the list
  if (videos.length === 0) {
    const parent = isInline
      ? (btn.closest('ytd-playlist-panel-renderer') || document.querySelector('ytd-playlist-panel-renderer'))
      : (btn.closest('ytd-browse') || document.querySelector('ytd-playlist-video-list-renderer') || document.querySelector('ytd-browse:not([hidden])') || document.querySelector('ytd-two-column-browse-results-renderer #primary') || document.body);

    const rendererSelector = isInline
      ? 'ytd-playlist-panel-video-renderer'
      : 'ytd-playlist-video-renderer, ytd-podcast-episode-row-renderer, ytd-rich-item-renderer, ytd-rich-grid-media, ytd-compact-video-renderer';

    let items = Array.from(parent?.querySelectorAll(rendererSelector) || []);

    // Fallback 1: search inside standard list container globally if container is cached/hidden
    if (items.length === 0 && !isInline) {
      const globalList = document.querySelector('ytd-playlist-video-list-renderer') || document;
      items = Array.from(globalList.querySelectorAll(rendererSelector));
    }

    // Fallback 2: search globally across the entire document for any renderer
    if (items.length === 0 && !isInline) {
      items = Array.from(document.querySelectorAll('ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, ytd-podcast-episode-row-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer'));
    }

    videos = items.map(el => {
      const titleEl = el.querySelector('#video-title')
        || el.querySelector('#video-title-link')
        || el.querySelector('#title')
        || el.querySelector('.yt-core-attributed-string');
      const titleText = titleEl?.textContent?.trim() || el.querySelector('a')?.textContent?.trim() || 'Unknown';

      // Prioritize ID/Class-based selectors first for fast lookup, unaffected by dynamic layout changes
      const urlEl = el.querySelector('a#video-title')
        || el.querySelector('a#video-title-link')
        || el.querySelector('a#wc-endpoint')
        || el.querySelector('a#thumbnail')
        || el.querySelector('a[href*="watch?v="]')
        || el.querySelector('a[href*="/watch?v="]')
        || Array.from(el.querySelectorAll('a')).find(a => {
          const href = (a as any).href || a.getAttribute('href') || '';
          return href.includes('watch?v=') || href.includes('/watch?v=');
        })
        || el.querySelector('a');

      const lengthEl = el.querySelector('ytd-thumbnail-overlay-time-status-renderer')
        || el.querySelector('span.ytd-thumbnail-overlay-time-status-renderer')
        || el.querySelector('.badge-shape-wiz__text')
        || el.querySelector('#time-status');

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

      // Read direct element property if set dynamically rather than HTML attribute
      const url = (urlEl as any)?.href || urlEl?.getAttribute('href') || '';
      const videoId = extractVideoId(url);

      return {
        title: titleText,
        url: url,
        id: videoId,
        time: domTime,
        isJp: (titleText.match(JP_RE) || []).length > 0,
        channelId: null as string | null,
        channelTitle: null as string | null,
        channelImage: null as string | null,
        channelDesc: null as string | null
      };
    }).filter(v => v.id);

    // Save populated array into cache for fast retrieval on future transitions
    if (playlistId && videos.length > 0) {
      playlistVideosCache.set(playlistId, videos);
    }
  }

  if (videos.length === 0) { showToast("Playlist Error", "No valid videos found in playlist", true); return; }

  const modalContainer = document.createElement('div');
  modalContainer.id = 'nt-playlist-modal';
  // Removed "nt-modal" from the wrapper element to completely eliminate the double nesting box shadow
  modalContainer.className = 'nt-playlist-modal-wrapper';
  modalContainer.style.position = 'fixed';
  modalContainer.style.visibility = 'hidden';
  modalContainer.style.zIndex = '2147483647';
  document.body.appendChild(modalContainer);

  const config = await configStorage.getValue() as any;
  const hideNonJp = config.playlistHideNonJapanese ?? true;

  if (config) {
    const themeName = config.theme ?? 'dark-amber';
    const font = config.font ?? 'sans';
    const customColors = resolveThemeColors(themeName, config.customThemes);
    const useStaticInPageLogo = config.useStaticInPageLogo === true;
    applyThemeToDocument(themeName, font, customColors, { useStaticInPageLogo });
  }

  const PlaylistModal = (await import('@/components/video/PlaylistModal.svelte')).default as any;

  const instance = mount(PlaylistModal, {
    target: modalContainer,
    props: {
      videos,
      hideNonJp,
      onCancel: () => cleanupPlaylistModal(),
      onSubmit: async (checkedVideos: any[]) => {
        await executeBulkLogging(checkedVideos);
        cleanupPlaylistModal();
      }
    }
  });

  // Bind Svelte's unmount closure directly to the DOM node (solves circular dependencies)
  (modalContainer as any).__unmount = () => {
    try {
      unmount(instance);
    } catch (e) { }
  };

  activePlaylistModalInstance = instance;

  if (!globalTitleResizeObserver) {
    globalTitleResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        scheduleMaskUpdate(target);
      }
    });
  }

  const titleEls = modalContainer.querySelectorAll('.pl-scroll-title');
  titleEls.forEach((el) => {
    if (el instanceof HTMLElement) {
      globalTitleResizeObserver?.observe(el);
      activeObservedElements.push(el);
      el.addEventListener('scroll', () => scheduleMaskUpdate(el as HTMLElement), { passive: true });
      scheduleMaskUpdate(el as HTMLElement);
    }
  });

  requestAnimationFrame(() => {
    const popRect = modalContainer.getBoundingClientRect();
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

    modalContainer.style.top = `${top}px`;
    modalContainer.style.left = `${left}px`;
    modalContainer.style.visibility = '';
  });

  const clickOutsideHandler = (e: MouseEvent) => {
    if (!modalContainer.isConnected) {
      document.removeEventListener('click', clickOutsideHandler);
      cleanupActiveObservers();
      return;
    }

    const eventPath = e.composedPath();
    const clickedInsideModal = eventPath.includes(modalContainer);
    const clickedTriggerButton = eventPath.includes(btn);

    if (!clickedInsideModal && !clickedTriggerButton) {
      cleanupActiveObservers();
      cleanupPlaylistModal();
      document.removeEventListener('click', clickOutsideHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', clickOutsideHandler), 10);
}

async function executeBulkLogging(checkedVideos: any[]) {
  let successCount = 0;
  let lastError = '';
  const fallbackChanName = await getChannelNameFallback();
  const fallbackChanId = await getYouTubeChannelId();

  const uploadChunkSize = 3;
  for (let idx = 0; idx < checkedVideos.length; idx += uploadChunkSize) {
    const chunk = checkedVideos.slice(idx, idx + uploadChunkSize);

    const results = await Promise.all(chunk.map(async (v) => {
      let channelId = fallbackChanId;
      let channelTitle = fallbackChanName;
      let channelImage = '';
      let channelDesc = '';

      try {
        const data = await fetchYouTubeVideoData(`https://www.youtube.com/watch?v=${v.id}`);
        if (data?.video?.episodeDuration) v.time = Math.max(1, data.video.episodeDuration);
        if (data?.channel) {
          channelId = data.channel.contentId ?? fallbackChanId;
          channelTitle = (data.channel.title?.contentTitleNative || data.channel.title?.contentTitleEnglish) ?? fallbackChanName;
          channelImage = data.channel.contentImage ?? '';
          channelDesc = data.channel.description?.[0]?.description ?? '';
        }
      } catch (e) { }

      const mediaId = (channelId && channelId !== "web-video") ? channelId : "web-video";
      const ok = await submitLog({
        type: 'video', mediaId,
        description: stripVideoTitle(v.title), mediaData: {
          channelId: mediaId,
          channelTitle: channelTitle || "Unknown Channel",
          channelImage,
          channelDescription: channelDesc
        },
        time: v.time, date: new Date().toISOString(),
        private: false, episodes: 0, pages: 0, unknownDate: false
      }, true);

      return {
        success: !!ok?.success,
        error: ok?.error || ''
      };
    }));

    for (const res of results) {
      if (res.success) {
        successCount++;
      } else if (res.error) {
        lastError = res.error;
      }
    }
  }

  if (successCount === 0) {
    showToast('Error', lastError || `Failed to log videos (0/${checkedVideos.length} logged)`, true);
  } else {
    showToast('Success', `Logged ${successCount}/${checkedVideos.length} videos`);
  }
}