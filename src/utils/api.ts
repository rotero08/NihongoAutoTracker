import { addDebugLog } from './storage';

export function notify(title: string, message: string) {
  try {
    if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.query) {
      browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        if (tabs[0]?.id) browser.tabs.sendMessage(tabs[0].id, { action: 'SHOW_TOAST', title, message }).catch(() => null);
      }).catch(() => null);
      return;
    }
    if (browser.runtime?.sendMessage) {
      browser.runtime.sendMessage({ action: 'NOTIFY', title, message }).catch(() => null);
    }
  } catch (e) {}
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

  await addDebugLog('INFO', 'API', 'Resolving Channel Media', { input_channelId: channelId, input_channelTitle: channelTitle });

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
      const results: any[] = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data :[]);
      if (!results.length) continue;

      const exact = channelId
      ? results.find((r: any) => (r.channelId || r.contentId || r.id) === channelId)
      : undefined;
      const first = exact || results[0];
      const normalized = normalizeMediaSearchResult(first);

      if (normalized.channelTitle || normalized.channelImage || normalized.channelDescription) {
        if (channelId && !normalized.channelId) normalized.channelId = channelId;
        await addDebugLog('INFO', 'API', `Media successfully matched API request`, { endpoint: url, normalized });
        return normalized;
      }
    } catch {}
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

export async function submitLog(payload: Record<string, unknown>): Promise<{success: boolean, status?: number, error?: string}> {
  const res = await browser.storage.local.get('config');
  const config = res.config as any;
  const apiKey = config?.apiKey ?? '';

  if (!apiKey) {
    notify('Failed! Missing API key', '');
    return { success: false, error: 'Missing API key' };
  }

  const mediaData = payload.mediaData as any;
  if (payload.mediaId === 'web-video' && mediaData?.channelId && mediaData.channelId !== 'web-video') {
    payload.mediaId = mediaData.channelId;
    await addDebugLog('INFO', 'API', 'Correcting mediaId using discovered mediaData ID', { newMediaId: payload.mediaId });
  }

  await addDebugLog('INFO', 'API', `Submitting Log (${payload.type})`, payload);

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
      await addDebugLog('INFO', 'API', `Log sent successfully`);
      notify('Success', 'Log sent to NihongoTracker!');
      return { success: true, status: response.status };
    } else {
      const errorText = await response.text();
      await addDebugLog('ERROR', 'API', `Log failed with code ${response.status}`, errorText);
      notify(`Failed! ${response.status}`, errorText.slice(0, 100));
      return { success: false, status: response.status, error: errorText };
    }
  } catch (err: any) {
    await addDebugLog('ERROR', 'API', `Network error`, err);
    notify('Failed!', err.message);
    return { success: false, error: err.message };
  }
}
