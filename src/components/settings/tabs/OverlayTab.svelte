<!--
  ── OverlayTab.svelte ────────────────────────────────────────────────────────
  Overlay settings: position, track time, whitelist/blacklist sites.
  Saves all settings automatically on any change.
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

  /* ── Auto-Saving Logic ── */
  async function persist() {
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({
      ...cfg,
      trackTime,
      allowListOnly,
      overlayPosition: overlayPos,
    });
    onStatus("✓ Settings Auto-Saved");
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
    onStatus("✓ Overlay Defaults Restored");
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
      onStatus(`✓ Added to ${list === "allow" ? "Whitelist" : "Blacklist"}`);
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
    onStatus(`✓ Removed from ${list === "allow" ? "Whitelist" : "Blacklist"}`);
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
      onStatus(`✓ Updated domain to ${newVal}`);
    } else {
      onStatus(`⚠ Duplicate domain ignored`, true);
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

<div class="tab-head"><h2>Active Text Overlay</h2></div>
<p class="hint">
  Configure the behavior, positioning, and target websites for the floating,
  draggable reading timer.
</p>

<div class="field">
  <label class="toggle">
    <input
      type="checkbox"
      id="track-time"
      class="toggle-chk"
      bind:checked={trackTime}
      onchange={persist}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Track and attach active reading time on manual context-menu logs
  </label>
</div>

<div class="field">
  <span class="label">Default Screen Position</span>
  <div class="pos-grid">
    <label class="pos-opt"
      ><input
        type="radio"
        name="overlay-pos"
        value="top-left"
        bind:group={overlayPos}
        onchange={persist}
      /> Top Left</label
    >
    <label class="pos-opt"
      ><input
        type="radio"
        name="overlay-pos"
        value="top-right"
        bind:group={overlayPos}
        onchange={persist}
      /> Top Right</label
    >
    <label class="pos-opt"
      ><input
        type="radio"
        name="overlay-pos"
        value="bottom-left"
        bind:group={overlayPos}
        onchange={persist}
      /> Bottom Left</label
    >
    <label class="pos-opt"
      ><input
        type="radio"
        name="overlay-pos"
        value="bottom-right"
        bind:group={overlayPos}
        onchange={persist}
      /> Bottom Right</label
    >
    <label class="pos-opt pos-wide"
      ><input
        type="radio"
        name="overlay-pos"
        value="hidden"
        bind:group={overlayPos}
        onchange={persist}
      /> Hidden (Disable floating overlay completely)</label
    >
  </div>
</div>

<!-- Sites sub-section -->
<div class="sub-head"><h3>Domain Whitelists & Blacklists</h3></div>
<p class="hint" style="margin-top:0; line-height: 1.5;">
  NihongoAutoTracker automatically detects Japanese characters on any website to
  dynamically mount the tracking overlay.
  <br /><br />
  •
  <strong style="color:var(--color-success)">Whitelist (Force Overlay):</strong>
  Web domains where the floating overlay will <strong>always</strong> appear,
  bypassing automatic Japanese language detection.
  <br />
  • <strong style="color:var(--color-error)">Blacklist (Block Overlay):</strong>
  Web domains where the floating overlay is <strong>permanently blocked</strong>
  from appearing, even if Japanese characters are detected.
  <br /><br />
  <span style="color: var(--color-text-muted);"
    >Double-click any domain listed below to inline edit its host name.</span
  >
</p>

<div class="field" style="margin-bottom: 24px;">
  <label class="toggle">
    <input
      type="checkbox"
      id="allow-list-only"
      class="toggle-chk"
      bind:checked={allowListOnly}
      onchange={persist}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Only show overlay on Whitelisted domains (Disables automatic page analysis)
  </label>
</div>

<!-- Whitelist -->
<div class="sites-group">
  <button
    type="button"
    class="sites-toggle-head"
    class:open={allowOpen}
    style="width:100%; border:1px solid var(--color-border); text-align:left; background:var(--color-surface-alt);"
    onclick={() => (allowOpen = !allowOpen)}
  >
    <div class="sites-head-left">
      <span class="sites-head-label allow">Whitelist (Force Overlay)</span>
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
              aria-label="Remove whitelisted site"
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
          aria-label="New whitelisted site domain"
        />
        <button
          id="allow-add"
          class="btn btn-amber btn-sm"
          onclick={() => addSite("allow")}>Add Domain</button
        >
      </div>
    </div>
  {/if}
</div>

<!-- Blacklist -->
<div class="sites-group" style="margin-bottom: 0;">
  <button
    type="button"
    class="sites-toggle-head"
    class:open={skipOpen}
    style="width:100%; border:1px solid var(--color-border); text-align:left; background:var(--color-surface-alt);"
    onclick={() => (skipOpen = !skipOpen)}
  >
    <div class="sites-head-left">
      <span class="sites-head-label skip">Blacklist (Block Overlay)</span>
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
              aria-label="Remove blacklisted site"
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
          aria-label="New blacklisted site domain"
        />
        <button
          id="skip-add"
          class="btn btn-amber btn-sm"
          onclick={() => addSite("skip")}>Add Domain</button
        >
      </div>
    </div>
  {/if}
</div>

<!-- Appended Reset Button -->
<div style="display:flex; gap:10px; margin-top:36px;">
  <button id="reset-overlay-btn" class="btn btn-ghost" onclick={reset}
    >Revert to Default</button
  >
</div>
