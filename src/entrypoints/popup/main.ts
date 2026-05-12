import './style.css';
import { videoQueueStorage, readingQueueStorage, configStorage } from '@/utils/storage';
import { resolveVideoChannelMedia, submitLog } from '@/utils/api';

const queueListEl  = document.getElementById('queue-list')!;
const queueCountEl = document.getElementById('queue-count')!;
const queueBulkEl  = document.getElementById('queue-bulk')!;
const apiPillEl    = document.getElementById('api-pill')!;
const btnOpen      = document.getElementById('btn-open')!;
const btnSettings  = document.getElementById('btn-settings')!;
const btnSendAll   = document.getElementById('btn-send-all')!;
const btnClearAll  = document.getElementById('btn-clear-all')!;

let currentFilter = 'all';

document.querySelectorAll('.q-tab').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.q-tab').forEach(b => b.classList.remove('active'));
    const target = e.target as HTMLElement;
    target.classList.add('active');
    currentFilter = target.dataset.filter!;
    applyFilter();
  });
});

function applyFilter() {
  const items = document.querySelectorAll('.qi');
  items.forEach(el => {
    const type = (el as HTMLElement).dataset.type;
    const match = currentFilter === 'all' || currentFilter === type;
    (el as HTMLElement).style.display = match ? 'flex' : 'none';
  });
}

function openSettings() {
  browser.tabs.create({ url: browser.runtime.getURL('/settings.html') });
  window.close();
}
btnOpen.addEventListener('click', openSettings);
btnSettings.addEventListener('click', openSettings);

function esc(s: string) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

const toLocalDT = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function parseTitle(docTitle: string) {
  let base = docTitle.replace(/\s*\|\s*ッツ Ebook Reader\s*/i, '').trim();
  let title = base;
  let volume: number | undefined = undefined;

  if (/^\d+$/.test(base)) return { query: base, volume: undefined };

  const volMatch = base.match(/^(.*?)[\s\-_]+(?:vol(?:ume)?\.?\s*|v|第)?(\d+)\s*(?:巻|話|章)?$/i);
  if (volMatch && volMatch[1].trim().length > 0 && !/^\d+$/.test(volMatch[1].trim())) {
    title = volMatch[1].trim();
    volume = parseInt(volMatch[2], 10);
  } else {
    const match2 = base.match(/^(.*?[a-zA-Z\u3040-\u30ff\u4e00-\u9fff]+.*?)(\d+)$/);
    if (match2) {
      title = match2[1].trim();
      volume = parseInt(match2[2], 10);
    }
  }
  return { query: title, volume };
}

function stripVideoTitle(title: string): string {
  return title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube\s*$/i, '').trim();
}

async function ensureVideoMediaData(item: any) {
  const channelId = item.channelId || item.mediaData?.channelId;
  const channelTitle = item.mediaData?.channelTitle || item.channelTitle || item.contentTitleNative;
  if (item.mediaData?.channelImage && item.mediaData?.channelDescription) return;
  if (!channelId && !channelTitle) return;

  const media = await resolveVideoChannelMedia({ channelId, channelTitle });
  item.mediaData = {
    ...(item.mediaData || {}),
    channelId: media.channelId || channelId || item.channelId || 'web-video',
    channelTitle: media.channelTitle || channelTitle || item.channelTitle || item.contentTitleNative,
    ...(media.channelImage ? { channelImage: media.channelImage } : {}),
    ...(media.channelDescription ? { channelDescription: media.channelDescription } : {}),
  };

  if (!item.channelId && (media.channelId || channelId)) {
    item.channelId = media.channelId || channelId;
  }
}

