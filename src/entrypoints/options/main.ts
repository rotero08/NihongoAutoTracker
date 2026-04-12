import { configStorage } from '@/utils/storage';

const els = {
  apiKey: document.getElementById('api-key') as HTMLInputElement,
  logMode: document.getElementById('log-mode') as HTMLSelectElement,
  threshold: document.getElementById('threshold') as HTMLInputElement,
  trackTime: document.getElementById('track-time') as HTMLInputElement,
  hideButtons: document.getElementById('hide-buttons') as HTMLInputElement,
  saveBtn: document.getElementById('save-btn') as HTMLButtonElement,
  status: document.getElementById('status') as HTMLDivElement,
};

configStorage.getValue().then((config) => {
  els.apiKey.value = config.apiKey;
  els.logMode.value = config.logMode;
  els.threshold.value = config.threshold.toString();
  els.trackTime.checked = config.trackTextTime;
  els.hideButtons.checked = config.hideButtons;
});

els.saveBtn.addEventListener('click', async () => {
  let thresholdVal = parseInt(els.threshold.value);
  if (thresholdVal < 90) thresholdVal = 90;
  if (thresholdVal > 100) thresholdVal = 100;

  await configStorage.setValue({
    apiKey: els.apiKey.value,
    logMode: els.logMode.value as 'auto' | 'manual',
    threshold: thresholdVal,
    trackTextTime: els.trackTime.checked,
    hideButtons: els.hideButtons.checked,
  });

  els.status.textContent = 'Settings Saved Successfully!';
  setTimeout(() => { els.status.textContent = ''; }, 2000);
});
