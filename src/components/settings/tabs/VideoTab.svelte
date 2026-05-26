<!--
  ── VideoTab.svelte ──────────────────────────────────────────────────────────
  Video tracking settings: thresholds, auto-send, badge displays, and toggles.
  Saves all settings automatically on any change.
-->
<script lang="ts">
  import { configStorage } from "@/lib/storage/config";

  interface Props {
    onStatus: (msg: string, err?: boolean) => void;
  }
  let { onStatus }: Props = $props();

  /* ── State ── */
  let autoSend = $state(false);
  let threshType = $state("time");
  let threshPct = $state(95);
  let threshMin = $state(30);
  let queueThreshType = $state("time");
  let queueThreshPct = $state(5);
  let queueThreshMin = $state(1);
  let hideButtons = $state(false);
  let hideIfNotJp = $state(false);
  let hideMusic = $state(false);
  let logMusicVideos = $state(false); // Music logging toggle state
  let enablePlaylist = $state(true);
  let playlistHideNonJp = $state(true);
  let showTotal = $state("total");

  export async function load() {
    const cfg = (await configStorage.getValue()) as any;
    autoSend = cfg.autoSend ?? cfg.logMode === "auto";
    threshType = cfg.thresholdType ?? "time";
    threshPct =
      cfg.thresholdType === "percent"
        ? (cfg.thresholdValue ?? cfg.threshold ?? 95)
        : 95;
    threshMin =
      cfg.thresholdType === "time"
        ? (cfg.thresholdValue ?? cfg.threshold ?? 30)
        : 30;
    queueThreshType = cfg.queueThresholdType ?? "time";
    queueThreshPct =
      cfg.queueThresholdType === "percent" ? (cfg.queueThresholdValue ?? 5) : 5;
    queueThreshMin =
      cfg.queueThresholdType === "time" ? (cfg.queueThresholdValue ?? 1) : 1;
    hideButtons = cfg.hideButtons ?? false;
    hideIfNotJp = cfg.hideIfNotJapanese ?? false;
    hideMusic = cfg.hideMusic ?? false;
    logMusicVideos = cfg.logMusicVideos ?? false;
    enablePlaylist = cfg.enablePlaylistLogger ?? true;
    playlistHideNonJp = cfg.playlistHideNonJapanese ?? true;
    showTotal = (cfg.showTotalInBadge ?? true) ? "total" : "session";
  }

  /* ── Auto-Saving Logic ── */
  async function persist() {
    const cfg = (await configStorage.getValue()) as any;
    const tVal = threshType === "percent" ? threshPct : threshMin;
    const qtVal =
      queueThreshType === "percent" ? queueThreshPct : queueThreshMin;
    await configStorage.setValue({
      ...cfg,
      autoSend,
      logMode: autoSend ? "auto" : "manual",
      thresholdType: threshType,
      thresholdValue: tVal,
      queueThresholdType: queueThreshType,
      queueThresholdValue: qtVal,
      hideButtons,
      hideIfNotJapanese: hideIfNotJp,
      hideMusic,
      logMusicVideos,
      enablePlaylistLogger: enablePlaylist,
      playlistHideNonJapanese: playlistHideNonJp,
      showTotalInBadge: showTotal === "total",
    });
    onStatus("✓ Settings Auto-Saved");
  }

  async function reset() {
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({
      ...cfg,
      autoSend: false,
      logMode: "manual",
      thresholdType: "time",
      thresholdValue: 30,
      queueThresholdType: "time",
      queueThresholdValue: 1,
      hideButtons: false,
      hideIfNotJapanese: false,
      hideMusic: false,
      logMusicVideos: false,
      enablePlaylistLogger: true,
      playlistHideNonJapanese: true,
      showTotalInBadge: true,
    });
    await load();
    onStatus("✓ Video Defaults Restored");
  }

  /* ── Spinner helpers ── */
  function spinUp(getter: () => number, setter: (v: number) => void) {
    setter(getter() + 1);
    persist();
  }
  function spinDn(getter: () => number, setter: (v: number) => void) {
    setter(Math.max(1, getter() - 1));
    persist();
  }

  load();
</script>

<div class="tab-head"><h2>Video Tracking Configuration</h2></div>
<p class="hint">
  Customise watch thresholds and automated logging options for video players.
  All changes are saved automatically.