function getPayloadsForItem(item: any, el: HTMLElement) {
  const type = el.dataset.type as 'video' | 'reading';
  const desc = (el.querySelector('.qi-title') as HTMLInputElement).value;

  const generalMins = Number((el.querySelector('.qi-time-num') as HTMLInputElement).value);
  const generalChars = type === 'reading' ? Number((el.querySelector('.qi-chars-num') as HTMLInputElement).value) : 0;
  const volumeEl = el.querySelector('.qi-vol') as HTMLInputElement | null;
  const selectedVolume = type === 'reading'
  ? Math.max(1, Number(volumeEl?.value || item.volume || 1))
  : undefined;

  const sessionNodes = Array.from(el.querySelectorAll('.qi-session'));
  const sumMins = sessionNodes.reduce((acc, node) => acc + Number((node.querySelector('.session-num') as HTMLInputElement).value), 0);
  const sumChars = type === 'reading' ? sessionNodes.reduce((acc, node) => acc + Number((node.querySelector('.session-chars') as HTMLInputElement).value), 0) : 0;

  let apiTitle = desc || (type === 'reading' ? (item.mediaData?.contentTitleNative || item.contentTitleNative) : item.contentTitleNative);
  if (type === 'video') apiTitle = stripVideoTitle(apiTitle);

  const base: any = {
    type,
    description: apiTitle,
    episodes: 0,
    pages: 0,
    unknownDate: false
  };

  if (type === 'reading') {
    base.mediaId = item.mediaId || 'web-reading';
    base.volume = selectedVolume || 1;
    base.mediaData = item.mediaData || { contentId: "web-reading", contentTitleNative: item.contentTitleNative };
  } else {
    base.mediaId = item.mediaData?.channelId || item.channelId || 'web-video';
    base.mediaData = item.mediaData || { channelId: item.channelId || "web-video", channelTitle: item.contentTitleNative };
  }

  if (sessionNodes.length === 0 || generalMins > sumMins || (type === 'reading' && generalChars > sumChars)) {
    return[{
      ...base,
      time: generalMins,
      date: new Date((el.querySelector('.qi-date') as HTMLInputElement).value).toISOString(),
      chars: generalChars
    }];
  }

  return sessionNodes.map(node => ({
    ...base,
    time: Number((node.querySelector('.session-num') as HTMLInputElement).value),
                                   date: new Date((node.querySelector('.session-date') as HTMLInputElement).value).toISOString(),
                                   chars: type === 'reading' ? Number((node.querySelector('.session-chars') as HTMLInputElement).value) : 0
  }));
}

async function sendItem(id: string, el: HTMLElement): Promise<boolean> {
  const type = el.dataset.type as 'video' | 'reading';
  const qStorage = type === 'reading' ? readingQueueStorage : videoQueueStorage;
  const q = await qStorage.getValue();
  const item = q.find((x: any) => x.id === id);
  if (!item) return false;

  el.classList.add('sending');
  const btn = el.querySelector('.qi-send') as HTMLButtonElement;
  if(btn) btn.disabled = true;

  if (type === 'reading') {
    try {
      const readingItem = item as any;
      const cfg = await configStorage.getValue() as any;
      const { query, volume } = parseTitle(readingItem.contentTitleNative);
      if (!readingItem.mediaId || !readingItem.mediaData?.contentId) {
        const res = await fetch(`https://nihongotracker.app/api/media/anilist/search?search=${encodeURIComponent(query)}&type=MANGA&page=1&perPage=5&format=NOVEL`, {
          headers: { 'X-API-Key': cfg.apiKey ?? '' }
        });
        if (res.ok) {
          const data = await res.json();
          const results: any[] = Array.isArray(data) ? data : (data.data ??[]);
          if (results.length > 0) {
            const media = results[0];
            readingItem.mediaData = {
              contentId: media.contentId,
              contentTitleNative: media.title?.contentTitleNative ?? media.contentTitleNative,
              contentTitleEnglish: media.title?.contentTitleEnglish ?? media.contentTitleEnglish,
              contentTitleRomaji: media.title?.contentTitleRomaji ?? media.contentTitleRomaji,
              contentImage: media.contentImage, coverImage: media.coverImage,
              chapters: media.chapters, volumes: media.volumes,
            };
            readingItem.mediaId = media.contentId;
            readingItem.volume = volume !== undefined ? volume : 1;
          } else { readingItem.volume = volume || 1; }
        } else { readingItem.volume = volume || 1; }
      }
    } catch (e) { console.error("Anilist fetch error", e); }
  }

  if (type === 'video') {
    try {
      await ensureVideoMediaData(item);
    } catch (e) {
      console.error('Video channel fetch error', e);
    }
  }

  const payloads = getPayloadsForItem(item, el);
  let success = true;
  for (const p of payloads) { if (!(await submitLog(p))) success = false; }

  if (success) {
    await qStorage.setValue(q.filter((x: any) => x.id !== id) as any);
    el.classList.add('sent');
    setTimeout(() => { el.remove(); refreshMeta(); }, 380);
  } else {
    el.classList.remove('sending');
    if(btn) btn.disabled = false;
  }
  return success;
}

