<!-- PlaylistModal.svelte -->
<script lang="ts">
  /**
   * ── Playlist Modal ──────────────────────────────────────────────────────────
   * Declarative list view displaying current tracks of a playlist for bulk logging.
   */

  import { DYNAMIC_LOGO_SVG } from "@/lib/ui/themes";

  let { videos, hideNonJp = $bindable(true), onCancel, onSubmit } = $props();

  // Moves type declaration onto the variable to resolve angle bracket parser warnings
  let selectedIndices: Record<number, boolean> = $state({});
  let showOnlyJapanese = $state(hideNonJp);
  let allSelected = $state(false);
  let showConfirmation = $state(false);
  let isSubmitting = $state(false);

  // Computed visible items
  let visibleVideos = $derived(
    videos.map((v: any, index: number) => ({ ...v, originalIndex: index }))
          .filter((v: any) => !showOnlyJapanese || v.isJp)
  );

  let checkedVideos = $derived(
    videos.filter((v: any, index: number) => selectedIndices[index])
  );

  function toggleSelectAll() {
    allSelected = !allSelected;
    visibleVideos.forEach((v: any) => {
      selectedIndices[v.originalIndex] = allSelected;
    });
  }

  // Toggle filter on display
  function toggleJpFilter() {
    showOnlyJapanese = !showOnlyJapanese;
    hideNonJp = showOnlyJapanese;
  }

  function handleRowChecked(index: number, checked: boolean) {
    selectedIndices[index] = checked;
    allSelected = visibleVideos.length > 0 && visibleVideos.every((v: any) => selectedIndices[v.originalIndex]);
  }

  function triggerSubmit() {
    if (checkedVideos.length === 0) return;
    showConfirmation = true;
  }

  // Go back from confirmation
  function cancelSubmit() {
    showConfirmation = false;
  }

  async function handleConfirmSubmit() {
    isSubmitting = true;
    await onSubmit(checkedVideos);
    isSubmitting = false;
  }
</script>

<div class="nt-modal">
  {#if !showConfirmation}
    <div class="nt-modal-header" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
      <div style="display:flex; gap:12px; align-items:center;">
        <div class="nt-logo-sq" style="border:none; display:flex; align-items:center; justify-content:center;">
          {@html DYNAMIC_LOGO_SVG}
        </div>
        <div class="nt-title-area">
          <span class="nt-brand-name">Log Playlist Videos</span>
        </div>
      </div>
      <div id="pl-top-actions" style="display:flex; gap:10px;">
        <button id="pl-toggle-jp" onclick={toggleJpFilter} style="background:none; border:none; color:var(--color-text-muted); font-size:10px; cursor:pointer; font-weight:bold; font-family:inherit;">
          {showOnlyJapanese ? 'Show Non-JP' : 'Hide Non-JP'}
        </button>
        <button id="pl-toggle-all" onclick={toggleSelectAll} style="background:none; border:none; color:var(--color-accent); font-size:10px; cursor:pointer; font-weight:bold; font-family:inherit;">
          {allSelected ? 'Unselect All' : 'Select All'}
        </button>
      </div>
    </div>

    <div id="nt-playlist-modal-list" style="max-height:300px; overflow-y:auto; overflow-x:hidden; margin-bottom:8px; display:flex; flex-direction:column; gap:4px; flex-shrink:1;">
      {#each visibleVideos as v (v.originalIndex)}
        <label class="pl-vid-row" style="display:flex; gap:4px; align-items:center; font-size:11px; cursor:pointer; padding:3px 0; width:100%; box-sizing:border-box;">
          <input
            type="checkbox"
            class="nt-pl-chk pl-vid-chk"
            checked={!!selectedIndices[v.originalIndex]}
            onchange={(e) => handleRowChecked(v.originalIndex, (e.currentTarget as HTMLInputElement).checked)}
            style="margin: 0 !important; padding: 0 !important; box-sizing: border-box; width: 16px !important; height: 16px !important; flex-shrink: 0; align-self: center;"
          />
          <span style="font-family:ui-monospace,SFMono-Regular,monospace; color:#8A8A9A; width:14px; text-align:right; flex-shrink:0; font-size:10px; margin-right:2px;">{v.originalIndex + 1}.</span>
          <div class="pl-scroll-title" style="flex:1; overflow-x:auto; white-space:nowrap; padding: 2px 0; font-size:11px; scrollbar-width:none; -ms-overflow-style:none;">
            {v.title}
          </div>
          <span style="color:var(--color-accent); font-family:ui-monospace,SFMono-Regular,monospace; flex-shrink:0; text-align:right; font-weight:bold; font-size:10px; min-width:32px;">{v.time} min</span>
        </label>
      {/each}
    </div>

    <div class="nt-modal-footer" id="pl-footer-main" style="margin-top: 4px;">
      <button id="pl-cancel" class="nt-btn-ghost" onclick={onCancel}>Cancel</button>
      <button id="pl-submit" class="nt-btn-amber" onclick={triggerSubmit} disabled={checkedVideos.length === 0}>Log Selected</button>
    </div>
  {:else}
    <div id="nt-playlist-confirm-layer" style="display:flex; flex-direction:column; align-items:center; gap:12px; margin-bottom:8px; padding:10px 0; text-align:center; flex-shrink:0;">
      <div style="font-size:14px; color:var(--color-text); font-weight:bold;">Confirm Logging</div>
      <div style="font-size:12px; color:var(--color-text-muted);">
        Are you sure you want to log <span id="pl-confirm-count" style="color:var(--color-accent); font-weight:bold;">{checkedVideos.length}</span> videos directly?
      </div>
    </div>

    <div class="nt-modal-footer" id="pl-footer-confirm" style="display:flex; margin-top: 4px; gap:12px;">
      <button id="pl-confirm-no" class="nt-btn-ghost" onclick={cancelSubmit} disabled={isSubmitting}>Go Back</button>
      <button id="pl-confirm-yes" class="nt-btn-amber" onclick={handleConfirmSubmit} disabled={isSubmitting}>
        {isSubmitting ? 'Logging...' : 'Yes, Log Them'}
      </button>
    </div>
  {/if}
</div>
