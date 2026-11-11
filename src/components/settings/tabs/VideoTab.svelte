<!-- VideoTab.svelte -->
<script lang="ts">
  /**
   * ── Video Tab Settings ──────────────────────────────────────────────────────
   * Configures automatic logging thresholds and display rules on video hosts.
   */

  import { configStorage } from "@/lib/storage/config";
  import CustomSelect from "@/components/common/CustomSelect.svelte";
  import { stepValue } from "@/lib/utils/math";
  import {
    clampThresholdValue,
    getAutoSendThreshold,
    getQueueThreshold,
    isAutoSendEnabled,
    QUEUE_THRESHOLD_DEFAULTS,
    SEND_THRESHOLD_DEFAULTS,
    THRESHOLD_LIMITS,
  } from "@/lib/utils/video-thresholds";

  interface Props {
    onStatus: (msg: string, err?: boolean) => void;
  }
  let { onStatus }: Props = $props();

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
  let logMusicVideos = $state(false);
  let logSubtitledVideos = $state(false);
  let enablePlaylist = $state(true);
  let playlistHideNonJp = $state(true);
  let hidePlaylistBadgeIcon = $state(false);
  let showTotal = $state("total");

  const badgeDisplayOptions = [
    { value: "session", label: "This session only" },
    { value: "total", label: "This session / total queued for the video" },
  ];

  export async function load() {
    const cfg = (await configStorage.getValue()) as any;
    // Resolved by the same helpers the tracker enforces, so this tab can never
    // show a threshold other than the one in effect.
    const send = getAutoSendThreshold(cfg);
    const queue = getQueueThreshold(cfg);
    autoSend = isAutoSendEnabled(cfg);
    threshType = send.type;
    threshPct = send.type === "percent" ? send.value : SEND_THRESHOLD_DEFAULTS.percent;
    threshMin = send.type === "time" ? send.value : SEND_THRESHOLD_DEFAULTS.time;
    queueThreshType = queue.type;
    queueThreshPct = queue.type === "percent" ? queue.value : QUEUE_THRESHOLD_DEFAULTS.percent;
    queueThreshMin = queue.type === "time" ? queue.value : QUEUE_THRESHOLD_DEFAULTS.time;
    hideButtons = cfg.hideButtons ?? false;
    hideIfNotJp = cfg.hideIfNotJapanese ?? false;
    hideMusic = cfg.hideMusic ?? false;
    logMusicVideos = cfg.logMusicVideos ?? false;
    logSubtitledVideos = cfg.logSubtitledVideos ?? false;
    enablePlaylist = cfg.enablePlaylistLogger ?? true;
    playlistHideNonJp = cfg.playlistHideNonJapanese ?? true;
    hidePlaylistBadgeIcon = cfg.hidePlaylistBadgeIcon ?? false;
    showTotal = (cfg.showTotalInBadge ?? true) ? "total" : "session";
  }

  async function persist() {
    const cfg = (await configStorage.getValue()) as any;
    // Bring typed values back into range (a cleared field or a 0 would otherwise
    // be stored as "queue everything immediately").
    threshPct = clampThresholdValue("percent", threshPct, SEND_THRESHOLD_DEFAULTS.percent);
    threshMin = clampThresholdValue("time", threshMin, SEND_THRESHOLD_DEFAULTS.time);
    queueThreshPct = clampThresholdValue("percent", queueThreshPct, QUEUE_THRESHOLD_DEFAULTS.percent);
    queueThreshMin = clampThresholdValue("time", queueThreshMin, QUEUE_THRESHOLD_DEFAULTS.time);
    const tVal = threshType === "percent" ? threshPct : threshMin;
    const qtVal = queueThreshType === "percent" ? queueThreshPct : queueThreshMin;
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
      logSubtitledVideos,
      enablePlaylistLogger: enablePlaylist,
      playlistHideNonJapanese: playlistHideNonJp,
      hidePlaylistBadgeIcon,
      showTotalInBadge: showTotal === "total",
    });
    onStatus("✓ Saved");
  }

  async function reset() {
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({
      ...cfg,
      autoSend: false,
      logMode: "manual",
      thresholdType: "time",
      thresholdValue: SEND_THRESHOLD_DEFAULTS.time,
      queueThresholdType: "time",
      queueThresholdValue: QUEUE_THRESHOLD_DEFAULTS.time,
      hideButtons: false,
      hideIfNotJapanese: false,
      hideMusic: false,
      logMusicVideos: false,
      logSubtitledVideos: false,
      enablePlaylistLogger: true,
      playlistHideNonJapanese: true,
      hidePlaylistBadgeIcon: false,
      showTotalInBadge: true,
    });
    await load();
    onStatus("✓ Video settings reset");
  }

  load();
</script>

<div class="tab-head"><h2>Video</h2></div>
<p class="hint">How YouTube videos are tracked. Changes are saved as you make them.</p>

