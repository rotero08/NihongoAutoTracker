<!-- VideoEditModal.svelte -->
<script lang="ts">
  /**
   * ── Video Edit Modal ────────────────────────────────────────────────────────
   * Renders the modal to configure manual video logging details.
   */

  import { localTodayISODate, dateInputToISO } from "@/lib/utils/time";
  import { DYNAMIC_LOGO_SVG } from "@/lib/ui/themes";

  // Reactive svelte 5 properties
  let { data, onConfirm, onClose } = $props();

  let videoTitle = $state("");
  let totalMinutes = $state(1);
  let todayDate = $state(localTodayISODate());
  let clearSessions = $state(false);
  let isLogging = $state(false);

  // Sync prop initial values cleanly inside an effect closure to eliminate compiler warnings
  $effect(() => {
    videoTitle = data.videoTitle;
    totalMinutes = Math.max(1, Math.round(data.videoDurationSecs / 60));
  });

  function spinUp() {
    totalMinutes += 1;
  }

  function spinDown() {
    totalMinutes = Math.max(1, totalMinutes - 1);
  }

  async function handleSubmit() {
    isLogging = true;
    const dateIso = todayDate ? dateInputToISO(todayDate) : new Date().toISOString();
    await onConfirm({
      title: data.channelName,
      desc: videoTitle,
      time: totalMinutes,
      date: dateIso,
      clearSessions
    });
    onClose(true);
  }
</script>

<div class="nt-modal">
  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
    <div class="nt-modal-header" style="display:flex; align-items:center; gap:12px;">
      <div class="nt-logo-sq" style="border:none; display:flex; align-items:center; justify-content:center; width:32px; height:32px;">
        {@html DYNAMIC_LOGO_SVG}
      </div>
      <div class="nt-title-area" style="display:flex; flex-direction:column; gap:4px;">
        <span class="nt-brand-name" style="font-weight:bold; font-size:13px; letter-spacing:.5px;">NihongoAutoTracker</span>
        <span class="nt-badge">MANUAL LOG</span>
      </div>
    </div>
  </div>

  <div style="display:flex; justify-content:flex-start; gap:10px; font-size:10px; font-weight:bold; margin-bottom:16px;">
    <span style="color:var(--color-text-muted);">DISPLAY:</span>
    <button class="nt-link-btn" class:active={!data.showTotal} onclick={() => data.onToggleShowTotal(false)}>Session Only</button>
    <span style="color:var(--color-border-hover);">|</span>
    <button class="nt-link-btn" class:active={data.showTotal} onclick={() => data.onToggleShowTotal(true)}>Session / Total</button>
  </div>

  <div class="nt-form-group">
    <div style="display:flex; justify-content:space-between; align-items:flex-end;">
      <label for="nt-desc-input">VIDEO TITLE</label>
      <span style="font-size:9px; color:#8A8A9A; max-width:140px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title={data.channelName}>
        {data.channelName}
      </span>
    </div>
    <input type="text" id="nt-desc-input" bind:value={videoTitle} />
  </div>

  <div class="nt-form-row">
    <div class="nt-form-group">
      <label for="nt-time-input">MINUTES</label>
      <div class="nt-number-wrapper">
        <input type="number" id="nt-time-input" bind:value={totalMinutes} min="1" />
        <div class="nt-spin-btns">
          <button type="button" id="nt-spin-up" onclick={spinUp} aria-label="Increment minutes">
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 5L5 1L9 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button type="button" id="nt-spin-down" onclick={spinDown} aria-label="Decrement minutes">
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    </div>
    <div class="nt-form-group">
      <label for="nt-date-input">DATE</label>
      <input type="date" id="nt-date-input" bind:value={todayDate} />
    </div>
  </div>

  <div class="nt-modal-opt">
    <input type="checkbox" id="nt-clear-sessions" class="nt-pl-chk" bind:checked={clearSessions} />
    <label for="nt-clear-sessions">Clear sessions with this log</label>
  </div>

  <div class="nt-modal-footer">
    <button id="nt-modal-cancel" onclick={() => onClose(false)} disabled={isLogging}>Cancel</button>
    <button id="nt-modal-submit" class="nt-btn-amber" onclick={handleSubmit} disabled={isLogging}>
      {isLogging ? 'Logging...' : 'Log Video'}
    </button>
  </div>
</div>
