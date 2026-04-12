const API_BASE = 'https://nihongotracker.app/api';

// Added "export" here so background.ts can see it
export function notify(title: string, message: string) {
  browser.notifications.create({
    type: 'basic',
    iconUrl: '/icon/48.png',
    title: title,
    message: message,
  });
}

export async function submitLog(payload: any) {
  const res = await browser.storage.local.get('apiKey');
  const apiKey = res.apiKey;

  if (!apiKey) {
    notify('Setup Required', 'Please enter your API Key.');
    return;
  }

  try {
    // NOTE: Ensure this URL matches your tracker's actual API documentation
    const response = await fetch('https://nihongotracker.app/api/logs', {
      method: 'POST',
      mode: 'cors', // Explicitly request CORS
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      notify('Log Success!', 'Data sent to NihongoTracker.');
    } else {
      const errorText = await response.text();
      console.error('Server Error:', errorText);
      notify('Log Failed', `Status: ${response.status}`);
    }
  } catch (err) {
    // This is where your current error is being caught
    console.error('Fetch Check:', err);
    notify('Network Error', 'Check connection or permissions.');
  }
}