<div class="field">
  <span class="label">Add a video to the queue after
    <span class="label-val">{queueThreshType === "percent" ? queueThreshPct + "%" : queueThreshMin + " min"}</span>
  </span>
  <div class="thresh-row">
    <label class="thresh-opt">
      <input type="radio" name="queue-thresh-type" value="time" bind:group={queueThreshType} onchange={persist} /> Minutes watched
    </label>
    <label class="thresh-opt">
      <input type="radio" name="queue-thresh-type" value="percent" bind:group={queueThreshType} onchange={persist} /> Percentage watched
    </label>
  </div>
  <div class="thresh-value">
  {#if queueThreshType === "percent"}
    <input type="range" id="queue-thresh-pct-range" class="slider" min={THRESHOLD_LIMITS.percent.min} max={THRESHOLD_LIMITS.percent.max} step="1" bind:value={queueThreshPct} onchange={persist} aria-label="Queue threshold percentage" />
    <div class="slider-ticks"><span>{THRESHOLD_LIMITS.percent.min}%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
  {:else}
    <div class="thresh-spinner">
      <input type="number" id="queue-thresh-min" class="input" min={THRESHOLD_LIMITS.time.min} bind:value={queueThreshMin} onchange={persist} />
      <div class="thresh-spin-btns">
        <button type="button" class="thresh-spin-up" onclick={() => { queueThreshMin = stepValue(queueThreshMin, 'up'); persist(); }} aria-label="Increase queue threshold" title="Increase">
          <svg viewBox="0 0 10 6" aria-hidden="true"><polyline points="1,5 5,1 9,5" /></svg>
        </button>
        <button type="button" class="thresh-spin-dn" onclick={() => { queueThreshMin = stepValue(queueThreshMin, 'down'); persist(); }} aria-label="Decrease queue threshold" title="Decrease">
          <svg viewBox="0 0 10 6" aria-hidden="true"><polyline points="1,1 5,5 9,1" /></svg>
        </button>
      </div>
    </div>
  {/if}
  </div>
</div>

<div class="field">
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={autoSend} onchange={persist} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-text">Send straight to NihongoTracker, skipping the queue
      <span class="toggle-desc">You lose the chance to review or edit a log before it is sent.</span>
    </span>
  </label>
</div>

<div id="auto-config" class:dim-block={!autoSend}>
  <div class="field">
    <span class="label">Send the log after
      <span class="label-val">{threshType === "percent" ? threshPct + "%" : threshMin + " min"}</span>
    </span>
    <div class="thresh-row">
      <label class="thresh-opt">
        <input type="radio" name="thresh-type" value="time" bind:group={threshType} onchange={persist} /> Minutes watched
      </label>
      <label class="thresh-opt">
        <input type="radio" name="thresh-type" value="percent" bind:group={threshType} onchange={persist} /> Percentage watched
      </label>
    </div>
    <div class="thresh-value">
    {#if threshType === "percent"}
      <input type="range" id="thresh-pct-range" class="slider" min={THRESHOLD_LIMITS.percent.min} max={THRESHOLD_LIMITS.percent.max} step="1" bind:value={threshPct} onchange={persist} aria-label="Send threshold percentage" />
    <div class="slider-ticks"><span>{THRESHOLD_LIMITS.percent.min}%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
    {:else}
      <div class="thresh-spinner">
      <input type="number" id="thresh-min" class="input" min={THRESHOLD_LIMITS.time.min} bind:value={threshMin} onchange={persist} />
      <div class="thresh-spin-btns">
        <button type="button" class="thresh-spin-up" onclick={() => { threshMin = stepValue(threshMin, 'up'); persist(); }} aria-label="Increase send threshold" title="Increase">
          <svg viewBox="0 0 10 6" aria-hidden="true"><polyline points="1,5 5,1 9,5" /></svg>
        </button>
        <button type="button" class="thresh-spin-dn" onclick={() => { threshMin = stepValue(threshMin, 'down'); persist(); }} aria-label="Decrease send threshold" title="Decrease">
          <svg viewBox="0 0 10 6" aria-hidden="true"><polyline points="1,1 5,5 9,1" /></svg>
        </button>
      </div>
    </div>
    {/if}
    </div>
  </div>
</div>

<div class="sub-head"><h3>What gets logged</h3></div>
<p class="hint">Only videos with Japanese audio are tracked. Detection is best-effort: when a video cannot be told apart, it is logged rather than dropped.</p>

<div class="field">
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={logMusicVideos} onchange={persist} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-text">Log music videos
      <span class="toggle-desc">Off by default. Includes lyric videos, covers and karaoke tracks.</span>
    </span>
  </label>
</div>
<div class="field">
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={logSubtitledVideos} onchange={persist} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-text">Log videos subtitled in another language
      <span class="toggle-desc">Off by default. Covers translated clips and uploads marked as subbed (EN Sub, Sub Español…), since reading along is not listening practice.</span>
    </span>
  </label>
</div>

<div class="sub-head"><h3>Player badge</h3></div>

<div class="field">
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={hideButtons} onchange={persist} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-text">Hide the badge on the player
      <span class="toggle-desc">Tracking continues; only manual logging from the player is unavailable.</span>
    </span>
  </label>
</div>
<div class="field" class:dim-block={hideButtons} id="hide-jp-field">
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={hideIfNotJp} onchange={persist} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-text">Only show the badge on Japanese videos
    </span>
  </label>
</div>
<div class="field" class:dim-block={hideButtons} id="hide-music-field">
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={hideMusic} onchange={persist} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-text">Hide the badge on music videos
    </span>
  </label>
</div>
<div class="field" class:dim-block={hideButtons} id="show-total-field">
  <CustomSelect
    label="Time shown on the badge"
    options={badgeDisplayOptions}
    value={showTotal}
    onChange={(val: string) => {
      showTotal = val;
      persist();
    }}
  />
</div>

<div class="sub-head"><h3>Playlists</h3></div>

<div class="field">
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={enablePlaylist} onchange={persist} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-text">Enable the playlist logger
      <span class="toggle-desc">Log several videos of a YouTube playlist at once.</span>
    </span>
  </label>
</div>
<div class="field" class:dim-block={!enablePlaylist}>
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={hidePlaylistBadgeIcon} onchange={persist} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-text">Hide its button on playlist pages
    </span>
  </label>
</div>
<div class="field" class:dim-block={!enablePlaylist}>
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={playlistHideNonJp} onchange={persist} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-text">Leave non-Japanese videos out of the list
    </span>
  </label>
</div>

<div class="settings-footer">
  <button class="btn btn-ghost" onclick={reset}>Reset video settings</button>
</div>
