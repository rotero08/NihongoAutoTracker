<!-- StremioTab.svelte -->
<script lang="ts">
  /**
   * ── Stremio Tab Settings ────────────────────────────────────────────────────
   * Connects and synchronises Stremio watched history using Trakt synchronization.
   */

  import { onDestroy, onMount } from "svelte";
  import { configStorage } from "@/lib/storage/config";
  import { importStremioFromTrakt, pollTraktDeviceAuth, startTraktDeviceAuth } from "@/lib/api/trakt";
  import { stepValue } from "@/lib/utils/math";

  interface Props {
    onStatus: (msg: string, err?: boolean) => void;
  }

  let { onStatus }: Props = $props();

  let enabled = $state(false);
  let clientId = $state("");
  let clientSecret = $state("");
  let tokenSet = $state(false);
  let queueMode = $state<"queue" | "auto">("queue");
  let pollMinutes = $state(5);
  let japaneseOnly = $state(true);
  let userCode = $state("");
  let verificationUrl = $state("https://trakt.tv/activate");
  let deviceCode = $state("");
  let authPending = $state(false);
  let isImporting = $state(false);
  let pollTimer: any;
  const isConnected = $derived(enabled && tokenSet);

  async function load() {
    const cfg = (await configStorage.getValue()) as any;
    enabled = cfg.stremioEnabled === true;
    clientId = cfg.traktClientId || "";
    clientSecret = cfg.traktClientSecret || "";
    tokenSet = Boolean(cfg.traktAccessToken);
    queueMode = cfg.stremioQueueMode || "queue";
    pollMinutes = Number(cfg.stremioPollMinutes ?? 5);
    japaneseOnly = cfg.stremioJapaneseOnly !== false;
  }

  async function save(options?: { silent?: boolean }) {
    const cfg = (await configStorage.getValue()) as any;
    const wasEnabled = cfg.stremioEnabled === true;
    const activatedAt =
      enabled && (!wasEnabled || !cfg.stremioActivatedAt)
        ? new Date().toISOString()
        : cfg.stremioActivatedAt;
    await configStorage.setValue({
      ...cfg,
      stremioEnabled: enabled,
      traktClientId: clientId.trim(),
      traktClientSecret: clientSecret.trim() || cfg.traktClientSecret,
      stremioQueueMode: queueMode,
      stremioPollMinutes: Math.max(1, Number(pollMinutes || 5)),
      stremioJapaneseOnly: japaneseOnly,
      stremioActivatedAt: activatedAt,
    });
    if (!options?.silent) {
      onStatus("✓ Stremio settings saved");
    }
  }

  async function startAuth() {
    try {
      await save({ silent: true });
      const auth = await startTraktDeviceAuth();
      userCode = auth.userCode;
      verificationUrl = auth.verificationUrl;
      deviceCode = auth.deviceCode;
      authPending = true;
      clearInterval(pollTimer);
      pollTimer = setInterval(checkAuth, Math.max(5000, auth.interval * 1000));
      onStatus("✓ Trakt code created");
    } catch (error: any) {
      onStatus(error.message, true);
    }
  }

  async function checkAuth() {
    if (!deviceCode) return;
    try {
      const state = await pollTraktDeviceAuth(deviceCode);
      if (state === "authorized") {
        clearInterval(pollTimer);
        authPending = false;
        tokenSet = true;
        userCode = "";
        onStatus("✓ Trakt authorized");
      }
    } catch (error: any) {
      clearInterval(pollTimer);
      authPending = false;
      onStatus(error.message, true);
    }
  }

  async function importNow() {
    isImporting = true;
    try {
      await save({ silent: true });
      const result = await importStremioFromTrakt();
      onStatus(`✓ Checked ${result.checked}, queued ${result.imported}, filtered ${result.filteredOut}`);
    } catch (error: any) {
      onStatus(error.message, true);
    } finally {
      isImporting = false;
    }
  }

  onMount(load);
  onDestroy(() => clearInterval(pollTimer));
</script>

<div class="tab-head">
  <h2>Stremio</h2>
  <div class="tab-actions">
    <button class="btn btn-amber btn-sm" onclick={() => save()}>Save</button>
  </div>
</div>

<p class="hint">
  Stremio support uses Trakt watched history. Nothing is imported unless this module is enabled, the browser is open and Trakt is connected.
</p>

