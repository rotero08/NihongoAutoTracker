<!--
  ── OverlayTab.svelte ────────────────────────────────────────────────────────
  Overlay settings: position, track time, allow/skip site lists.
  Matches the original settings/index.html #tab-overlay section exactly.
-->
<script lang="ts">
  import { configStorage } from '@/lib/storage/config';
  import { BUILT_IN_ALLOW, BUILT_IN_SKIP } from '@/lib/constants';

  interface Props { onStatus: (msg: string, err?: boolean) => void; }
  let { onStatus }: Props = $props();

  let trackTime = $state(false);
  let overlayPos = $state('top-right');
  let allowListOnly = $state(false);
  let allowSites: string[] = $state([]);
  let skipSites: string[] = $state([]);
  let allowInput = $state('');
  let skipInput = $state('');
  let allowOpen = $state(false);
  let skipOpen = $state(false);

  export async function load() {
    const cfg = await configStorage.getValue() as any;
    trackTime = cfg.trackTime ?? false;
    overlayPos = cfg.overlayPosition ?? 'top-right';
    allowListOnly = cfg.allowListOnly ?? false;
    allowSites = cfg.allowSites ?? [...BUILT_IN_ALLOW];
    skipSites = cfg.skipSites ?? [...BUILT_IN_SKIP];
  }

  async function save() {
    const cfg = await configStorage.getValue() as any;
    await configStorage.setValue({ ...cfg, trackTime, allowListOnly, overlayPosition: overlayPos });
    onStatus('✓ Overlay Settings Saved');
  }

  async function reset() {
    const cfg = await configStorage.getValue() as any;
    await configStorage.setValue({ ...cfg, trackTime: true, allowListOnly: false, overlayPosition: 'top-right', allowSites: [...BUILT_IN_ALLOW], skipSites: [...BUILT_IN_SKIP] });
    await load();
    onStatus('✓ Defaults Restored');
  }

  async function addSite(list: 'allow' | 'skip') {
    const val = (list === 'allow' ? allowInput : skipInput).trim().toLowerCase();
    if (!val) return;
    const cfg = await configStorage.getValue() as any;
    const key = list === 'allow' ? 'allowSites' : 'skipSites';
    const sites: string[] = cfg[key] ?? (list === 'allow' ? [...BUILT_IN_ALLOW] : [...BUILT_IN_SKIP]);
    if (!sites.includes(val)) {
      await configStorage.setValue({ ...cfg, [key]: [...sites, val] });
      if (list === 'allow') allowInput = ''; else skipInput = '';
      await load();
      onStatus(`✓ ${list === 'allow' ? 'Allowed' : 'Skipped'} Site Added`);
    }
  }

  async function removeSite(domain: string, list: 'allow' | 'skip') {
    const cfg = await configStorage.getValue() as any;
    const key = list === 'allow' ? 'allowSites' : 'skipSites';
    const sites: string[] = cfg[key] ?? (list === 'allow' ? [...BUILT_IN_ALLOW] : [...BUILT_IN_SKIP]);
    await configStorage.setValue({ ...cfg, [key]: sites.filter(d => d !== domain) });
    await load();
  }

  load();
</script>

<div class="tab-head"><h2>Text Overlay</h2></div>
<p class="hint">A small draggable timer overlay shown on Japanese pages while you read.</p>

<div class="field">
  <label class="toggle">
    <input type="checkbox" id="track-time" class="toggle-chk" bind:checked={trackTime} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Include active reading time in context-menu logs
  </label>
</div>

<div class="field">
  <label class="label">Default Position</label>
  <div class="pos-grid">
    <label class="pos-opt"><input type="radio" name="overlay-pos" value="top-left" bind:group={overlayPos} /> Top Left</label>
    <label class="pos-opt"><input type="radio" name="overlay-pos" value="top-right" bind:group={overlayPos} /> Top Right</label>
    <label class="pos-opt"><input type="radio" name="overlay-pos" value="bottom-left" bind:group={overlayPos} /> Bottom Left</label>
    <label class="pos-opt"><input type="radio" name="overlay-pos" value="bottom-right" bind:group={overlayPos} /> Bottom Right</label>
    <label class="pos-opt pos-wide"><input type="radio" name="overlay-pos" value="hidden" bind:group={overlayPos} /> Hidden</label>
  </div>