</p>

<!-- Auto-Queue Threshold Type -->
<div class="field">
  <span class="label">Auto-Queue Criteria</span>
  <div class="thresh-row">
    <label class="thresh-opt">
      <input
        type="radio"
        name="queue-thresh-type"
        value="time"
        bind:group={queueThreshType}
        onchange={persist}
      /> Minutes watched
    </label>
    <label class="thresh-opt">
      <input
        type="radio"
        name="queue-thresh-type"
        value="percent"
        bind:group={queueThreshType}
        onchange={persist}
      /> Percentage watched
    </label>
  </div>
</div>

<!-- Auto-Queue Threshold Value -->
<div class="field">
  <label class="label" for="queue-thresh-min"
    >Auto-Queue Limit
    <span class="label-val"
      >{queueThreshType === "percent"
        ? queueThreshPct + "%"
        : queueThreshMin + " min"}</span
    >
  </label>
  {#if queueThreshType === "percent"}
    <input
      type="range"
      id="queue-thresh-pct-range"
      class="slider"
      min="0"
      max="100"
      step="1"
      bind:value={queueThreshPct}
      onchange={persist}
      aria-label="Queue threshold percentage"
    />
    <div class="slider-ticks">
      <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span
        >100%</span
      >
    </div>
  {:else}
    <div class="thresh-spinner">
      <input
        type="number"
        id="queue-thresh-min"
        class="input"
        min="1"
        bind:value={queueThreshMin}
        onchange={persist}
      />
      <div class="thresh-spin-btns">
        <button
          type="button"
          class="thresh-spin-up"
          tabindex="-1"
          onclick={() =>
            spinUp(
              () => queueThreshMin,
              (v) => (queueThreshMin = v),
            )}
          aria-label="Increment queue threshold"
          title="Increment"
        >
          <svg viewBox="0 0 10 6" aria-hidden="true"
            ><polyline points="1,5 5,1 9,5" /></svg
          >
        </button>
        <button
          type="button"
          class="thresh-spin-dn"
          tabindex="-1"
          onclick={() =>
            spinDn(
              () => queueThreshMin,
              (v) => (queueThreshMin = v),
            )}
          aria-label="Decrement queue threshold"
          title="Decrement"
        >
          <svg viewBox="0 0 10 6" aria-hidden="true"
            ><polyline points="1,1 5,5 9,1" /></svg
          >
        </button>
      </div>
    </div>
    <p class="hint" style="margin-top:7px;margin-bottom:0">
      Automatically place the video in your pending queue once this watch
      threshold has been met.
    </p>
  {/if}
</div>

<!-- Auto-send toggle -->
<div class="field">
  <label class="toggle">
    <input
      type="checkbox"
      class="toggle-chk"
      bind:checked={autoSend}
      onchange={persist}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Directly submit logs to NihongoTracker (Bypasses local pending queue)
  </label>
</div>

<!-- Auto-send threshold config (dimmed if auto-send off) -->
<div id="auto-config" class:dim-block={!autoSend}>
  <div class="field">
    <span class="label">Instant Submission Criteria</span>
    <div class="thresh-row">
      <label class="thresh-opt">
        <input
          type="radio"
          name="thresh-type"
          value="time"
          bind:group={threshType}
          onchange={persist}
        /> Minutes watched
      </label>
      <label class="thresh-opt">
        <input
          type="radio"
          name="thresh-type"
          value="percent"
          bind:group={threshType}
          onchange={persist}
        /> Percentage watched
      </label>
    </div>
  </div>
  <div class="field">
    <label class="label" for="thresh-min"
      >Instant Submission Threshold
      <span class="label-val"
        >{threshType === "percent" ? threshPct + "%" : threshMin + " min"}</span
      >
    </label>
    {#if threshType === "percent"}
      <input
        type="range"
        id="thresh-pct-range"
        class="slider"
        min="0"
        max="100"
        step="1"
        bind:value={threshPct}
        onchange={persist}
        aria-label="Auto send threshold percentage"
      />
      <div class="slider-ticks">
        <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span
          >100%</span
        >
      </div>
    {:else}
      <div class="thresh-spinner">
        <input
          type="number"
          id="thresh-min"
          class="input"
          min="1"
          bind:value={threshMin}
          onchange={persist}
        />
        <div class="thresh-spin-btns">
          <button
            type="button"
            class="thresh-spin-up"
            tabindex="-1"
            onclick={() =>
              spinUp(
                () => threshMin,
                (v) => (threshMin = v),
              )}
            aria-label="Increment send threshold"
            title="Increment"
          >
            <svg viewBox="0 0 10 6" aria-hidden="true"
              ><polyline points="1,5 5,1 9,5" /></svg
            >
          </button>
          <button
            type="button"
            class="thresh-spin-dn"
            tabindex="-1"
            onclick={() =>
              spinDn(
                () => threshMin,
                (v) => (threshMin = v),
              )}
            aria-label="Decrement send threshold"
            title="Decrement"
          >
            <svg viewBox="0 0 10 6" aria-hidden="true"
              ><polyline points="1,1 5,5 9,1" /></svg
            >
          </button>
        </div>
      </div>
      <p class="hint" style="margin-top:7px;margin-bottom:0">
        Directly send the immersion log to NihongoTracker once this accumulated
        watch time is reached.
      </p>
    {/if}
  </div>
</div>

<!-- Player Options & Filters -->
<div class="sub-head"><h3>Interface Settings & Content Filters</h3></div>

<div class="field">
  <label class="toggle">
    <input
      type="checkbox"
      class="toggle-chk"
      bind:checked={hideButtons}
      onchange={persist}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Completely hide tracker status badges and buttons on players
  </label>
</div>
<div class="field" class:dim-block={hideButtons} id="hide-jp-field">
  <label class="toggle">
    <input
      type="checkbox"
      class="toggle-chk"
      bind:checked={hideIfNotJp}
      onchange={persist}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Only show tracker status badge if the video contains Japanese characters or captions
  </label>
</div>
<div class="field" class:dim-block={hideButtons} id="hide-music-field">
  <label class="toggle">
    <input
      type="checkbox"
      class="toggle-chk"
      bind:checked={hideMusic}
      onchange={persist}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Do not display tracker status badge on music videos
  </label>
</div>

<!-- Enhanced Music Video Immersion Toggle and Tooltip -->
<div
  class="field"
  class:dim-block={hideButtons}
  style="display: flex; align-items: center; justify-content: space-between;"
>
  <label class="toggle" style="flex: 1;">
    <input
      type="checkbox"
      class="toggle-chk"
      bind:checked={logMusicVideos}
      onchange={persist}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Allow queueing and logging of Japanese music videos
  </label>
  <div class="tooltip-wrap" style="cursor: help; margin-left: 8px;">
    <span
      style="display: inline-flex; align-items: center; justify-content: center; background: var(--color-border); color: var(--color-accent); border-radius: 50%; width: 18px; height: 18px; font-size: 11px; font-weight: bold; font-family: var(--font-mono);"
      >i</span
    >
    <span
      class="tooltip"
      style="width: 250px; white-space: normal; line-height: 1.4;"
    >
      Not recommended. Music videos generally contain highly repetitive lyrics,
      artistic styling, and low density text, which are not considered
      high-quality active immersion material.
    </span>
  </div>
</div>

<div class="field" style="margin-top: 24px;">
  <label class="toggle">
    <input
      type="checkbox"
      class="toggle-chk"
      bind:checked={enablePlaylist}
      onchange={persist}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Show Bulk Playlist Logger button on YouTube playlist headers
  </label>
</div>
<div class="field">
  <label class="toggle">
    <input
      type="checkbox"
      class="toggle-chk"
      bind:checked={playlistHideNonJp}
      onchange={persist}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Automatically filter out non-Japanese videos in Playlist Logger
  </label>
</div>

<!-- Badge display mode -->
<div class="field" id="show-total-field" style="margin-top: 24px;">
  <label class="label" for="show-total-badge"
    >Player Status Badge Display Mode</label
  >
  <select
    id="show-total-badge"
    class="input"
    bind:value={showTotal}
    onchange={persist}
  >
    <option value="session">Show Active Session Time Only</option>
    <option value="total">Show Active Session / Local Queued Time</option>
  </select>
</div>

<div style="display:flex; gap:10px; margin-top: 28px;">
  <button class="btn btn-ghost" onclick={reset}>Revert to Default</button>
</div>
