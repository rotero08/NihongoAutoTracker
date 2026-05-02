export function notify(title: string, message: string) {
  browser.notifications.create({
    type: 'basic',
    iconUrl: '/icon/48.png',
    title,
    message,
  });
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
      notify('Log Failed', `Status: ${response.status}`);
      return false;
    }
  } catch (err) {
    console.error('NT fetch error:', err);
    notify('Network Error', 'Check connection or host_permissions.');
    return false;
  }
}