</div>

<div style="display:flex; gap:10px; margin-bottom:36px">
  <button id="save-overlay-btn" class="btn btn-amber" onclick={save}>Save</button>
  <button id="reset-overlay-btn" class="btn btn-ghost" onclick={reset}>Revert to Default</button>
</div>

<!-- Sites sub-section -->
<div class="sub-head"><h3>Sites</h3></div>
<p class="hint" style="margin-top:0">
  <strong style="color:var(--text)">It auto-detects japanese characters in a website to force the overlay.</strong><br/>
  To control where the overlay appears, click a domain to edit it inline.<br/>
  <strong style="color:var(--text)">Note:</strong> Sites in the Allow list force the overlay to appear, bypassing auto-detection. Sites on the Skip list, skips them even if it detects japanese characters.
</p>

<div class="field">
  <label class="toggle">
    <input type="checkbox" id="allow-list-only" class="toggle-chk" bind:checked={allowListOnly} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Only show overlay on Allow sites (disables auto-detection completely)
  </label>
</div>

<!-- Allow list -->
<div class="sites-group">
  <div class="sites-toggle-head" class:open={allowOpen} role="button" tabindex="0" onclick={() => allowOpen = !allowOpen} onkeydown={e => e.key === 'Enter' && (allowOpen = !allowOpen)}>
    <div class="sites-head-left">
      <span class="sites-head-label allow">Allow</span>
      <span class="sites-head-count" id="allow-count">{allowSites.length}</span>
    </div>
    <span class="sites-chevron"><svg viewBox="0 0 12 8"><polyline points="1,1 6,7 11,1"/></svg></span>
  </div>
  {#if allowOpen}
  <div class="sites-body open" id="allow-body">
    <div class="site-list" id="allow-list">
      {#each allowSites as site}
        <div class="site-item">
          <span class="site-item-host">{site}</span>
          <button class="site-remove" onclick={() => removeSite(site, 'allow')}>
            <svg viewBox="0 0 10 10"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
          </button>
        </div>
      {/each}
    </div>
    <div class="add-site-row">
      <input type="text" id="allow-input" class="input" placeholder="e.g. example.jp" bind:value={allowInput} />
      <button id="allow-add" class="btn btn-amber btn-sm" onclick={() => addSite('allow')}>Add</button>
    </div>
  </div>
  {/if}
</div>

<!-- Skip list -->
<div class="sites-group">
  <div class="sites-toggle-head" class:open={skipOpen} role="button" tabindex="0" onclick={() => skipOpen = !skipOpen} onkeydown={e => e.key === 'Enter' && (skipOpen = !skipOpen)}>
    <div class="sites-head-left">
      <span class="sites-head-label skip">Skip</span>
      <span class="sites-head-count" id="skip-count">{skipSites.length}</span>
    </div>
    <span class="sites-chevron"><svg viewBox="0 0 12 8"><polyline points="1,1 6,7 11,1"/></svg></span>
  </div>
  {#if skipOpen}
  <div class="sites-body open" id="skip-body">
    <div class="site-list" id="skip-list">
      {#each skipSites as site}
        <div class="site-item">
          <span class="site-item-host">{site}</span>
          <button class="site-remove" onclick={() => removeSite(site, 'skip')}>
            <svg viewBox="0 0 10 10"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
          </button>
        </div>
      {/each}
    </div>
    <div class="add-site-row">
      <input type="text" id="skip-input" class="input" placeholder="e.g. example.com" bind:value={skipInput} />
      <button id="skip-add" class="btn btn-amber btn-sm" onclick={() => addSite('skip')}>Add</button>
    </div>
  </div>
  {/if}
</div>
