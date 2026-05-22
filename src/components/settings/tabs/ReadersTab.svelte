<!--
  ── ReadersTab.svelte ────────────────────────────────────────────────────────
  Reader integration settings: per-site toggles, regex rules, global options.
  Matches the original settings/index.html #tab-readers section exactly.
-->
<script lang="ts">
  import { configStorage } from '@/lib/storage/config';
  import { DEFAULT_TITLE_REGEXES } from '@/lib/constants';

  interface Props { onStatus: (msg: string, err?: boolean) => void; }
  let { onStatus }: Props = $props();

  let readerAutoSave = $state(true);
  let readerDirectSend = $state(false);
  let ttuEnabled = $state(true);
  let yatsuEnabled = $state(true);
  let manabeEnabled = $state(true);
  let regexes: Array<{ desc: string; re: string }> = $state([]);
  let newDesc = $state('');
  let newRe = $state('');
  let regexOpen = $state(false);

  export async function load() {
    const cfg = await configStorage.getValue() as any;
    readerAutoSave = cfg.readerAutoSave ?? cfg.ttuAutoSave ?? true;
    readerDirectSend = cfg.readerDirectSend ?? cfg.ttuDirectSend ?? false;
    ttuEnabled = cfg.ttuEnabled ?? true;
    yatsuEnabled = cfg.yatsuEnabled ?? true;
    manabeEnabled = cfg.manabeEnabled ?? true;
    regexes = cfg.titleRegexes ?? [...DEFAULT_TITLE_REGEXES];
  }

  async function saveToggle(key: string, value: boolean, msg: string) {
    const cfg = await configStorage.getValue() as any;
    await configStorage.setValue({ ...cfg, [key]: value });
    onStatus(msg);
  }

  async function addRegex() {
    if (!newDesc.trim() || !newRe.trim()) return;
    try { new RegExp(newRe); } catch { onStatus('⚠ Invalid Regex', true); return; }
    const cfg = await configStorage.getValue() as any;
    const current = cfg.titleRegexes ?? [...DEFAULT_TITLE_REGEXES];
    await configStorage.setValue({ ...cfg, titleRegexes: [...current, { desc: newDesc.trim(), re: newRe.trim() }] });
    newDesc = ''; newRe = '';
    await load();
    onStatus('✓ Regex Added');
  }

  async function removeRegex(idx: number) {
    const cfg = await configStorage.getValue() as any;
    const current = [...(cfg.titleRegexes ?? [...DEFAULT_TITLE_REGEXES])];
    current.splice(idx, 1);
    await configStorage.setValue({ ...cfg, titleRegexes: current });
    await load();
  }

  async function moveRegex(idx: number, dir: number) {
    const cfg = await configStorage.getValue() as any;
    const current = [...(cfg.titleRegexes ?? [...DEFAULT_TITLE_REGEXES])];
    if (idx + dir < 0 || idx + dir >= current.length) return;
    [current[idx], current[idx + dir]] = [current[idx + dir], current[idx]];
    await configStorage.setValue({ ...cfg, titleRegexes: current });
    await load();
  }

  async function reset() {
    const cfg = await configStorage.getValue() as any;
    await configStorage.setValue({ ...cfg, readerAutoSave: true, readerDirectSend: false, ttuEnabled: true, yatsuEnabled: true, manabeEnabled: true, titleRegexes: [...DEFAULT_TITLE_REGEXES] });
    await load();
    onStatus('✓ Defaults Restored');
  }

  function getReaderChecked(id: string) {
    if (id === 'ttu') return ttuEnabled;
    if (id === 'yatsu') return yatsuEnabled;
    return manabeEnabled;
  }
  function setReaderChecked(id: string, v: boolean) {
    if (id === 'ttu') { ttuEnabled = v; saveToggle('ttuEnabled', v, v ? '✓ TTU enabled' : '✓ TTU disabled'); }
    else if (id === 'yatsu') { yatsuEnabled = v; saveToggle('yatsuEnabled', v, v ? '✓ Yatsu enabled' : '✓ Yatsu disabled'); }
    else { manabeEnabled = v; saveToggle('manabeEnabled', v, v ? '✓ Manabe enabled' : '✓ Manabe disabled'); }
  }

  load();
</script>

<div class="tab-head"><h2>Readers</h2></div>
<p class="hint">Configure tracking behaviour for supported reading applications.</p>

<!-- Global Reader Settings -->
<div class="field" style="margin-top: 16px;">
  <label class="toggle">
    <input type="checkbox" id="reader-auto-save" class="toggle-chk" bind:checked={readerAutoSave} onchange={() => saveToggle('readerAutoSave', readerAutoSave, readerAutoSave ? '✓ Auto-sync enabled' : '✓ Auto-sync disabled')} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Auto-sync sessions to queue in the background
  </label>
</div>
<div class="field" style="margin-top: 16px;">
  <label class="toggle">
    <input type="checkbox" id="reader-direct-send" class="toggle-chk" bind:checked={readerDirectSend} onchange={() => saveToggle('readerDirectSend', readerDirectSend, readerDirectSend ? '✓ Direct Send enabled' : '✓ Direct Send disabled')} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    Directly send to NT if matched
  </label>
</div>

<!-- Individual Site Enable Toggles -->
<div class="sub-head"><h3>Supported Sites</h3></div>