async function removeItem(id: string, el: HTMLElement) {
  const type = el.dataset.type as 'video' | 'reading';
  const qStorage = type === 'reading' ? readingQueueStorage : videoQueueStorage;
  const q = await qStorage.getValue();
  await qStorage.setValue(q.filter((x: any) => x.id !== id) as any);
  el.remove();
  await refreshMeta();
}

async function refreshMeta() {
  const vQ = await videoQueueStorage.getValue();
  const rQ = await readingQueueStorage.getValue();
  const total = vQ.length + rQ.length;
  queueCountEl.textContent = String(total);
  queueBulkEl.style.display = total ? 'flex' : 'none';
  if (total === 0) {
    queueListEl.innerHTML = '<div class="empty-msg">Queue is empty.</div>';
  }
}

function buildItem(item: any, type: 'video' | 'reading'): HTMLElement {
  const isRead = type === 'reading';
  const rawTitle = item.description || item.contentTitleNative || 'Unknown Title';
  const title = esc(type === 'video' ? stripVideoTitle(rawTitle) : rawTitle);

  let channelName = '';
  let urlDisplay = '';
  if (isRead) {
    channelName = esc(item.readerName || 'Reader') + ' \u2022 ' + esc(item.originalTitle || item.description || item.contentTitleNative || '');
    urlDisplay = '';
  } else {
    channelName = esc(item.channelTitle || item.contentTitleNative || 'YouTube');
    urlDisplay = '\u2022 ' + esc(item.contentTitleEnglish || item.channelId || '');
  }

  const sessions: any[] = item.sessions ??[];
  const displayMins = isRead ? Math.max(1, Math.round((item.time || 0) / 60)) : (item.time || 0);
  const volumeVal = Math.max(1, Number(item.volume || 1));
  const defaultDateStr = sessions.length > 0 ? sessions[0].date : (item.date || new Date().toISOString());
  const dateVal = toLocalDT(defaultDateStr);
  const isLinked = isRead
  ? !!(item.mediaId && item.mediaId !== 'web-reading')
  : !!(((item as any).channelId && (item as any).channelId !== 'web-video') || (item.mediaData?.channelId && item.mediaData.channelId !== 'web-video'));

  const el = document.createElement('div');
  el.className = 'qi';
  el.dataset.id = item.id;
  el.dataset.type = type;

  let sessionsHtml = '';
  if (sessions.length > 1) {
    sessionsHtml = `<div class="qi-sessions">` + sessions.map((s, i) => `
    <div class="qi-session" data-session-id="${s.id}">
    <span class="session-dot"></span>
    <span class="session-label">S${i + 1}</span>
    <input class="ghost-num session-num" type="number" min="1" value="${Math.max(1, Math.round(s.secs / 60))}"/>
    <span class="unit-lbl">min</span>
    ${isRead ? `<input class="ghost-num num-chars session-chars" type="number" value="${s.chars || 0}"/><span class="unit-lbl">chars</span>` : ''}
    <input class="ghost-date session-date" type="datetime-local" value="${toLocalDT(s.date)}" style="margin-left:auto;"/>
    <button class="qi-session-remove" title="Remove" style="background:none;border:none;color:var(--red);cursor:pointer;padding:0 4px;font-size:12px;">×</button>
    </div>`).join('') + `</div>`;
  }

  el.innerHTML = `
  <div class="qi-title-row">
  <div class="qi-search-wrap">
  ${isRead ? `<svg class="qi-search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>` : ''}
  <input class="ghost-input qi-title ${isRead ? 'searchable' : ''}" type="text" value="${title}" title="${title}"/>
  ${isRead ? `<div class="qi-search-dropdown"></div>` : ''}
  </div>
  ${isLinked ? (isRead ? `<button class="qi-link-status" title="Unlink AniList">✓</button>` : `<span class="qi-link-status" title="Matched" style="cursor:default">✓</span>`) : ''}
  <button class="qi-del" title="Remove">×</button>
  </div>
  <div class="qi-meta-row" style="flex-wrap:wrap; gap:0;">
  <input class="ghost-num qi-time-num" type="number" min="1" value="${displayMins}" title="Total minutes"/>
  <span class="unit-lbl">min</span>
  ${isRead ? `<input class="ghost-num num-chars qi-chars-num" type="number" min="0" value="${item.chars || 0}"/><span class="unit-lbl">chars</span>` : ''}
  ${isRead ? `<input class="ghost-num num-vol qi-vol" type="number" min="1" value="${volumeVal}" title="Volume"/><span class="unit-lbl">vol</span>` : ''}
  <span class="qi-meta-sep">·</span>
  <div class="qi-mid">
  <span class="qi-channel" title="${channelName} ${urlDisplay}">${channelName} ${urlDisplay}</span>
  </div>
  <div style="flex-basis: 100%; height: 0;"></div>
  <input class="ghost-date qi-date" type="datetime-local" value="${dateVal}" style="text-align:left; margin-left:0;"/>
  <button class="qi-send" style="margin-left:auto;">Send</button>
  </div>
  ${sessionsHtml}
  `;

  if (isRead) {
    const descInput = el.querySelector('.qi-title') as HTMLInputElement;
    const dropdown = el.querySelector('.qi-search-dropdown') as HTMLElement;
    const volumeEl = el.querySelector<HTMLInputElement>('.qi-vol');
    let debounceTimer: any;

    const bindUnlink = (btn: HTMLElement) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.mediaId = 'web-reading';
        item.mediaData = null;
        const q = await readingQueueStorage.getValue();
        const idx = q.findIndex((x: any) => x.id === item.id);
        if (idx > -1) { q[idx] = item; await readingQueueStorage.setValue(q); }
        btn.remove();
      });
      btn.addEventListener('mouseenter', () => { btn.textContent = '✗'; btn.style.color = 'var(--red)'; });
      btn.addEventListener('mouseleave', () => { btn.textContent = '✓'; btn.style.color = 'var(--green)'; });
    };

    const existingLink = el.querySelector('.qi-link-status') as HTMLElement;
    if (existingLink) bindUnlink(existingLink);

    const executeSearch = async (query: string) => {
      dropdown.innerHTML = '<div style="padding:6px;text-align:center;font-size:11px;color:var(--dim)">Searching...</div>';
      dropdown.classList.add('open');

      try {
        const cfg = await configStorage.getValue() as any;
        const res = await fetch(`https://nihongotracker.app/api/media/anilist/search?search=${encodeURIComponent(query)}&type=MANGA&page=1&perPage=5&format=NOVEL`, {
          headers: { 'X-API-Key': cfg.apiKey ?? '' }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const results = Array.isArray(data) ? data : (data.data ??[]);

        if (results.length === 0) {
          dropdown.innerHTML = '<div style="padding:6px;text-align:center;font-size:11px;color:var(--dim)">No results</div>';
          return;
        }

        dropdown.innerHTML = '';
        results.forEach((m: any) => {
          const row = document.createElement('div');
          row.className = 'qi-search-item';
          const native = m.title?.contentTitleNative || m.contentTitleNative || 'Unknown';
          const img = m.coverImage || m.contentImage || '';

        row.innerHTML = `
        ${img ? `<img class="qi-search-cover" src="${img}" />` : `<div class="qi-search-cover" style="background:var(--bdr2)"></div>`}
        <div class="qi-search-info">
        <div class="qi-search-title">${esc(native)}</div>
        </div>`;

        row.addEventListener('mousedown', async (e) => {
          e.preventDefault();
          descInput.value = native;

          const { volume } = parseTitle(native);
          item.mediaData = {
            contentId: m.contentId,
            contentTitleNative: native,
            contentTitleEnglish: m.title?.contentTitleEnglish || m.contentTitleEnglish,
            contentTitleRomaji: m.title?.contentTitleRomaji || m.contentTitleRomaji,
            contentImage: img, coverImage: img,
            chapters: m.chapters, volumes: m.volumes,
          };
          item.mediaId = m.contentId;
          item.volume = volume || 1;
          item.description = native;
          if (volumeEl) volumeEl.value = String(item.volume || 1);

          const q = await readingQueueStorage.getValue();
          const idx = q.findIndex((x: any) => x.id === item.id);
          if (idx > -1) { q[idx] = item; await readingQueueStorage.setValue(q); }

          dropdown.classList.remove('open');

          if (!el.querySelector('.qi-link-status')) {
            el.querySelector('.qi-search-wrap')!.insertAdjacentHTML('afterend', `<button class="qi-link-status" title="Unlink AniList">✓</button>`);
            bindUnlink(el.querySelector('.qi-link-status') as HTMLElement);
          }
        });
        dropdown.appendChild(row);
        });
      } catch {
        dropdown.innerHTML = '<div style="padding:6px;text-align:center;font-size:11px;color:var(--red)">Failed</div>';
      }
    };

    descInput.addEventListener('input', () => {
      if (item.mediaId && item.mediaId !== 'web-reading') {
        item.mediaId = 'web-reading';
        item.mediaData = null;
        el.querySelector('.qi-link-status')?.remove();
      }

      clearTimeout(debounceTimer);
      const query = descInput.value.trim();
      if (query.length < 2) { dropdown.classList.remove('open'); return; }

      debounceTimer = setTimeout(() => executeSearch(query), 500);
    });

    descInput.addEventListener('blur', () => dropdown.classList.remove('open'));
    descInput.addEventListener('focus', () => {
      const query = descInput.value.trim();
      if (query.length >= 2) {
        if (dropdown.children.length === 0) {
          executeSearch(query);
        } else {
          dropdown.classList.add('open');
        }
      }
    });
  }

  // Session limits logic
  const minsEl = el.querySelector<HTMLInputElement>('.qi-time-num')!;
  const charsEl = el.querySelector<HTMLInputElement>('.qi-chars-num');
  const volumeInputEl = el.querySelector<HTMLInputElement>('.qi-vol');
  const sessionMinsEls = Array.from(el.querySelectorAll<HTMLInputElement>('.session-num'));
  const sessionCharsEls = Array.from(el.querySelectorAll<HTMLInputElement>('.session-chars'));

  const updateGeneralMin = () => {
    const sumMins = sessionMinsEls.reduce((acc, input) => acc + Number(input.value), 0);
    minsEl.min = String(sumMins);
    if (Number(minsEl.value) < sumMins) minsEl.value = String(sumMins);

    if (charsEl) {
      const sumChars = sessionCharsEls.reduce((acc, input) => acc + Number(input.value), 0);
      charsEl.min = String(sumChars);
      if (Number(charsEl.value) < sumChars) charsEl.value = String(sumChars);
    }
  };

  updateGeneralMin();

  minsEl.addEventListener('blur', () => {
    const minVal = Number(minsEl.min || 0);
    if (Number(minsEl.value) < minVal) minsEl.value = String(minVal);
  });
    sessionMinsEls.forEach(input => input.addEventListener('input', updateGeneralMin));

    if (charsEl) {
      charsEl.addEventListener('blur', () => {
        const minVal = Number(charsEl.min || 0);
        if (Number(charsEl.value) < minVal) charsEl.value = String(minVal);
      });
        sessionCharsEls.forEach(input => input.addEventListener('input', updateGeneralMin));
    }

    if (volumeInputEl) {
      const clampVolume = () => {
        const next = Math.max(1, Number(volumeInputEl.value) || 1);
        volumeInputEl.value = String(next);
        return next;
      };
      const persistVolume = async (next: number) => {
        item.volume = next;
        const q = await readingQueueStorage.getValue();
        const idx = q.findIndex((x: any) => x.id === item.id);
        if (idx !== -1) {
          q[idx].volume = next;
          await readingQueueStorage.setValue(q);
        }
      };

      volumeInputEl.addEventListener('blur', () => { void persistVolume(clampVolume()); });
      volumeInputEl.addEventListener('change', () => { void persistVolume(clampVolume()); });
    }

    el.querySelector('.qi-send')!.addEventListener('click', () => sendItem(item.id, el));
    el.querySelector('.qi-del')!.addEventListener('click', () => removeItem(item.id, el));

    el.querySelectorAll('.qi-session-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const sId = (e.target as HTMLElement).closest('.qi-session')!.getAttribute('data-session-id');
        if (type === 'reading') {
          const q = await readingQueueStorage.getValue();
          const idx = q.findIndex((x: any) => x.id === item.id);
          if (idx !== -1) {
            const entry = q[idx];
            if (!entry) return;
            const sessions = (entry.sessions ??[]).filter((s: any) => s.id !== sId);
            entry.sessions = sessions;
            const totalSecs = sessions.reduce((a: any, b: any) => a + b.secs, 0);
            entry.time = totalSecs;
            (entry as { chars: number }).chars = sessions.reduce((a: any, b: any) => a + (b.chars || 0), 0);
            await readingQueueStorage.setValue(q);
            render(); // re-render
          }
        } else {
          const q = await videoQueueStorage.getValue();
          const idx = q.findIndex((x: any) => x.id === item.id);
          if (idx !== -1) {
            const entry = q[idx];
            if (!entry) return;
            const sessions = (entry.sessions ??[]).filter((s: any) => s.id !== sId);
            entry.sessions = sessions;
            const totalSecs = sessions.reduce((a: any, b: any) => a + b.secs, 0);
            entry.time = Math.round(totalSecs / 60);
            await videoQueueStorage.setValue(q);
            render(); // re-render
          }
        }
      });
    });

    return el;
}

