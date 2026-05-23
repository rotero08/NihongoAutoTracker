<script lang="ts">
    import { onMount } from "svelte";
    import { configStorage } from "@/lib/storage/config";
    import CustomSelect from "@/components/settings/CustomSelect.svelte";
    import { THEMES, getTheme, applyThemeToDocument } from "@/lib/ui/themes";

    interface Props {
        onStatus: (msg: string, err?: boolean) => void;
    }
    let { onStatus }: Props = $props();

    let selectedTheme = $state("nihongo");
    let selectedFont = $state("sans"); // Sans is default
    let activeTheme = $derived(getTheme(selectedTheme));

    const themeOptions = [
        { value: "nihongo", label: "Dark Amber (Default)" },
        { value: "dark", label: "Deep Ocean Dark" },
        { value: "light", label: "Nordic Light" },
        { value: "amethyst", label: "Amethyst Purple" },
    ];

    const fontOptions = [
        { value: "sans", label: "System Sans-Serif (Default)" },
        { value: "mono", label: "System Monospace" },
        { value: "serif", label: "Georgia Serif" },
    ];

    export async function load() {
        const cfg = (await configStorage.getValue()) as any;
        selectedTheme = cfg.theme ?? "nihongo";
        selectedFont = cfg.font ?? "sans";
        applyThemeToDocument(selectedTheme, selectedFont);
    }

    async function saveTheme(themeName: string) {
        selectedTheme = themeName;
        const cfg = (await configStorage.getValue()) as any;
        await configStorage.setValue({ ...cfg, theme: themeName });
        applyThemeToDocument(themeName, selectedFont);
        onStatus("✓ Theme Saved");
    }

    async function saveFont(fontName: string) {
        selectedFont = fontName;
        const cfg = (await configStorage.getValue()) as any;
        await configStorage.setValue({ ...cfg, font: fontName });
        applyThemeToDocument(selectedTheme, fontName);
        onStatus("✓ Font Saved");
    }

    async function resetAppearance() {
        selectedTheme = "nihongo";
        selectedFont = "sans";
        const cfg = (await configStorage.getValue()) as any;
        await configStorage.setValue({
            ...cfg,
            theme: "nihongo",
            font: "sans",
        });
        applyThemeToDocument("nihongo", "sans");
        onStatus("✓ Appearance Defaults Restored");
    }

    onMount(() => {
        load();
    });
</script>

<div class="tab-head">
    <h2>Appearance</h2>
</div>

<p class="hint">
    Customize the color theme and font layout of the extension Popup, Settings
    page, and video tracking overlays.
</p>

<div style="display: flex; flex-direction: column; gap: 20px;">
    <CustomSelect
        options={themeOptions}
        value={selectedTheme}
        onChange={saveTheme}
        label="Select Color Theme"
    />

    <CustomSelect
        options={fontOptions}
        value={selectedFont}
        onChange={saveFont}
        label="Select Font Family"
    />
</div>

<div class="sub-head"><h3>Preview</h3></div>
<div
    class="preview-card"
    style="background: var(--surf); border: 1px solid var(--bdr); border-radius: {activeTheme.borderRadius}px; padding: 16px; margin-top: 10px; display: flex; flex-direction: column; gap: 12px; transition: background 0.2s, border-color 0.2s;"
>
    <div
        style="display: flex; justify-content: space-between; align-items: center;"
    >
        <span
            style="font-family: var(--font-sans); color: var(--text); font-size: 14px; font-weight: bold;"
            >Mock Title Card</span
        >
        <span
            style="font-family: var(--font-mono); color: var(--amber); font-size: 12px; font-weight: bold;"
            >Vol 1</span
        >
    </div>
    <p
        style="font-family: var(--font-sans); color: var(--muted); font-size: 12px; margin: 0; line-height: 1.5;"
    >
        This is a visual preview of how components, overlays, and manual buttons
        appear using the current styling.
    </p>
    <div style="display: flex; gap: 8px;">
        <button
            style="background: var(--amber); color: var(--bg); border: none; font-weight: bold; font-family: var(--font-mono); font-size: 11px; padding: 6px 12px; border-radius: {activeTheme.borderRadiusSmall}px; cursor: default;"
            >Accent Action</button
        >
        <button
            style="background: transparent; color: var(--muted); border: 1px solid var(--bdr); font-family: var(--font-mono); font-size: 11px; padding: 6px 12px; border-radius: {activeTheme.borderRadiusSmall}px; cursor: default;"
            >Ghost Border</button
        >
    </div>
</div>

<div style="display:flex; gap:10px; margin-top: 24px;">
    <button id="reset-theme-btn" class="btn btn-ghost" onclick={resetAppearance}
        >Revert to Default</button
    >
</div>
