<!--
  ── OverlayTab.svelte ────────────────────────────────────────────────────────
  Overlay settings: position, track time, allow/skip site lists.
  Matches the original settings/index.html #tab-overlay section exactly.
-->
<script lang="ts">
  import { configStorage } from "@/lib/storage/config";
  import { BUILT_IN_ALLOW, BUILT_IN_SKIP } from "@/lib/constants";

  interface Props {
    onStatus: (msg: string, err?: boolean) => void;
  }
  let { onStatus }: Props = $props();

  let trackTime = $state(false);
  let overlayPos = $state("top-right");
  let allowListOnly = $state(false);
  let allowSites: string[] = $state([]);
  let skipSites: string[] = $state([]);
  let allowInput = $state("");
  let skipInput = $state("");
  let allowOpen = $state(false);
  let skipOpen = $state(false);

  /* Inline editing states for lists */
  let editingList = $state<"allow" | "skip" | null>(null);
  let editingIndex = $state<number | null>(null);
  let editingValue = $state("");

  export async function load() {
    const cfg = (await configStorage.getValue()) as any;
    trackTime = cfg.trackTime ?? false;
    overlayPos = cfg.overlayPosition ?? "top-right";
    allowListOnly = cfg.allowListOnly ?? false;
    allowSites = cfg.allowSites ?? [...BUILT_IN_ALLOW];
    skipSites = cfg.skipSites ?? [...BUILT_IN_SKIP];
  }

  async function save() {
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({
      ...cfg,
      trackTime,
      allowListOnly,
      overlayPosition: overlayPos,
    });
    onStatus("✓ Overlay Settings Saved");
  }

  async function reset() {
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({
      ...cfg,
      trackTime: true,
      allowListOnly: false,
      overlayPosition: "top-right",
      allowSites: [...BUILT_IN_ALLOW],
      skipSites: [...BUILT_IN_SKIP],
    });
    await load();
    onStatus("✓ Defaults Restored");
  }

  async function addSite(list: "allow" | "skip") {
    const val = (list === "allow" ? allowInput : skipInput)
      .trim()
      .toLowerCase();
    if (!val) return;
    const cfg = (await configStorage.getValue()) as any;
    const key = list === "allow" ? "allowSites" : "skipSites";
    const sites: string[] =
      cfg[key] ?? (list === "allow" ? [...BUILT_IN_ALLOW] : [...BUILT_IN_SKIP]);
    if (!sites.includes(val)) {
      await configStorage.setValue({ ...cfg, [key]: [...sites, val] });
      if (list === "allow") allowInput = "";
      else skipInput = "";
      await load();
      onStatus(`✓ ${list === "allow" ? "Allowed" : "Skipped"} Site Added`);
    }
  }

  async function removeSite(domain: string, list: "allow" | "skip") {
    const cfg = (await configStorage.getValue()) as any;
    const key = list === "allow" ? "allowSites" : "skipSites";
    const sites: string[] =
      cfg[key] ?? (list === "allow" ? [...BUILT_IN_ALLOW] : [...BUILT_IN_SKIP]);
    await configStorage.setValue({
      ...cfg,
      [key]: sites.filter((d) => d !== domain),
    });
    await load();
  }

  /* Inline edit triggers */
  function startEdit(
    list: "allow" | "skip",
    index: number,
    currentValue: string,
  ) {
    editingList = list;
    editingIndex = index;
    editingValue = currentValue;
  }

  async function saveEdit(list: "allow" | "skip", index: number) {
    if (editingList !== list || editingIndex !== index) return;

    const newVal = editingValue.trim().toLowerCase();
    editingList = null;
    editingIndex = null;

    if (!newVal) return;

    const cfg = (await configStorage.getValue()) as any;
    const key = list === "allow" ? "allowSites" : "skipSites";
    const sites: string[] = [
      ...(cfg[key] ??
        (list === "allow" ? [...BUILT_IN_ALLOW] : [...BUILT_IN_SKIP])),
    ];

    const oldVal = sites[index];
    if (oldVal === newVal) return;

    if (!sites.includes(newVal) || sites.indexOf(newVal) === index) {
      sites[index] = newVal;
      await configStorage.setValue({ ...cfg, [key]: sites });
      await load();
      onStatus(`✓ Site updated to ${newVal}`);
    } else {
      onStatus(`⚠ Duplicate site domain ignored`, true);
      await load();
    }
  }

  function handleEditKeyDown(
    e: KeyboardEvent,
    list: "allow" | "skip",
    index: number,
  ) {
    if (e.key === "Enter") {
      saveEdit(list, index);
    } else if (e.key === "Escape") {
      editingList = null;
      editingIndex = null;
    }
  }

  load();
