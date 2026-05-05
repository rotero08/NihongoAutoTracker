// Notify routes through background — browser.notifications unavailable in content scripts
export function notify(title: string, message: string) {
  try {
    if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.query) {
      // Always send custom toasts to the active tab.
      browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        if (tabs[0]?.id) browser.tabs.sendMessage(tabs[0].id, { action: 'SHOW_TOAST', title, message }).catch(() => null);
      }).catch(() => null);
      return;
    }
    // Content script or popup
    if (browser.runtime?.sendMessage) {
      browser.runtime.sendMessage({ action: 'NOTIFY', title, message }).catch(() => null);
    }
  } catch (e) {
    // Context invalidated (e.g. extension reloaded) — silent
  }
}

type VideoChannelMedia = {
  channelId?: string;
  channelTitle?: string;
  channelImage?: string;
  channelDescription?: string;
};

function normalizeMediaSearchResult(raw: any): VideoChannelMedia {
  const title = raw?.channelTitle || raw?.contentTitleNative || raw?.title?.contentTitleNative || raw?.title?.native || '';
  const image = raw?.channelImage || raw?.contentImage || raw?.coverImage || raw?.image || raw?.thumbnail || '';
  const description = raw?.channelDescription || raw?.description || raw?.contentDescription || '';
  const id = raw?.channelId || raw?.contentId || raw?.id || '';
  return {
    channelId: id || undefined,
    channelTitle: title || undefined,
    channelImage: image || undefined,
    channelDescription: description || undefined,
  };
}

async function fetchChannelExtrasFromYouTube(channelId: string): Promise<VideoChannelMedia> {
  try {
    const res = await fetch(`https://www.youtube.com/channel/${channelId}/about`);
    if (!res.ok) return {};
    const text = await res.text();
    let channelDescription = '';
    let channelImage = '';

    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      channelDescription = doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
        doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
      channelImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
    } else {
      const descMatch = text.match(/<meta[^>]+(?:name="description"|property="og:description")[^>]+content="([^"]*)"/i);
      const imgMatch = text.match(/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i);
      channelDescription = descMatch?.[1] || '';
      channelImage = imgMatch?.[1] || '';
    }

    return {
      channelId,
      channelImage: channelImage || undefined,
      channelDescription: channelDescription || undefined,
    };
  } catch {
    return {};
  }
}

export async function resolveVideoChannelMedia(input: { channelId?: string; channelTitle?: string; apiKey?: string }): Promise<VideoChannelMedia> {
  const channelId = input.channelId?.trim();
  const channelTitle = input.channelTitle?.trim();
  if (!channelId && !channelTitle) return {};

  let apiKey = input.apiKey || '';
  if (!apiKey) {
    const res = await browser.storage.local.get('config');
    apiKey = (res.config as Record<string, unknown>)?.apiKey as string ?? '';
  }

  const search = encodeURIComponent(channelId || channelTitle || '');
  const endpoints =[
    `https://nihongotracker.app/api/media/youtube/search?search=${search}`,
    `https://nihongotracker.app/api/media/youtube/search?channelId=${search}`,
    `https://nihongotracker.app/api/media/search?search=${search}&type=YOUTUBE`,
    `https://nihongotracker.app/api/media/search?query=${search}&type=YOUTUBE`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
      if (!res.ok) continue;
      const data = await res.json();
      const results: any[] = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      if (!results.length) continue;

      const exact = channelId
        ? results.find((r: any) => (r.channelId || r.contentId || r.id) === channelId)
        : undefined;
      const first = exact || results[0];
      const normalized = normalizeMediaSearchResult(first);
      if (normalized.channelTitle || normalized.channelImage || normalized.channelDescription) {
        if (channelId && !normalized.channelId) normalized.channelId = channelId;
        return normalized;
      }
    } catch {
      // Try the next endpoint shape.
    }
  }

  if (channelId) {
    const extras = await fetchChannelExtrasFromYouTube(channelId);
    return {
      channelId,
      channelTitle: channelTitle || undefined,
      channelImage: extras.channelImage,
      channelDescription: extras.channelDescription,
    };
  }

  return { channelTitle: channelTitle || undefined };
}

export async function submitLog(payload: Record<string, unknown>): Promise<boolean> {
  const res = await browser.storage.local.get('config');
  const apiKey: string = (res.config as Record<string, unknown>)?.apiKey as string ?? '';
  const desc = typeof payload.description === 'string' ? payload.description.trim() : '';

  if (!apiKey) {
    notify('Failed! Missing API key', '');
    return false;
  }

  try {
    const response = await fetch('https://nihongotracker.app/api/logs', {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      notify('Log sent to Nihongo Tracker', '');
      return true;
    } else {
      const errorText = await response.text();
      console.error('NT API error:', errorText);

      let shortError = errorText;
      try {
        const jsonErr = JSON.parse(errorText);
        if (jsonErr.message) shortError = jsonErr.message;
      } catch (e) {
        shortError = errorText;
      }

      const msg = shortError || (desc ? `Error sending '${desc}'` : 'Request failed');
      notify(`Failed! ${response.status}: ${msg}`, '');
      return false;
    }
  } catch (err) {
    console.error('NT fetch error:', err);
    notify('Failed! Network error', '');
    return false;
  }
}
