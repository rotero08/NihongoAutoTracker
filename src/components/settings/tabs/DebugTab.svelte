<!-- DebugTab.svelte -->
<script lang="ts">
  import { configStorage } from "@/lib/storage/config";
  import type { DebugLogEntry } from "@/lib/types";
  import { onMount } from "svelte";

  interface Props {
    onStatus: (msg: string, err?: boolean) => void;
  }
  let { onStatus }: Props = $props();

  let logs: DebugLogEntry[] = $state([]);
  let diagnosticData = $state({
    extVersion: "Unknown",
    browser: "Unknown Browser",
    os: "Unknown OS",
    theme: "global",
    font: "sans",
    apiKeySet: "No",
    autoSendEOD: "Disabled",
  });

  export async function load() {
    const [cfg, response] = await Promise.all([
      configStorage.getValue() as Promise<any>,
      browser.runtime
        .sendMessage({ action: "GET_DEBUG_LOGS" })
        .catch(() => ({ logs: [] })),
    ]);

    logs = response?.logs || [];
    parseSystemDiagnostics(cfg);
  }

  function parseSystemDiagnostics(cfg: any) {
    if (!cfg) return;
    const ua = navigator.userAgent;
    let browserName = "Unknown Browser";
    let osName = "Unknown OS";

    if (ua.includes("Firefox")) browserName = "Mozilla Firefox";
    else if (ua.includes("Chrome") && !ua.includes("Edg"))
      browserName = "Google Chrome / Chromium";
    else if (ua.includes("Safari") && !ua.includes("Chrome"))
      browserName = "Apple Safari";
    else if (ua.includes("Edg")) browserName = "Microsoft Edge";

    if (ua.includes("Windows")) osName = "Windows";
    else if (ua.includes("Macintosh")) osName = "macOS";
    else if (ua.includes("Linux")) osName = "Linux";
    else if (ua.includes("Android")) osName = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) osName = "iOS";

    const browserAPI =
      (globalThis as any).browser || (globalThis as any).chrome;
    const extVersion =
      browserAPI?.runtime?.getManifest?.()?.version || "Unknown";

    diagnosticData = {
      extVersion,
      browser: browserName,
      os: osName,
      theme: cfg.theme || "dark-amber",
      font: cfg.font || "sans",
      apiKeySet: cfg.apiKey ? "Yes" : "No",
      autoSendEOD: cfg.autoSendEndOfDay ? "Enabled" : "Disabled",
    };
  }

  async function copyDiagnosticReport() {
    let report = `### NihongoAutoTracker Diagnostics Report\n`;
    report += `**Date:** ${new Date().toLocaleString()}\n`;
    report += `**Extension Version:** v${diagnosticData.extVersion}\n`;
    report += `**Browser:** ${diagnosticData.browser}\n`;
    report += `**OS:** ${diagnosticData.os}\n`;
    report += `**Theme:** ${diagnosticData.theme}\n`;
    report += `**Font:** ${diagnosticData.font}\n`;
    report += `**API Key Set:** ${diagnosticData.apiKeySet}\n`;
    report += `**Auto EOD Send:** ${diagnosticData.autoSendEOD}\n\n`;

    report += `#### System Logs (${logs.length} entries):\n`;
    if (logs.length === 0) {
      report += `*No logs collected.*\n`;
    } else {
      report += `\`\`\`text\n`;
      logs.forEach((log) => {
        const time = new Date(log.timestamp).toISOString();
        report += `[${time}] [${log.level}] [${log.source}] ${log.message}\n`;
        if (log.data) {
          report += `  Data: ${log.data}\n`;
        }
      });
      report += `\`\`\`\n`;
    }

    try {
      await navigator.clipboard.writeText(report);
      onStatus("✓ Diagnostics Copied");
    } catch {
      onStatus("⚠ Failed to Copy", true);
    }
  }

  async function downloadLogFile() {
    let content = `NihongoAutoTracker Diagnostics Report\n`;
    content += `=====================================\n`;
    content += `Generated: ${new Date().toLocaleString()}\n`;
    content += `Version:   v${diagnosticData.extVersion}\n`;
    content += `Browser:   ${diagnosticData.browser}\n`;
    content += `OS:        ${diagnosticData.os}\n`;
    content += `Theme:     ${diagnosticData.theme}\n`;
    content += `Font:      ${diagnosticData.font}\n`;
    content += `API Key:   ${diagnosticData.apiKeySet}\n`;
    content += `Auto EOD:  ${diagnosticData.autoSendEOD}\n`;
    content += `=====================================\n\n`;

    content += `LOGS:\n`;
    if (logs.length === 0) {
      content += `No logs available.\n`;
    } else {
      logs.forEach((log, index) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        content += `${index + 1}. [${time}] [${log.level}] [${log.source}] ${log.message}\n`;
        if (log.data) {
          content += `   Data: ${log.data}\n`;
        }
      });
    }

    try {
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nat_debug_logs_${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      onStatus("✓ Log File Downloaded");
    } catch {
      onStatus("⚠ Download Failed", true);
    }
  }

  async function clearLogs() {
    if (!confirm("Are you sure you want to clear all debug logs?")) return;
    await browser.runtime
      .sendMessage({ action: "CLEAR_DEBUG_LOGS" })
      .catch(() => {});
    await load();
    onStatus("✓ Logs Cleared");
  }

  async function refresh() {
    await load();
    onStatus("✓ Refreshed");
  }

  onMount(() => {
    load();
  });
</script>

