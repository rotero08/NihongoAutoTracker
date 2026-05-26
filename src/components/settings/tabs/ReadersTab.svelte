<!--
  ── ReadersTab.svelte ────────────────────────────────────────────────────────
  Reader integration settings: tracking workflows, regex rules, and site status.
  Saves all settings automatically on any change.
-->
<script lang="ts">
  import { configStorage } from "@/lib/storage/config";
  import { DEFAULT_TITLE_REGEXES } from "@/lib/constants";

  interface Props {
    onStatus: (msg: string, err?: boolean) => void;
  }
  let { onStatus }: Props = $props();

  /* ── State ── */
  let readerAutoSave = $state(true);
  let readerDirectSend = $state(false);
  let hideUnavailableActions = $state(false); // Global toggle to hide unavailable controls
  let ttuEnabled = $state(true);
  let yatsuEnabled = $state(true);
  let yomiyasuEnabled = $state(true);
  let regexes: Array<{ desc: string; re: string }> = $state([]);
  let newDesc = $state("");
  let newRe = $state("");
  let regexOpen = $state(false);

  export async function load() {
    const cfg = (await configStorage.getValue()) as any;
    readerAutoSave = cfg.readerAutoSave ?? cfg.ttuAutoSave ?? true;
    readerDirectSend = cfg.readerDirectSend ?? cfg.ttuDirectSend ?? false;
    hideUnavailableActions = cfg.hideUnavailableActions ?? false;
    ttuEnabled = cfg.ttuEnabled ?? true;
    yatsuEnabled = cfg.yatsuEnabled ?? true;
    yomiyasuEnabled = cfg.yomiyasuEnabled ?? true;
    regexes = cfg.titleRegexes ?? [...DEFAULT_TITLE_REGEXES];
  }

  /* ── Auto-Saving Logic ── */
  async function persistSyncToggles() {
    const cfg = (await configStorage.getValue()) as any;
    cfg.readerAutoSave = readerAutoSave;
    cfg.ttuAutoSave = readerAutoSave;
    cfg.readerDirectSend = readerDirectSend;
    cfg.ttuDirectSend = readerDirectSend;
    cfg.hideUnavailableActions = hideUnavailableActions;
    await configStorage.setValue(cfg);
    onStatus("✓ Tracking Settings Saved");
  }

  async function persistToggle(key: string, value: boolean, msg: string) {
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({ ...cfg, [key]: value });
    onStatus(msg);
  }

  // Handle click on card wrapper element
  function handleCardClick(e: MouseEvent, targetMode: boolean) {
    const target = e.target as HTMLElement;
    // Let native checkboxes, inputs, and toggle tracks handle click events
    if (
      target.closest(".toggle") ||
      target.tagName === "INPUT" ||
      target.tagName === "BUTTON"
    ) {
      return;
    }
    if (readerAutoSave !== targetMode) {
      readerAutoSave = targetMode;
      persistSyncToggles();
    }
  }

  async function addRegex() {
    if (!newDesc.trim() || !newRe.trim()) return;
    try {
      new RegExp(newRe);
    } catch {
      onStatus("⚠ Invalid Regex Pattern", true);
      return;
    }
    const cfg = (await configStorage.getValue()) as any;
    const current = cfg.titleRegexes ?? [...DEFAULT_TITLE_REGEXES];
    await configStorage.setValue({
      ...cfg,
      titleRegexes: [...current, { desc: newDesc.trim(), re: newRe.trim() }],
    });
    newDesc = "";
    newRe = "";
    await load();
    onStatus("✓ Regex Rule Added");
  }

  async function removeRegex(idx: number) {
    const cfg = (await configStorage.getValue()) as any;
    const current = [...(cfg.titleRegexes ?? [...DEFAULT_TITLE_REGEXES])];
    current.splice(idx, 1);
    await configStorage.setValue({ ...cfg, titleRegexes: current });
    await load();
    onStatus("✓ Regex Rule Removed");
  }

  async function moveRegex(idx: number, dir: number) {
    const cfg = (await configStorage.getValue()) as any;
    const current = [...(cfg.titleRegexes ?? [...DEFAULT_TITLE_REGEXES])];
    if (idx + dir < 0 || idx + dir >= current.length) return;
    [current[idx], current[idx + dir]] = [current[idx + dir], current[idx]];
    await configStorage.setValue({ ...cfg, titleRegexes: current });
    await load();
  }

  async function handleRegexEdit(
    idx: number,
    field: "desc" | "re",
    val: string,
  ) {
    const cfg = (await configStorage.getValue()) as any;
    const current = [...(cfg.titleRegexes ?? [...DEFAULT_TITLE_REGEXES])];
    if (idx < 0 || idx >= current.length) return;
    if (field === "re") {
      try {
        new RegExp(val);
      } catch {
        onStatus("⚠ Invalid Regex Pattern", true);
        return;
      }
    }
    current[idx] = { ...current[idx], [field]: val };
    await configStorage.setValue({ ...cfg, titleRegexes: current });
    await load();
    onStatus("✓ Regex Rule Updated");
  }

  async function reset() {
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({
      ...cfg,
      readerAutoSave: true,
      readerDirectSend: false,
      hideUnavailableActions: false,
      ttuEnabled: true,
      yatsuEnabled: true,
      yomiyasuEnabled: true,
      titleRegexes: [...DEFAULT_TITLE_REGEXES],
    });
    await load();
    onStatus("✓ Default Reader Settings Restored");
  }

  load();
