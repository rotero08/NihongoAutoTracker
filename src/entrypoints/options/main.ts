import './style.css';

const input = document.getElementById('api-key') as HTMLInputElement;
const saveBtn = document.getElementById('save-btn');
const status = document.getElementById('status');

// Load current key using native browser API
browser.storage.local.get('apiKey').then((res) => {
  if (res.apiKey) input.value = res.apiKey;
});

saveBtn?.addEventListener('click', async () => {
  const newKey = input.value.trim();
  
  // Save using native browser API
  await browser.storage.local.set({ apiKey: newKey });
  
  if (status) {
    status.innerText = 'Saved Successfully!';
    console.log('Key saved to storage:', newKey);
    setTimeout(() => { status.innerText = ''; }, 3000);
  }
});