<div class="tab-head">
  <h2>System Debug Logs</h2>
  <div class="tab-actions">
    <button
      id="copy-debug-btn"
      class="btn btn-ghost btn-sm"
      onclick={copyDiagnosticReport}>Copy Report</button
    >
    <button
      id="download-debug-btn"
      class="btn btn-ghost btn-sm"
      onclick={downloadLogFile}>Download File</button
    >
    <button
      id="clear-debug-btn"
      class="btn btn-ghost btn-sm"
      style="color: var(--color-error); border-color: rgba(239, 68, 68, 0.2);"
      onclick={clearLogs}>Clear Logs</button
    >
    <button
      id="refresh-debug-btn"
      class="btn btn-amber btn-sm"
      onclick={refresh}>Refresh</button
    >
  </div>
</div>
<p class="hint" style="margin-top:0; margin-bottom: 16px;">
  Review diagnostic profiles, export runtime metrics, or investigate terminal
  tracking errors.
</p>

<!-- Console Diagnostics Info Box -->
<div class="console-diagnostics">
  <div class="console-diag-title">NAT SYSTEM DIAGNOSTICS:</div>
  <div class="console-diag-grid">
    <div><span>Version:</span> {diagnosticData.extVersion}</div>
    <div><span>Theme:</span> {diagnosticData.theme}</div>
    <div><span>Browser:</span> {diagnosticData.browser}</div>
    <div><span>Font:</span> {diagnosticData.font}</div>
    <div><span>Platform:</span> {diagnosticData.os}</div>
    <div><span>API Key Configured:</span> {diagnosticData.apiKeySet}</div>
    <div><span>EOD Auto-Flush:</span> {diagnosticData.autoSendEOD}</div>
  </div>
</div>

<!-- Monochromatic Console Style Log Window -->
<div class="console-window">
  <div class="console-header">
    <div class="console-dots">
      <span style="background: #252a34"></span>
      <span style="background: #252a34"></span>
      <span style="background: #252a34"></span>
    </div>
    <span class="console-tab-name">immersion-daemon.log</span>
  </div>
  <div class="console-body" id="debug-logs-list">
    {#if logs.length === 0}
      <div class="console-empty">
        <span class="console-marker">$</span> no active logs registered in database.
      </div>
    {:else}
      {#each logs as log}
        <div class="console-line {log.level.toLowerCase()}">
          <div class="console-meta-row">
            <span class="console-marker">></span>
            <span class="console-time"
              >[{new Date(log.timestamp).toLocaleTimeString()}]</span
            >
            <span class="console-level">[{log.level}]</span>
            <span class="console-src">{log.source}:</span>
            <span class="console-msg">{log.message}</span>
          </div>
          {#if log.data}
            <pre class="console-data">{log.data}</pre>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  /* Diagnostics Box Styling */
  .console-diagnostics {
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--rounded-box);
    padding: 12px 16px;
    font-family: var(--font-mono);
    font-size: 11px;
    margin-bottom: 20px;
    box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  .console-diag-title {
    color: var(--color-text);
    font-weight: bold;
    margin-bottom: 8px;
    letter-spacing: 0.05em;
  }
  .console-diag-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 16px;
    color: var(--color-text-muted);
  }
  .console-diag-grid span {
    color: var(--color-text);
    font-weight: bold;
  }

  /* Console Window Styling */
  .console-window {
    background: #08080a;
    border: 1px solid var(--color-border);
    border-radius: var(--rounded-box);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    font-family: var(--font-mono);
    overflow: hidden;
  }
  .console-header {
    background: #0d0d10;
    border-bottom: 1px solid var(--color-border);
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .console-dots {
    display: flex;
    gap: 5px;
  }
  .console-dots span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .console-tab-name {
    font-size: 10px;
    color: var(--color-text-muted);
    font-weight: bold;
    letter-spacing: 0.05em;
  }
  .console-body {
    padding: 12px 14px;
    font-size: 11px;
    line-height: 1.5;
    height: 380px;
    overflow-y: scroll;
    box-sizing: border-box;
    scrollbar-width: thin;
    scrollbar-color: var(--color-border) transparent;
  }
  .console-body::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .console-body::-webkit-scrollbar-track {
    background: transparent;
  }
  .console-body::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
  }
  .console-body::-webkit-scrollbar-thumb:hover {
    background: var(--color-text-muted);
  }

  .console-empty {
    color: var(--color-text-muted);
    font-style: italic;
    padding: 16px 0;
  }
  .console-marker {
    color: var(--color-text-muted);
    font-weight: bold;
    margin-right: 4px;
  }
  .console-line {
    padding: 4px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.02);
    color: var(--color-text-muted);
  }
  .console-line:last-child {
    border-bottom: none;
  }
  .console-meta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
  }
  .console-time {
    color: var(--color-text-muted);
  }
  .console-level {
    font-weight: bold;
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .console-line.error .console-level {
    color: #e06c75;
  }
  .console-line.warn .console-level {
    color: #e5c07b;
  }
  .console-src {
    color: var(--color-text-muted);
    font-weight: bold;
  }
  .console-msg {
    color: var(--color-text);
    word-break: break-all;
  }
  .console-line.error .console-msg {
    color: #e06c75;
  }
  .console-data {
    margin: 4px 0 0 16px;
    padding: 6px;
    background: #0a0a0d;
    border: 1px solid rgba(255, 255, 255, 0.03);
    border-radius: 4px;
    color: var(--color-text-muted);
    font-size: 10px;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