// ── Render ────────────────────────────────────────────────────────────────────
async function render() {
  const cfg = await configStorage.getValue();
  const vQ = await videoQueueStorage.getValue();
  const rQ = await readingQueueStorage.getValue();

  apiPillEl.textContent = cfg?.apiKey ? 'API Key ✓' : 'No API Key';
  apiPillEl.className = `pill ${cfg?.apiKey ? 'pill-ok' : 'pill-off'}`;

  const total = vQ.length + rQ.length;
  queueCountEl.textContent = String(total);
  queueBulkEl.style.display = total ? 'flex' : 'none';

  if (total === 0) {
    queueListEl.innerHTML = '<div class="empty-msg">Queue is empty.</div>';
    return;
  }

  queueListEl.innerHTML = '';
  rQ.forEach(item => queueListEl.appendChild(buildItem(item, 'reading')));
  vQ.forEach(item => queueListEl.appendChild(buildItem(item, 'video')));

  applyFilter();
}

// ── Send All ──────────────────────────────────────────────────────────────────
btnSendAll.addEventListener('click', async () => {
  const btn = btnSendAll as HTMLButtonElement;
  btn.textContent = '…'; btn.disabled = true;

  const items =[...queueListEl.querySelectorAll<HTMLElement>('.qi')];
  for (const el of items) {
    if (el.style.display !== 'none') {
      await sendItem(el.dataset.id!, el);
    }
  }

  btn.textContent = 'Send All'; btn.disabled = false;
  await refreshMeta();
});

// ── Clear All ─────────────────────────────────────────────────────────────────
btnClearAll.addEventListener('click', async () => {
  if (currentFilter === 'all' || currentFilter === 'video') await videoQueueStorage.setValue([]);
  if (currentFilter === 'all' || currentFilter === 'reading') await readingQueueStorage.setValue([]);
  await render();
});

// ── Live updates ──────────────────────────────────────────────────────────────
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes['videoQueue'] || changes['readingQueue'])) {
    if (!document.querySelector('.qi-title:focus, .qi-time-num:focus, .qi-chars-num:focus, .qi-vol:focus, .qi-date:focus, .session-num:focus, .session-chars:focus, .session-date:focus')) {
      render();
    }
  }
});

render();
