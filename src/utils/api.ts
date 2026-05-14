import { addDebugLog } from './storage';

export function notify(title: string, message: string) {
  try {
    const injectToast = (t: string, m: string) => {
      const err = m.toLowerCase().includes('fail') || t.toLowerCase().includes('fail');
      let container = document.getElementById('nt-toast-container');

      if (!container) {
        container = document.createElement('div');
        container.id = 'nt-toast-container';
        Object.assign(container.style, {
          position: 'fixed', bottom: '20px', right: '20px', zIndex: '2147483647',
          display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none'
        });
        document.body.appendChild(container);

        const style = document.createElement('style');
        style.textContent = `
        @keyframes nt-toast-deplete { from { width: 100%; } to { width: 0%; } }
        @keyframes nt-toast-slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .nt-toast {
          pointer-events: auto; position: relative; overflow: hidden;
          background: #0f1a0f; color: #3ddc84; border: 1px solid rgba(61,220,132,.4);
          border-radius: 5px; padding: 12px 15px 16px 15px;
          font-family: 'Courier New', monospace; font-size: 13px;
          box-shadow: 0 4px 20px rgba(0,0,0,.6); width: 300px; box-sizing: border-box;
          display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
          transition: opacity 0.3s, transform 0.3s; animation: nt-toast-slide-in 0.3s ease-out;
          direction: ltr; text-align: left; line-height: 1.4;
        }
        .nt-toast.nt-err { background: #1a0f0f; color: #f0706a; border-color: rgba(240,112,106,.4); }
        .nt-toast-bar { position: absolute; bottom: 0; left: 0; height: 4px; background: currentColor; opacity: 0.6; animation: nt-toast-deplete 3s linear forwards; }
        .nt-toast-close { background: none; border: none; color: inherit; cursor: pointer; font-size: 16px; line-height: 1; padding: 0; opacity: 0.6; transition: opacity 0.2s; font-family: sans-serif; }
        .nt-toast-close:hover { opacity: 1; }
        .nt-toast-content { display: flex; flex-direction: column; gap: 4px; flex: 1; word-break: break-word; }
        .nt-toast-title { font-weight: bold; font-family: system-ui, -apple-system, sans-serif; font-size: 14px; }
        .nt-toast-msg { opacity: 0.9; }
        `;
        document.head.appendChild(style);
      }

      const toast = document.createElement('div');
      toast.className = `nt-toast ${err ? 'nt-err' : ''}`;
      toast.innerHTML = `
      <div class="nt-toast-content">
      ${t ? `<span class="nt-toast-title">${t}</span>` : ''}
      ${m ? `<span class="nt-toast-msg">${m}</span>` : ''}
      </div>
      <button class="nt-toast-close">×</button>
      <div class="nt-toast-bar"></div>
      `;
      container.appendChild(toast);

      const timeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
      }, 3000);

      toast.querySelector('.nt-toast-close')!.addEventListener('click', () => {
        clearTimeout(timeout);
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
      });
    };

    if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.query) {
      browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        const tabId = tabs[0]?.id;
        if (tabId && browser.scripting && browser.scripting.executeScript) {
          browser.scripting.executeScript({
            target: { tabId },
            func: injectToast,
            args: [title, message]
          }).catch(() => null);
        } else if (tabId) {
          browser.tabs.sendMessage(tabId, { action: 'SHOW_TOAST', title, message }).catch(() => null);
        }
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
