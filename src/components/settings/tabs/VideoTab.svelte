<!--
  ── VideoTab.svelte ──────────────────────────────────────────────────────────
  Video tracking settings: thresholds, auto-send, badge display, toggles.
  Matches the original settings/index.html design exactly.
-->
<script lang="ts">
  import { configStorage } from '@/lib/storage/config';

  interface Props { onStatus: (msg: string, err?: boolean) => void; }
  let { onStatus }: Props = $props();

  /* ── State ── */
  let autoSend = $state(false);
  let threshType = $state('time');
  let threshPct = $state(95);
  let threshMin = $state(30);
  let queueThreshType = $state('time');
  let queueThreshPct = $state(5);
  let queueThreshMin = $state(1);
  let hideButtons = $state(false);
  let hideIfNotJp = $state(false);
  let hideMusic = $state(false);
  let enablePlaylist = $state(true);
  let playlistHideNonJp = $state(true);
  let showTotal = $state('total');

  export async function load() {
    const cfg = await configStorage.getValue() as any;
    autoSend = cfg.autoSend ?? (cfg.logMode === 'auto');
    threshType = cfg.thresholdType ?? 'time';
    threshPct = cfg.thresholdType === 'percent' ? (cfg.thresholdValue ?? cfg.threshold ?? 95) : 95;
    threshMin = cfg.thresholdType === 'time' ? (cfg.thresholdValue ?? cfg.threshold ?? 30) : 30;
    queueThreshType = cfg.queueThresholdType ?? 'time';
    queueThreshPct = cfg.queueThresholdType === 'percent' ? (cfg.queueThresholdValue ?? 5) : 5;
    queueThreshMin = cfg.queueThresholdType === 'time' ? (cfg.queueThresholdValue ?? 1) : 1;
    hideButtons = cfg.hideButtons ?? false;
    hideIfNotJp = cfg.hideIfNotJapanese ?? false;
    hideMusic = cfg.hideMusic ?? false;
    enablePlaylist = cfg.enablePlaylistLogger ?? true;
    playlistHideNonJp = cfg.playlistHideNonJapanese ?? true;
    showTotal = (cfg.showTotalInBadge ?? true) ? 'total' : 'session';
  }

  async function save() {
    const cfg = await configStorage.getValue() as any;
    const tVal = threshType === 'percent' ? threshPct : threshMin;
    const qtVal = queueThreshType === 'percent' ? queueThreshPct : queueThreshMin;
    await configStorage.setValue({
      ...cfg, autoSend, logMode: autoSend ? 'auto' : 'manual',
      thresholdType: threshType, thresholdValue: tVal,
      queueThresholdType: queueThreshType, queueThresholdValue: qtVal,
      hideButtons, hideIfNotJapanese: hideIfNotJp, hideMusic,
      enablePlaylistLogger: enablePlaylist, playlistHideNonJapanese: playlistHideNonJp,
      showTotalInBadge: showTotal === 'total',
    });
    onStatus('✓ Video Settings Saved');
  }

  async function reset() {
    const cfg = await configStorage.getValue() as any;
    await configStorage.setValue({
      ...cfg, autoSend: false, logMode: 'manual', thresholdType: 'time', thresholdValue: 30,
      queueThresholdType: 'time', queueThresholdValue: 1,
      hideButtons: false, hideIfNotJapanese: false, hideMusic: false,
      enablePlaylistLogger: true, playlistHideNonJapanese: true, showTotalInBadge: true,
    });
    await load();
    onStatus('✓ Defaults Restored');
  }

  /* ── Spinner helpers (match original SVG arrow buttons) ── */
  function spinUp(getter: () => number, setter: (v: number) => void) {
    setter(getter() + 1);
  }
  function spinDn(getter: () => number, setter: (v: number) => void) {
    setter(Math.max(1, getter() - 1));
  }

  load();
</script>

<div class="tab-head"><h2>Video Tracking</h2></div>

<!-- Auto-Queue Threshold Type (matches original exactly) -->
<div class="field">
  <span class="label">Auto-Queue Threshold Type</span>
  <div class="thresh-row">
    <label class="thresh-opt">
      <input type="radio" name="queue-thresh-type" value="time" bind:group={queueThreshType} /> Minutes watched
    </label>
    <label class="thresh-opt">
      <input type="radio" name="queue-thresh-type" value="percent" bind:group={queueThreshType} /> Percentage
    </label>
  </div>
</div>