</script>

<div class="tab-head"><h2>Text Overlay</h2></div>
<p class="hint">
  A small draggable timer overlay shown on Japanese pages while you read.
</p>

<div class="field">
  <label class="toggle">
    <input
      type="checkbox"
      id="track-time"
      class="toggle-chk"
      bind:checked={trackTime}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Include active reading time in context-menu logs
  </label>
</div>

<div class="field">
  <span class="label">Default Position</span>
  <div class="pos-grid">
    <label class="pos-opt"
      ><input
        type="radio"
        name="overlay-pos"
        value="top-left"
        bind:group={overlayPos}
      /> Top Left</label
    >
    <label class="pos-opt"
      ><input
        type="radio"
        name="overlay-pos"
        value="top-right"
        bind:group={overlayPos}
      /> Top Right</label
    >
    <label class="pos-opt"
      ><input
        type="radio"
        name="overlay-pos"
        value="bottom-left"
        bind:group={overlayPos}
      /> Bottom Left</label
    >
    <label class="pos-opt"
      ><input
        type="radio"
        name="overlay-pos"
        value="bottom-right"
        bind:group={overlayPos}
      /> Bottom Right</label
    >
    <label class="pos-opt pos-wide"
      ><input
        type="radio"
        name="overlay-pos"
        value="hidden"
        bind:group={overlayPos}
      /> Hidden</label
    >
  </div>
</div>

<div style="display:flex; gap:10px; margin-bottom:36px">
  <button id="save-overlay-btn" class="btn btn-amber" onclick={save}
    >Save</button
  >
</div>

<!-- Sites sub-section -->
<div class="sub-head"><h3>Sites</h3></div>
<p class="hint" style="margin-top:0">
  <strong style="color:var(--text)"
    >It auto-detects japanese characters in a website to force the overlay.</strong
  ><br />
  To control where the overlay appears, click a domain to edit it inline.<br />
  <strong style="color:var(--text)">Note:</strong> Sites in the Allow list force
  the overlay to appear, bypassing auto-detection. Sites on the Skip list, skips
  them even if it detects japanese characters.
</p>

<div class="field">
  <label class="toggle">
    <input
      type="checkbox"
      id="allow-list-only"
      class="toggle-chk"
      bind:checked={allowListOnly}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Only show overlay on Allow sites (disables auto-detection completely)
  </label>
</div>

