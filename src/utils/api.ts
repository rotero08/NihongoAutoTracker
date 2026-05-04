// Notify routes through background — browser.notifications unavailable in content scripts
export function notify(title: string, message: string) {
  try {
    if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.query) {
      // Extension background script
      if (browser.notifications && browser.notifications.create) {
        browser.notifications.create({ type: 'basic', iconUrl: browser.runtime.getURL('icon128.png'), title, message }).catch(() => null);
      }
      browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        if (tabs[0]?.id) browser.tabs.sendMessage(tabs[0].id, { action: 'SHOW_TOAST', title, message }).catch(() => null);
      }).catch(() => null);
    } else {
      // Content script or popup
      browser.runtime.sendMessage({ action: 'NOTIFY', title, message }).catch(() => null);
      // Attempt local injection fallback if available
      if (typeof window !== 'undefined') {
        window.postMessage({ action: 'SHOW_TOAST', title, message }, '*');
      }
    }
  } catch (e) {
    // Context invalidated (e.g. extension reloaded) — silent
  }
}

export async function submitLog(payload: Record<string, unknown>): Promise<boolean> {
  const res = await browser.storage.local.get('config');
  const apiKey: string = res.config?.apiKey ?? '';

  if (!apiKey) {
    notify('Setup Required', 'Enter API Key in extension settings.');
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
      notify('Log Sent!', 'Data sent to NihongoTracker.');
      return true;
    } else {
      const errorText = await response.text();
      console.error('NT API error:', errorText);

      let shortError = errorText;
      try {
        const jsonErr = JSON.parse(errorText);
        if (jsonErr.message) shortError = jsonErr.message;
      } catch (e) {
        shortError = errorText.slice(0, 40) + (errorText.length > 40 ? '...' : '');
      }

      notify('Log Failed', `Status: ${response.status} - ${shortError}`);
      return false;
    }
  } catch (err) {
    console.error('NT fetch error:', err);
    notify('Network Error', 'Check connection or host_permissions.');
    return false;
  }
}
