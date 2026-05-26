<!--
  ── ApiKeyTab.svelte ─────────────────────────────────────────────────────────
  Settings tab for configuring the NihongoTracker API key.
  Matches the original settings/index.html #tab-api section exactly.
-->
<script lang="ts">
  import { configStorage } from "@/lib/storage/config";

  interface Props {
    onStatus: (msg: string, err?: boolean) => void;
  }
  let { onStatus }: Props = $props();

  let apiKey = $state("");
  let showKey = $state(false);
  let statusText = $state("");
  let statusOk = $state(false);

  export async function load() {
    const cfg = (await configStorage.getValue()) as any;
    apiKey = cfg.apiKey ?? "";
    updateStatus(apiKey);
  }

  function updateStatus(key: string) {
    statusText = key ? "● Key is configured" : "○ No key set";
    statusOk = !!key;
  }

  async function save() {
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({ ...cfg, apiKey: apiKey.trim() });
    updateStatus(apiKey.trim());
    onStatus("✓ API Key Saved");
  }

  load();
</script>

<div class="tab-head">
  <h2>API Key</h2>
</div>

<p class="hint">
  Get this from your NihongoTracker account
  <a
    href="https://nihongotracker.app/settings"
    target="_blank"
    rel="noopener noreferrer"
    style="color: var(--color-accent); text-decoration: underline; transition: opacity 0.2s;"
    >settings</a
  > page.
</p>

<div class="field">
  <label class="label" for="api-key">API Key</label>
  <div class="row-inline">
    <input
      type={showKey ? "text" : "password"}
      id="api-key"
      class="input"
      placeholder="Paste your key here…"
      autocomplete="off"
      bind:value={apiKey}
      onchange={save}
    />
    <button
      id="toggle-key"
      class="btn btn-ghost btn-icon"
      onclick={() => (showKey = !showKey)}
      aria-label="Toggle API Key Visibility"
      title="Toggle Visibility"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        ><ellipse cx="8" cy="8" rx="6" ry="4" /><circle
          cx="8"
          cy="8"
          r="1.5"
          fill="currentColor"
          stroke="none"
        /></svg
      >
    </button>
  </div>
  <div
    id="api-status"
    class="api-status"
    class:ok={statusOk}
    style={statusOk ? "" : "color: var(--color-error) !important;"}
  >
    {statusText}
  </div>
</div>

<button id="save-api-btn" class="btn btn-amber" onclick={save}
  >Save API Key</button
>

<style>
  /* Force adaptive, theme-bound green color with 100% Svelte compiler reliability */
  .api-status.ok {
    color: var(--color-api-green) !important;
  }
</style>
