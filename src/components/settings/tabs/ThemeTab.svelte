<!-- ThemeTab.svelte -->
<script lang="ts">
    import { onMount } from "svelte";
    import { configStorage } from "@/lib/storage/config";
    import CustomSelect from "@/components/settings/CustomSelect.svelte";
    import {
        getTheme,
        applyThemeToDocument,
        THEME_OPTIONS,
        FONT_OPTIONS,
    } from "@/lib/ui/themes";

    interface Props {
        onStatus: (msg: string, err?: boolean) => void;
    }
    let { onStatus }: Props = $props();

    let selectedTheme = $state("dark-amber");
    let selectedFont = $state("sans");
    let activeTheme = $derived(getTheme(selectedTheme));

    export async function load() {
        const cfg = (await configStorage.getValue()) as any;
        selectedTheme = cfg.theme ?? "dark-amber";
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
        selectedTheme = "dark-amber";
        selectedFont = "sans";
        const cfg = (await configStorage.getValue()) as any;
        await configStorage.setValue({
            ...cfg,
            theme: "dark-amber",
            font: "sans",
        });
        applyThemeToDocument("dark-amber", "sans");
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
        options={THEME_OPTIONS}
        value={selectedTheme}
        onChange={saveTheme}
        label="Select Color Theme"
    />

    <CustomSelect
        options={FONT_OPTIONS}
        value={selectedFont}
        onChange={saveFont}
        label="Select Font Family"
    />
</div>

<div class="sub-head"><h3>Preview</h3></div>
<div
    class="preview-card"
    style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: {activeTheme.borderRadius}px; padding: 16px; margin-top: 10px; display: flex; flex-direction: column; gap: 12px; transition: background 0.2s, border-color 0.2s;"
>
    <div
        style="display: flex; justify-content: space-between; align-items: center;"
    >
        <span
            style="font-family: var(--font-sans); color: var(--color-text); font-size: 14px; font-weight: bold;"
            >Mock Title Card</span
        >
        <span
            style="font-family: var(--font-mono); color: var(--color-accent); font-size: 12px; font-weight: bold;"
            >Vol 1</span
        >
    </div>
    <p
        style="font-family: var(--font-sans); color: var(--color-text-muted); font-size: 12px; margin: 0; line-height: 1.5;"
    >
        This is a visual preview of how components, overlays, and manual buttons
        appear using the current styling.
    </p>
    <div style="display: flex; gap: 8px;">
        <button
            style="background: var(--color-accent); color: var(--color-background); border: none; font-weight: bold; font-family: var(--font-mono); font-size: 11px; padding: 6px 12px; border-radius: {activeTheme.borderRadiusSmall}px; cursor: default;"
            >Accent Action</button
        >
        <button
            style="background: transparent; color: var(--color-text-muted); border: 1px solid var(--color-border); font-family: var(--font-mono); font-size: 11px; padding: 6px 12px; border-radius: {activeTheme.borderRadiusSmall}px; cursor: default;"
            >Ghost Border</button
        >
    </div>
</div>

<div style="display:flex; gap:10px; margin-top: 24px;">
    <button id="reset-theme-btn" class="btn btn-ghost" onclick={resetAppearance}
        >Revert to Default</button
    >
</div>