</script>

<div class="tab-head"><h2>Reading Apps Configuration</h2></div>
<p class="hint">
  Configure tracking behavior and sync workflows for supported reading
  applications. All settings auto-save.
</p>

<!-- Simplified and Visual Tracking Workflow Selection -->
<div class="field" style="margin-top: 24px; margin-bottom: 24px;">
  <span class="label">Synchronisation Workflow</span>
  <div
    style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;"
  >
    <!-- Option 1: Background Auto-Sync Card -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="thresh-opt"
      class:selected={readerAutoSave}
      onclick={(e) => handleCardClick(e, true)}
      style="display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; text-align: left; gap: 10px; padding: 14px 18px; cursor: pointer; background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: 6px;"
    >
      <label
        style="display: flex; align-items: center; gap: 10px; cursor: pointer; width: 100%;"
      >
        <input
          type="radio"
          name="sync-workflow-mode"
          checked={readerAutoSave}
          onchange={() => {
            readerAutoSave = true;
            persistSyncToggles();
          }}
          style="cursor: pointer; width: 15px; height: 15px;"
        />
        <strong style="color: var(--color-text); font-size: 13px;"
          >Background Auto-Sync</strong
        >
      </label>
      <span
        style="font-size: 12px; color: var(--color-text-muted); margin-left: 25px; line-height: 1.45; display: block;"
      >
        Automatically record reading sessions to your local pending queue in the
        background. Because session progress is tracked automatically, the
        manual Save & Queue button is disabled on your reader dashboard.
      </span>
    </div>

    <!-- Option 2: Pure Manual Logging Card -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="thresh-opt"
      class:selected={!readerAutoSave}
      onclick={(e) => handleCardClick(e, false)}
      style="display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; text-align: left; gap: 8px; padding: 14px 18px; cursor: pointer; background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: 6px;"
    >
      <label
        style="display: flex; align-items: center; gap: 10px; cursor: pointer; width: 100%;"
      >
        <input
          type="radio"
          name="sync-workflow-mode"
          checked={!readerAutoSave}
          onchange={() => {
            readerAutoSave = false;
            persistSyncToggles();
          }}
          style="cursor: pointer; width: 15px; height: 15px;"
        />
        <strong style="color: var(--color-text); font-size: 13px;"
          >Manual Sync Only</strong
        >
      </label>
      <span
        style="font-size: 12px; color: var(--color-text-muted); margin-left: 25px; line-height: 1.45; display: block;"
      >
        Background tracking is completely disabled. Progression is only recorded
        and added to your pending queue when you click the Save & Queue button
        on your reader dashboard.
      </span>
    </div>
  </div>
</div>

<!-- Dashboard Actions & Shortcuts Section -->
<div class="sub-head"><h3>Dashboard Actions & Shortcuts</h3></div>
<p class="hint" style="margin-top: 0; margin-bottom: 20px;">
  Customise the behavior of the manual shortcuts in your reader dashboard.
</p>

<div class="field" style="margin-bottom: 16px;">
  <label class="toggle" style="gap: 12px;">
    <input
      type="checkbox"
      id="direct-send-sub-toggle"
      class="toggle-chk"
      bind:checked={readerDirectSend}
      onchange={persistSyncToggles}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <div>
      <strong style="font-size: 12px;"
        >Enable Direct Send shortcut button</strong
      >
      <div
        style="font-size: 11px; color: var(--color-text-muted); margin-top: 2px; line-height: 1.35;"
      >
        Adds a Direct Send button (paper airplane icon) inside your reader
        dashboard. When a book is linked on AniList, click it to instantly send
        your session directly to NihongoTracker and clear it from your pending
        queue.
      </div>
    </div>
  </label>
</div>

<div class="field" style="margin-bottom: 24px;">
  <label class="toggle" style="gap: 12px;">
    <input
      type="checkbox"
      id="hide-unavailable-toggle"
      class="toggle-chk"
      bind:checked={hideUnavailableActions}
      onchange={persistSyncToggles}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <div>
      <strong style="font-size: 12px;"
        >Hide unavailable dashboard actions</strong
      >
      <div
        style="font-size: 11px; color: var(--color-text-muted); margin-top: 2px; line-height: 1.35;"
      >
        Hides the Save & Queue or Direct Send buttons from your reader toolbar
        when they are unavailable, rather than showing them as disabled.
      </div>
    </div>
  </label>
