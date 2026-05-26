<!--
  ── Settings Sidebar.svelte ──────────────────────────────────────────────────
  Navigation sidebar with tab switching, SVG icons, and debug toggle.
  Matches the original settings/index.html sidebar design exactly.
-->
<script lang="ts">
  import { configStorage } from "@/lib/storage/config";

  interface Props {
    activeTab: string;
    queueCount: number;
    debugMode: boolean;
    onTabChange: (tab: string) => void;
    onDebugToggle: (enabled: boolean) => void;
  }

  let { activeTab, queueCount, debugMode, onTabChange, onDebugToggle }: Props =
    $props();

  async function handleDebugToggle(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({ ...cfg, debugMode: checked });
    onDebugToggle(checked);
  }
</script>

<nav class="sidebar">
  <div class="brand">
    <div class="brand-mark">
      <img
        src="/NihongoAutoTracker.svg"
        style="width:100%; height:100%; object-fit:contain;"
        alt="NAT"
      />
    </div>
    <div>
      <div class="brand-name">NihongoAutoTracker</div>
      <div class="brand-ver">v3.4.3</div>
    </div>
  </div>

  <div class="nav-group">
    <!-- Queue -->
    <a
      class="nav-item"
      class:active={activeTab === "queue"}
      data-tab="queue"
      href="#queue"
      onclick={(e) => {
        e.preventDefault();
        onTabChange("queue");
      }}
    >
      <span class="nav-icon"
        ><svg viewBox="0 0 16 16"
          ><line x1="2" y1="4" x2="14" y2="4" /><line
            x1="2"
            y1="8"
            x2="14"
            y2="8"
          /><line x1="2" y1="12" x2="10" y2="12" /></svg
        ></span
      >
      Queue
      <span id="nav-badge" class="nav-badge" class:hidden={queueCount === 0}
        >{queueCount}</span
      >
    </a>

    <!-- API Key -->
    <a
      class="nav-item"
      class:active={activeTab === "api"}
      data-tab="api"
      href="#api"
      onclick={(e) => {
        e.preventDefault();
        onTabChange("api");
      }}
    >
      <span class="nav-icon"
        ><svg viewBox="0 0 16 16"
          ><circle cx="5.5" cy="10.5" r="3" /><path
            d="M8 8l5-5M13 3h-2M13 3v2"
          /></svg
        ></span
      >
      API Key
    </a>

    <!-- Theme / Appearance Selection -->
    <a
      class="nav-item"
      class:active={activeTab === "theme"}
      data-tab="theme"
      href="#theme"
      onclick={(e) => {
        e.preventDefault();
        onTabChange("theme");
      }}
    >
      <span class="nav-icon">
        <svg viewBox="0 0 16 16"
          ><circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            stroke-width="1.6"
            fill="none"
          /><path d="M8 2v12A6 6 0 0 0 8 2z" fill="currentColor" /></svg
        >
      </span>
      Theme
    </a>

    <!-- Video -->
    <a
      class="nav-item"
      class:active={activeTab === "video"}
      data-tab="video"
      href="#video"
      onclick={(e) => {
        e.preventDefault();
        onTabChange("video");
      }}
    >
      <span class="nav-icon"
        ><svg viewBox="0 0 16 16"
          ><polygon
            points="4,2 4,14 13,8"
            stroke="none"
            fill="currentColor"
          /></svg
        ></span
      >
      Video
    </a>

    <!-- Overlay -->
    <a
      class="nav-item"
      class:active={activeTab === "overlay"}
      data-tab="overlay"
      href="#overlay"
      onclick={(e) => {
        e.preventDefault();
        onTabChange("overlay");
      }}
    >
      <span class="nav-icon"
        ><svg viewBox="0 0 16 16"
          ><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2.5 2" /></svg
        ></span
      >
      Overlay
    </a>

    <!-- Readers -->
    <a
      class="nav-item"
      class:active={activeTab === "readers"}
      data-tab="readers"
      href="#readers"
      onclick={(e) => {
        e.preventDefault();
        onTabChange("readers");
      }}
    >
      <span class="nav-icon"
        ><svg viewBox="0 0 16 16"
          ><rect x="2" y="3" width="12" height="10" rx="1" /><line
            x1="5"
            y1="7"
            x2="11"
            y2="7"
          /><line x1="5" y1="10" x2="9" y2="10" /></svg
        ></span
      >
      Readers
    </a>

    <!-- Debug (only visible when Advanced enabled) -->
    {#if debugMode}
      <a
        class="nav-item"
        id="nav-debug"
        class:active={activeTab === "debug"}
        data-tab="debug"
        href="#debug"
        onclick={(e) => {
          e.preventDefault();
          onTabChange("debug");
        }}
      >
        <span class="nav-icon"
          ><svg viewBox="0 0 16 16"
            ><path
              d="M2 4h12M2 8h12M2 12h12"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            /></svg
          ></span
        >
        Debug
      </a>
    {/if}
  </div>

  <!-- Advanced toggle at bottom of sidebar -->
  <div
    style="margin-top: auto; padding: 20px 18px; border-top: 1px solid var(--color-border);"
  >
    <label class="toggle" style="font-size: 11px;">
      <input
        type="checkbox"
        id="debug-mode"
        class="toggle-chk"
        checked={debugMode}
        onchange={handleDebugToggle}
      />
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
      Advanced
    </label>
  </div>
</nav>