<!-- TTU -->
<div class="reader-card">
  <div class="reader-card-left">
    <span class="reader-card-name">TTU Reader</span>
    <span class="reader-card-url">reader.ttsu.app</span>
  </div>
  <label class="toggle">
    <input type="checkbox" id="ttu-enabled" class="toggle-chk" checked={getReaderChecked('ttu')} onchange={(e) => setReaderChecked('ttu', (e.target as HTMLInputElement).checked)} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
  </label>
</div>

<!-- Yatsu -->
<div class="reader-card">
  <div class="reader-card-left">
    <span class="reader-card-name">Yatsu Reader</span>
    <span class="reader-card-url">app.yatsu.moe</span>
  </div>
  <label class="toggle">
    <input type="checkbox" id="yatsu-enabled" class="toggle-chk" checked={getReaderChecked('yatsu')} onchange={(e) => setReaderChecked('yatsu', (e.target as HTMLInputElement).checked)} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
  </label>
</div>

<!-- Manabe -->
<div class="reader-card" style="margin-bottom: 0;">
  <div class="reader-card-left">
    <span class="reader-card-name">Manabe Reader</span>
    <span class="reader-card-url">manga.manabe.es</span>
  </div>
  <label class="toggle">
    <input type="checkbox" id="manabe-enabled" class="toggle-chk" checked={getReaderChecked('manabe')} onchange={(e) => setReaderChecked('manabe', (e.target as HTMLInputElement).checked)} />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
  </label>
</div>

<!-- Regex Rules (collapsible, matching original) -->
<div class="sites-group" style="margin-top: 24px; margin-bottom: 8px;">
  <div class="sites-toggle-head" class:open={regexOpen} role="button" tabindex="0" onclick={() => regexOpen = !regexOpen} onkeydown={e => e.key === 'Enter' && (regexOpen = !regexOpen)}>
    <div class="sites-head-left">
      <span class="sites-head-label">Title/Volume Regex Rules</span>
    </div>
    <span class="sites-chevron"><svg viewBox="0 0 12 8"><polyline points="1,1 6,7 11,1"/></svg></span>
  </div>
  {#if regexOpen}
  <div class="sites-body open" id="regex-body" style="padding: 12px;">
    <p class="hint" style="margin-top:0; margin-bottom:12px;">
      <strong style="color:var(--text)">Order Matters!</strong> Rules are evaluated from top to bottom. The first regex that successfully matches will be used. Put highly specific edge cases at the top, and broad generic cases at the bottom. Use capture group 1 <code>(.*?)</code> to extract the Title, and group 2 <code>(\d+)</code> to extract the Volume.
    </p>
    <div class="site-list" id="regex-list" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
      {#each regexes as rule, i}
        <div class="regex-item">
          <div class="regex-arrows">
            <button class="arrow-btn" disabled={i === 0} onclick={() => moveRegex(i, -1)}>▲</button>
            <button class="arrow-btn" disabled={i === regexes.length - 1} onclick={() => moveRegex(i, 1)}>▼</button>
          </div>
          <div class="regex-body-inner">
            <div class="regex-row"><span class="regex-label">Desc</span><span class="regex-val">{rule.desc}</span></div>
            <div class="regex-row"><span class="regex-label">Regex</span><span class="regex-val mono">{rule.re}</span></div>
          </div>
          <button class="regex-remove" onclick={() => removeRegex(i)}>×</button>
        </div>
      {/each}
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--bdr); padding-top: 16px;">
      <input type="text" id="regex-desc-input" class="input" placeholder="Description (e.g., specific publisher or naming format)" style="padding: 8px 12px;" bind:value={newDesc} />
      <div style="display: flex; gap: 8px;">
        <input type="text" id="regex-val-input" class="input" placeholder="Regex e.g. ^(.*?)\s+(\d+)$" style="font-family: var(--mono); flex: 1; padding: 8px 12px;" bind:value={newRe} />
        <button id="regex-add" class="btn btn-amber btn-sm" style="white-space: nowrap; padding: 0 16px;" onclick={addRegex}>Add Rule</button>
      </div>
    </div>
  </div>
  {/if}
</div>

<div style="display:flex; gap:10px; margin-top: 24px;">
  <button id="reset-readers-btn" class="btn btn-ghost" onclick={reset}>Revert to Default</button>
</div>

<style>
  /* Regex items need scoped styles since they don't exist in the original settings CSS */
  .regex-item { display: flex; align-items: stretch; padding: 4px 6px; background: var(--surf2); border: 1px solid var(--bdr); border-radius: 4px; }
  .regex-arrows { display: flex; flex-direction: column; justify-content: center; padding-right: 8px; border-right: 1px dashed var(--bdr); margin-right: 8px; gap: 4px; }
  .arrow-btn { background: none; border: none; color: var(--muted); cursor: pointer; padding: 2px; font-size: 10px; }
  .arrow-btn:disabled { opacity: .2; cursor: default; }
  .regex-body-inner { flex: 1; display: flex; flex-direction: column; gap: 4px; padding: 4px 0; }
  .regex-row { display: flex; align-items: center; gap: 8px; }
  .regex-label { font-size: 10px; color: var(--muted); text-transform: uppercase; font-weight: 700; width: 45px; }
  .regex-val { font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; }
  .regex-val.mono { color: var(--amber); font-family: var(--mono); }
  .regex-remove { background: none; border: none; color: var(--red); cursor: pointer; font-size: 16px; padding: 8px; margin-left: 4px; border-left: 1px dashed var(--bdr); display: flex; align-items: center; }
</style>