<div class="stremio-status-card" class:is-connected={isConnected}>
  <div class="stremio-status-dot"></div>
  <div class="stremio-status-content">
    <div class="stremio-status-title">
      {isConnected ? "Trakt Active" : "Trakt Inactive"}
    </div>
    <div class="stremio-status-desc">
      {#if isConnected}
        Polling watched history every {Math.max(1, Number(pollMinutes || 5))}m
      {:else if enabled}
        Enter credentials, save, and click Authorize Trakt
      {:else}
        Enable Stremio integration above to begin
      {/if}
    </div>
  </div>
</div>

<div class="field">
  <label class="toggle">
    <input type="checkbox" class="toggle-chk" bind:checked={enabled} onchange={() => save()} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Enable Stremio via Trakt
  </label>
</div>

<div id="auto-config" style:opacity={enabled ? 1 : 0.55}>
  <div class="info-box">
    Create a Trakt API app at
    <a href="https://trakt.tv/oauth/applications/new" target="_blank" rel="noreferrer" style="color: var(--color-accent);">
      trakt.tv/oauth/applications/new
    </a>. Use redirect URI <code style="color: var(--color-text);">urn:ietf:wg:oauth:2.0:oob</code>, then paste the credentials below.
  </div>

  <div class="field">
    <label for="trakt-client-id">Trakt Client ID</label>
    <input id="trakt-client-id" class="input" bind:value={clientId} placeholder="Paste your Trakt client ID" />
  </div>
  <div class="field">
    <label for="trakt-client-secret">Trakt Client Secret</label>
    <input id="trakt-client-secret" class="input" type="password" bind:value={clientSecret} placeholder={tokenSet ? "Leave blank to keep saved secret" : "Paste your Trakt client secret"} />
  </div>

  <div class="field">
    <div style="font-size: 12px; font-weight: 700; margin-bottom: 8px;">When Trakt finds a watched episode</div>
    <div class="thresh-row">
      <label class="thresh-opt">
        <input type="radio" bind:group={queueMode} value="queue" />
        Add to queue
      </label>
      <label class="thresh-opt">
        <input type="radio" bind:group={queueMode} value="auto" />
        Send automatically
      </label>
    </div>
  </div>

  <div class="field" style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
    <div>
      <label for="stremio-poll-minutes">Poll every minutes</label>
      <div class="thresh-spinner">
        <input id="stremio-poll-minutes" class="input" type="number" min="1" bind:value={pollMinutes} />
        <div class="thresh-spin-btns">
          <button type="button" class="thresh-spin-up" onclick={() => { pollMinutes = stepValue(pollMinutes, 'up'); }} aria-label="Increment poll minutes" title="Increment">
            <svg viewBox="0 0 10 6" aria-hidden="true"><polyline points="1,5 5,1 9,5" /></svg>
          </button>
          <button type="button" class="thresh-spin-dn" onclick={() => { pollMinutes = stepValue(pollMinutes, 'down'); }} aria-label="Decrement poll minutes" title="Decrement">
            <svg viewBox="0 0 10 6" aria-hidden="true"><polyline points="1,1 5,5 9,1" /></svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <div class="field">
    <label class="toggle">
      <input type="checkbox" class="toggle-chk" bind:checked={japaneseOnly} />
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
      Only import Japanese-original media
    </label>
  </div>

  <div class="field" style="display:flex; gap: 8px; align-items:center; flex-wrap:wrap;">
    <button class="btn btn-ghost btn-sm" onclick={startAuth}>Authorize Trakt</button>
    <button class="btn btn-ghost btn-sm" onclick={importNow} disabled={isImporting || !tokenSet}>
      {isImporting ? "Checking..." : "Import Now"}
    </button>
    <span style="font-size:11px; color: var(--color-text-muted);">
      Trakt connection: {tokenSet ? "authorized" : "not authorized"}
    </span>
  </div>

  {#if userCode}
    <div class="info-box">
      Open <a href={verificationUrl} target="_blank" rel="noreferrer" style="color: var(--color-accent);">trakt.tv/activate</a> and enter <strong>{userCode}</strong>.
    </div>
  {/if}
</div>

<style>
  .stremio-status-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 6px;
    background: rgba(240, 112, 106, 0.06);
    border: 1px solid rgba(240, 112, 106, 0.15);
    margin-bottom: 16px;
  }
  .stremio-status-card.is-connected {
    background: rgba(61, 220, 132, 0.06);
    border-color: rgba(61, 220, 132, 0.15);
  }
  .stremio-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-error, #f0706a);
  }
  .stremio-status-card.is-connected .stremio-status-dot {
    background: var(--color-success, #3ddc84);
  }
  .stremio-status-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stremio-status-title {
    font-size: 12px;
    font-weight: bold;
    color: var(--color-text, #dde4f0);
  }
  .stremio-status-desc {
    font-size: 11px;
    color: var(--color-text-muted, #7a8ca5);
  }
</style>