<!-- Allow list -->
<div class="sites-group">
  <button
    type="button"
    class="sites-toggle-head"
    class:open={allowOpen}
    style="width:100%; border:1px solid var(--bdr); text-align:left; background:var(--surf2);"
    onclick={() => (allowOpen = !allowOpen)}
  >
    <div class="sites-head-left">
      <span class="sites-head-label allow">Allow</span>
      <span class="sites-head-count" id="allow-count">{allowSites.length}</span>
    </div>
    <span class="sites-chevron"
      ><svg viewBox="0 0 12 8"><polyline points="1,1 6,7 11,1" /></svg></span
    >
  </button>
  {#if allowOpen}
    <div class="sites-body open" id="allow-body">
      <div class="site-list" id="allow-list">
        {#each allowSites as site, i}
          <div class="site-item">
            {#if editingList === "allow" && editingIndex === i}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                type="text"
                class="site-item-edit-input"
                bind:value={editingValue}
                onblur={() => saveEdit("allow", i)}
                onkeydown={(e) => handleEditKeyDown(e, "allow", i)}
                style="flex: 1; font-family: var(--font-mono); font-size: 11px; padding: 1px 4px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--color-border); border-radius: 3px; color: var(--color-text); outline: none; margin-right: 8px;"
                autofocus
              />
            {:else}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span
                class="site-item-host"
                onclick={() => startEdit("allow", i, site)}>{site}</span
              >
            {/if}
            <button
              class="site-remove"
              onclick={() => removeSite(site, "allow")}
              aria-label="Remove allowed site"
              title="Remove site"
            >
              <svg viewBox="0 0 10 10"
                ><line x1="2" y1="2" x2="8" y2="8" /><line
                  x1="8"
                  y1="2"
                  x2="2"
                  y2="8"
                /></svg
              >
            </button>
          </div>
        {/each}
      </div>
      <div class="add-site-row">
        <input
          type="text"
          id="allow-input"
          class="input"
          placeholder="e.g. example.jp"
          bind:value={allowInput}
          aria-label="New allowed site domain"
        />
        <button
          id="allow-add"
          class="btn btn-amber btn-sm"
          onclick={() => addSite("allow")}>Add</button
        >
      </div>
    </div>
  {/if}
</div>

<!-- Skip list -->
<div class="sites-group" style="margin-bottom: 0;">
  <button
    type="button"
    class="sites-toggle-head"
    class:open={skipOpen}
    style="width:100%; border:1px solid var(--bdr); text-align:left; background:var(--surf2);"
    onclick={() => (skipOpen = !skipOpen)}
  >
    <div class="sites-head-left">
      <span class="sites-head-label skip">Skip</span>
      <span class="sites-head-count" id="skip-count">{skipSites.length}</span>
    </div>
    <span class="sites-chevron"
      ><svg viewBox="0 0 12 8"><polyline points="1,1 6,7 11,1" /></svg></span
    >
  </button>
  {#if skipOpen}
    <div class="sites-body open" id="skip-body">
      <div class="site-list" id="skip-list">
        {#each skipSites as site, i}
          <div class="site-item">
            {#if editingList === "skip" && editingIndex === i}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                type="text"
                class="site-item-edit-input"
                bind:value={editingValue}
                onblur={() => saveEdit("skip", i)}
                onkeydown={(e) => handleEditKeyDown(e, "skip", i)}
                style="flex: 1; font-family: var(--font-mono); font-size: 11px; padding: 1px 4px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--color-border); border-radius: 3px; color: var(--color-text); outline: none; margin-right: 8px;"
                autofocus
              />
            {:else}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span
                class="site-item-host"
                onclick={() => startEdit("skip", i, site)}>{site}</span
              >
            {/if}
            <button
              class="site-remove"
              onclick={() => removeSite(site, "skip")}
              aria-label="Remove skipped site"
              title="Remove site"
            >
              <svg viewBox="0 0 10 10"
                ><line x1="2" y1="2" x2="8" y2="8" /><line
                  x1="8"
                  y1="2"
                  x2="2"
                  y2="8"
                /></svg
              >
            </button>
          </div>
        {/each}
      </div>
      <div class="add-site-row">
        <input
          type="text"
          id="skip-input"
          class="input"
          placeholder="e.g. example.com"
          bind:value={skipInput}
          aria-label="New skipped site domain"
        />
        <button
          id="skip-add"
          class="btn btn-amber btn-sm"
          onclick={() => addSite("skip")}>Add</button
        >
      </div>
    </div>
  {/if}
</div>

<!-- Appended Reset Button at the bottom -->
<div style="display:flex; gap:10px; margin-top:36px;">
  <button id="reset-overlay-btn" class="btn btn-ghost" onclick={reset}
    >Revert to Default</button
  >
</div>