</div>

<!-- Individual Site Enable Toggles with Labeled Choices -->
<div class="sub-head"><h3>Supported Reading Platforms</h3></div>

<!-- TTU -->
<div class="reader-card">
  <div class="reader-card-left" style="padding: 2px 0;">
    <span class="reader-card-name">TTU Reader (reader.ttsu.app)</span>
    {#if ttuEnabled}
      <span
        style="font-size: 11px; color: var(--color-success); font-weight: bold; margin-top: 3px; display: block;"
        >Tracking Enabled (overlay timer & dashboard icons active)</span
      >
    {:else}
      <span
        style="font-size: 11px; color: var(--color-text-muted); margin-top: 3px; display: block;"
        >Tracking Disabled (entirely ignored)</span
      >
    {/if}
  </div>
  <label class="toggle">
    <span
      style="font-size: 11px; color: var(--color-text-muted); margin-right: 4px;"
      >Active</span
    >
    <input
      type="checkbox"
      id="ttu-enabled"
      class="toggle-chk"
      checked={ttuEnabled}
      onchange={(e) => {
        ttuEnabled = (e.target as HTMLInputElement).checked;
        persistToggle(
          "ttuEnabled",
          ttuEnabled,
          ttuEnabled ? "✓ TTU tracking enabled" : "✓ TTU tracking disabled",
        );
      }}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
  </label>
</div>

<!-- Yatsu -->
<div class="reader-card">
  <div class="reader-card-left" style="padding: 2px 0;">
    <span class="reader-card-name">Yatsu Reader (app.yatsu.moe)</span>
    {#if yatsuEnabled}
      <span
        style="font-size: 11px; color: var(--color-success); font-weight: bold; margin-top: 3px; display: block;"
        >Tracking Enabled (overlay timer & dashboard icons active)</span
      >
    {:else}
      <span
        style="font-size: 11px; color: var(--color-text-muted); margin-top: 3px; display: block;"
        >Tracking Disabled (entirely ignored)</span
      >
    {/if}
  </div>
  <label class="toggle">
    <span
      style="font-size: 11px; color: var(--color-text-muted); margin-right: 4px;"
      >Active</span
    >
    <input
      type="checkbox"
      id="yatsu-enabled"
      class="toggle-chk"
      checked={yatsuEnabled}
      onchange={(e) => {
        yatsuEnabled = (e.target as HTMLInputElement).checked;
        persistToggle(
          "yatsuEnabled",
          yatsuEnabled,
          yatsuEnabled
            ? "✓ Yatsu tracking enabled"
            : "✓ Yatsu tracking disabled",
        );
      }}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
  </label>
</div>

<!-- YomiYasu (Host domain address hidden completely) -->
<div class="reader-card" style="margin-bottom: 0;">
  <div class="reader-card-left" style="padding: 2px 0;">
    <span class="reader-card-name">YomiYasu Reader</span>
    {#if yomiyasuEnabled}
      <span
        style="font-size: 11px; color: var(--color-success); font-weight: bold; margin-top: 3px; display: block;"
        >Tracking Enabled (overlay timer & dashboard icons active)</span
      >
    {:else}
      <span
        style="font-size: 11px; color: var(--color-text-muted); margin-top: 3px; display: block;"
        >Tracking Disabled (entirely ignored)</span
      >
    {/if}
  </div>
  <label class="toggle">
    <span
      style="font-size: 11px; color: var(--color-text-muted); margin-right: 4px;"
      >Active</span
    >
    <input
      type="checkbox"
      id="yomiyasu-enabled"
      class="toggle-chk"
      checked={yomiyasuEnabled}
      onchange={(e) => {
        yomiyasuEnabled = (e.target as HTMLInputElement).checked;
        persistToggle(
          "yomiyasuEnabled",
          yomiyasuEnabled,
          yomiyasuEnabled
            ? "✓ YomiYasu tracking enabled"
            : "✓ YomiYasu tracking disabled",
        );
      }}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
  </label>
</div>

<!-- Regex Rules -->
<div class="sites-group" style="margin-top: 24px; margin-bottom: 8px;">
  <div
    class="sites-toggle-head"
    class:open={regexOpen}
    role="button"
    tabindex="0"
    onclick={() => (regexOpen = !regexOpen)}
    onkeydown={(e) => e.key === "Enter" && (regexOpen = !regexOpen)}
  >
    <div class="sites-head-left">
      <span class="sites-head-label" style="color: var(--color-accent);"
        >Title/Volume Parsing Regex Rules</span
      >
    </div>
    <span class="sites-chevron"
      ><svg viewBox="0 0 12 8"><polyline points="1,1 6,7 11,1" /></svg></span
    >
  </div>
  {#if regexOpen}
    <div class="sites-body open" id="regex-body" style="padding: 12px;">
      <p class="hint" style="margin-top:0; margin-bottom:12px;">
        <strong style="color:var(--color-text)">Order Matters!</strong> Rules
        are evaluated from top to bottom. The first regex that successfully
        matches will be used. Put highly specific edge cases at the top, and
        broad generic cases at the bottom. Use capture group 1
        <code>(.*?)</code>
        to extract the Title, and group 2 <code>(\d+)</code> to extract the Volume.
      </p>
      <div
        class="site-list"
        id="regex-list"
        style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;"
      >
        {#each regexes as rule, i}
          <div class="regex-item">
            <div class="regex-arrows">
              <button
                class="arrow-btn"
                disabled={i === 0}
                onclick={() => moveRegex(i, -1)}>▲</button
              >
              <button
                class="arrow-btn"
                disabled={i === regexes.length - 1}
                onclick={() => moveRegex(i, 1)}>▼</button
              >
            </div>
            <div class="regex-body-inner">
              <div class="regex-row">
                <span class="regex-label">Desc</span>
                <input
                  type="text"
                  class="regex-input-val"
                  value={rule.desc}
                  onchange={(e) =>
                    handleRegexEdit(
                      i,
                      "desc",
                      (e.target as HTMLInputElement).value,
                    )}
                  aria-label="Regex description"
                />
              </div>
              <div class="regex-row">
                <span class="regex-label">Regex</span>
                <input
                  type="text"
                  class="regex-input-val mono"
                  style="font-family: var(--font-mono);"
                  value={rule.re}
                  onchange={(e) =>
                    handleRegexEdit(
                      i,
                      "re",
                      (e.target as HTMLInputElement).value,
                    )}
                  aria-label="Regex pattern"
                />
              </div>
            </div>
            <button class="regex-remove" onclick={() => removeRegex(i)}
              >×</button
            >
          </div>
        {/each}
      </div>
      <div
        style="display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--color-border); padding-top: 16px;"
      >
        <input
          type="text"
          id="regex-desc-input"
          class="input"
          placeholder="Description (e.g., specific publisher or naming format)"
          style="padding: 8px 12px;"
          bind:value={newDesc}
        />
        <div style="display: flex; gap: 8px;">
          <input
            type="text"
            id="regex-val-input"
            class="input"
            placeholder="Regex e.g. ^(.*?)\s+(\d+)$"
            style="font-family: var(--font-mono); flex: 1; padding: 8px 12px;"
            bind:value={newRe}
          />
          <button
            id="regex-add"
            class="btn btn-amber btn-sm"
            style="white-space: nowrap; padding: 0 16px;"
            onclick={addRegex}>Add Rule</button
          >
        </div>
      </div>
    </div>
  {/if}
</div>

<div style="display:flex; gap:10px; margin-top: 24px;">
  <button id="reset-readers-btn" class="btn btn-ghost" onclick={reset}
    >Revert to Default</button
  >
</div>

<style>
  /* Selection card styling overrides */
  .thresh-opt {
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .thresh-opt.selected {
    border-color: color-mix(
      in srgb,
      var(--color-accent) 45%,
      transparent
    ) !important;
    background: color-mix(
      in srgb,
      var(--color-accent) 3%,
      transparent
    ) !important;
  }

  .regex-item {
    display: flex;
    align-items: stretch;
    padding: 4px 6px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }
  .regex-arrows {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-right: 8px;
    border-right: 1px dashed var(--color-border);
    margin-right: 8px;
    gap: 4px;
  }
  .arrow-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 2px;
    font-size: 10px;
  }
  .arrow-btn:disabled {
    opacity: 0.2;
    cursor: default;
  }
  .regex-body-inner {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 0;
  }
  .regex-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .regex-label {
    font-size: 10px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    font-weight: 700;
    width: 45px;
  }
  .regex-input-val {
    background: transparent;
    border: 1px solid transparent;
    color: var(--color-text);
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 3px;
    width: 100%;
    outline: none;
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  .regex-input-val:hover,
  .regex-input-val:focus {
    border-color: var(--color-border);
    background: rgba(255, 255, 255, 0.02);
  }
  .regex-input-val.mono {
    color: var(--color-accent);
  }
  .regex-remove {
    background: none;
    border: none;
    color: var(--color-error);
    cursor: pointer;
    font-size: 16px;
    padding: 8px;
    margin-left: 4px;
    border-left: 1px dashed var(--color-border);
    display: flex;
    align-items: center;
  }
</style>
