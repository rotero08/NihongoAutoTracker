import { configStorage } from './storage';

const API_BASE = 'https://nihongotracker.com/api';

export async function submitLog(payload: any) {
  const config = await configStorage.getValue();
  if (!config.apiKey) throw new Error('No API Key configured.');

  const response = await fetch(`${API_BASE}/logs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }
  return response.json();
}