<!-- Auto-Queue Threshold Value -->
<div class="field">
  <label class="label" for="queue-thresh-min">Auto-Queue Threshold
    <span class="label-val">{queueThreshType === 'percent' ? queueThreshPct + '%' : queueThreshMin + ' min'}</span>
  </label>
  {#if queueThreshType === 'percent'}
    <input type="range" id="queue-thresh-pct-range" class="slider" min="0" max="100" step="1" bind:value={queueThreshPct} aria-label="Queue threshold percentage" />
    <div class="slider-ticks"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
  {:else}
    <div class="thresh-spinner">
      <input type="number" id="queue-thresh-min" class="input" min="1" bind:value={queueThreshMin} />
      <div class="thresh-spin-btns">
        <button type="button" class="thresh-spin-up" tabindex="-1" onclick={() => spinUp(() => queueThreshMin, v => queueThreshMin = v)} aria-label="Increment queue threshold" title="Increment">
          <svg viewBox="0 0 10 6" aria-hidden="true"><polyline points="1,5 5,1 9,5"/></svg>
        </button>
        <button type="button" class="thresh-spin-dn" tabindex="-1" onclick={() => spinDn(() => queueThreshMin, v => queueThreshMin = v)} aria-label="Decrement queue threshold" title="Decrement">
          <svg viewBox="0 0 10 6" aria-hidden="true"><polyline points="1,1 5,5 9,1"/></svg>
        </button>
      </div>
    </div>
    <p class="hint" style="margin-top:7px;margin-bottom:0">Queue video automatically when watched time reaches this threshold.</p>
  {/if}
</div>

<!-- Auto-send toggle -->
<div class="field">
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={autoSend} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Automatically send video based on threshold
  </label>
</div>

<!-- Auto-send threshold config (dimmed if auto-send off) -->
<div id="auto-config" class:dim-block={!autoSend}>
  <div class="field">
    <span class="label">Threshold Type</span>
    <div class="thresh-row">
      <label class="thresh-opt">
        <input type="radio" name="thresh-type" value="time" bind:group={threshType} /> Minutes watched
      </label>
      <label class="thresh-opt">
        <input type="radio" name="thresh-type" value="percent" bind:group={threshType} /> Percentage
      </label>
    </div>
  </div>
  <div class="field">
    <label class="label" for="thresh-min">Threshold Value
      <span class="label-val">{threshType === 'percent' ? threshPct + '%' : threshMin + ' min'}</span>
    </label>
    {#if threshType === 'percent'}
      <input type="range" id="thresh-pct-range" class="slider" min="0" max="100" step="1" bind:value={threshPct} aria-label="Auto send threshold percentage" />
      <div class="slider-ticks"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
    {:else}
      <div class="thresh-spinner">
        <input type="number" id="thresh-min" class="input" min="1" bind:value={threshMin} />
        <div class="thresh-spin-btns">
          <button type="button" class="thresh-spin-up" tabindex="-1" onclick={() => spinUp(() => threshMin, v => threshMin = v)} aria-label="Increment send threshold" title="Increment">
            <svg viewBox="0 0 10 6" aria-hidden="true"><polyline points="1,5 5,1 9,5"/></svg>
          </button>
          <button type="button" class="thresh-spin-dn" tabindex="-1" onclick={() => spinDn(() => threshMin, v => threshMin = v)} aria-label="Decrement send threshold" title="Decrement">
            <svg viewBox="0 0 10 6" aria-hidden="true"><polyline points="1,1 5,5 9,1"/></svg>
          </button>
        </div>
      </div>
      <p class="hint" style="margin-top:7px;margin-bottom:0">Send when accumulated watch time reaches this many minutes.</p>
    {/if}
  </div>
</div>

<!-- UI toggles -->
<div class="field">
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={hideButtons} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Hide Log button on video players
  </label>
</div>
<div class="field" class:dim-block={hideButtons} id="hide-jp-field">
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={hideIfNotJp} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Hide Log button if content is not Japanese
  </label>
</div>
<div class="field" class:dim-block={hideButtons} id="hide-music-field">
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={hideMusic} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Hide Log button on music videos
  </label>
</div>
<div class="field">
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={enablePlaylist} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Show Playlist Logger button on YouTube
  </label>
</div>
<div class="field">
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={playlistHideNonJp} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Hide non-Japanese videos in Playlist Logger by default
  </label>
</div>

<!-- Badge display mode -->
<div class="field" id="show-total-field">
  <label class="label" for="show-total-badge">Badge Display Mode</label>
  <select id="show-total-badge" class="input" bind:value={showTotal}>
    <option value="session">Current Session Only</option>
    <option value="total">Current Session / Total Time</option>
  </select>
</div>

<div style="display:flex; gap:10px;">
  <button class="btn btn-amber" onclick={save}>Save</button>
  <button class="btn btn-ghost" onclick={reset}>Revert to Default</button>
</div>
