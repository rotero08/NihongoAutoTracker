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

    const DEFAULT_CUSTOM_COLORS: Record<string, string> = {
        background: "#07070e",
        surface: "#0d0d1c",
        surfaceAlt: "#10101f",
        border: "#1a2235",
        borderHover: "#222d42",
        text: "#dde4f0",
        textMuted: "#7a8ca5",
        accent: "#f0b429",
        accentHover: "#ffd060",
    };

    let selectedTheme = $state("dark-amber");
    let selectedFont = $state("sans");
    let lastActivePresetTheme = $state("dark-amber");

    // Live saved colors
    let customColors = $state<Record<string, string>>({
        ...DEFAULT_CUSTOM_COLORS,
    });
    let ttuCustomColors = $state<Record<string, string>>({
        ...DEFAULT_CUSTOM_COLORS,
    });
    let yatsuCustomColors = $state<Record<string, string>>({
        ...DEFAULT_CUSTOM_COLORS,
    });
    let manabeCustomColors = $state<Record<string, string>>({
        ...DEFAULT_CUSTOM_COLORS,
    });

    // Live unapplied change drafts (Realtime Preview targets)
    let globalColorsDraft = $state<Record<string, string>>({
        ...DEFAULT_CUSTOM_COLORS,
    });
    let ttuColorsDraft = $state<Record<string, string>>({
        ...DEFAULT_CUSTOM_COLORS,
    });
    let yatsuColorsDraft = $state<Record<string, string>>({
        ...DEFAULT_CUSTOM_COLORS,
    });
    let manabeColorsDraft = $state<Record<string, string>>({
        ...DEFAULT_CUSTOM_COLORS,
    });

    let ttuThemeOverride = $state("global");
    let yatsuThemeOverride = $state("global");
    let manabeThemeOverride = $state("global");

    const THEMES_WITH_CUSTOM = [
        ...THEME_OPTIONS,
        { value: "custom", label: "Custom Theme" },
    ];

    const readerThemeOptions = [
        { value: "global", label: "Use Global Theme" },
        ...THEMES_WITH_CUSTOM,
    ];

    let activeTheme = $derived(
        getTheme(
            selectedTheme === "custom" ? lastActivePresetTheme : selectedTheme,
        ) || { borderRadius: 6, borderRadiusSmall: 4 },
    );

    // Derived modification checkers
    const isGlobalModified = $derived(
        JSON.stringify(globalColorsDraft) !== JSON.stringify(customColors),
    );
    const isTtuModified = $derived(
        JSON.stringify(ttuColorsDraft) !== JSON.stringify(ttuCustomColors),
    );
    const isYatsuModified = $derived(
        JSON.stringify(yatsuColorsDraft) !== JSON.stringify(yatsuCustomColors),
    );
    const isManabeModified = $derived(
        JSON.stringify(manabeColorsDraft) !==
            JSON.stringify(manabeCustomColors),
    );

    function applyCustomTheme(colors: Record<string, string>) {
        const root = document.documentElement;
        root.style.setProperty("--color-background", colors.background);
        root.style.setProperty("--color-surface", colors.surface);
        root.style.setProperty(
            "--color-surface-alt",
            colors.surfaceAlt || colors.surface,
        );
        root.style.setProperty("--color-border", colors.border);
        root.style.setProperty(
            "--color-border-hover",
            colors.borderHover || colors.border,
        );
        root.style.setProperty("--color-text", colors.text);
        root.style.setProperty("--color-text-muted", colors.textMuted);
        root.style.setProperty("--color-text-dimmed", colors.textMuted);
        root.style.setProperty("--color-accent", colors.accent);
        root.style.setProperty(
            "--color-accent-hover",
            colors.accentHover || colors.accent,
        );
    }

    function clearCustomTheme() {
        const root = document.documentElement;
        root.style.removeProperty("--color-background");
        root.style.removeProperty("--color-surface");
        root.style.removeProperty("--color-surface-alt");
        root.style.removeProperty("--color-border");
        root.style.removeProperty("--color-border-hover");
        root.style.removeProperty("--color-text");
        root.style.removeProperty("--color-text-muted");
        root.style.removeProperty("--color-text-dimmed");
        root.style.removeProperty("--color-accent");
        root.style.removeProperty("--color-accent-hover");
    }

    async function saveDraftColors(
        context: "global" | "ttu" | "yatsu" | "manabe",
    ) {
        const cfg = (await configStorage.getValue()) as any;
        if (context === "global") {
            customColors = { ...globalColorsDraft };
            await configStorage.setValue({
                ...cfg,
                theme: "custom",
                customColors,
            });
            applyCustomTheme(customColors);
            onStatus(`✓ Global Custom Palette Saved`);
        } else if (context === "ttu") {
            ttuCustomColors = { ...ttuColorsDraft };
            await configStorage.setValue({ ...cfg, ttuCustomColors });
            onStatus(`✓ TTU Custom Palette Saved`);
        } else if (context === "yatsu") {
            yatsuCustomColors = { ...yatsuColorsDraft };
            await configStorage.setValue({ ...cfg, yatsuCustomColors });
            onStatus(`✓ Yatsu Custom Palette Saved`);
        } else if (context === "manabe") {
            manabeCustomColors = { ...manabeColorsDraft };
            await configStorage.setValue({ ...cfg, manabeCustomColors });
            onStatus(`✓ Manabe Custom Palette Saved`);
        }
    }

    function revertGlobalDraft() {
        globalColorsDraft = { ...customColors };
    }
    function revertTtuDraft() {
        ttuColorsDraft = { ...ttuCustomColors };
    }
    function revertYatsuDraft() {
        yatsuColorsDraft = { ...yatsuCustomColors };
    }
    function revertManabeDraft() {
        manabeColorsDraft = { ...manabeCustomColors };
    }

    export async function load() {
        const cfg = (await configStorage.getValue()) as any;
        selectedTheme = cfg.theme ?? "dark-amber";
        selectedFont = cfg.font ?? "sans";
        ttuThemeOverride = cfg.ttuThemeOverride ?? "global";
        yatsuThemeOverride = cfg.yatsuThemeOverride ?? "global";
        manabeThemeOverride = cfg.manabeThemeOverride ?? "global";

        if (selectedTheme !== "custom") {
            lastActivePresetTheme = selectedTheme;
        }

        if (cfg.customColors) {
            customColors = { ...DEFAULT_CUSTOM_COLORS, ...cfg.customColors };
        }
        if (cfg.ttuCustomColors) {
            ttuCustomColors = {
                ...DEFAULT_CUSTOM_COLORS,
                ...cfg.ttuCustomColors,
            };
        }
        if (cfg.yatsuCustomColors) {
            yatsuCustomColors = {
                ...DEFAULT_CUSTOM_COLORS,
                ...cfg.yatsuCustomColors,
            };
        }
        if (cfg.manabeCustomColors) {
            manabeCustomColors = {
                ...DEFAULT_CUSTOM_COLORS,
                ...cfg.manabeCustomColors,
            };
        }

        // Initialize draft copies to avoid disrupting active theme values on edit
        globalColorsDraft = { ...customColors };
        ttuColorsDraft = { ...ttuCustomColors };
        yatsuColorsDraft = { ...yatsuCustomColors };
        manabeColorsDraft = { ...manabeCustomColors };

        if (selectedTheme === "custom") {
            applyThemeToDocument("dark-amber", selectedFont);
            applyCustomTheme(customColors);
        } else {
            clearCustomTheme();
            applyThemeToDocument(selectedTheme, selectedFont);
        }
    }

    async function saveTheme(themeName: string) {
        selectedTheme = themeName;
        if (themeName === "custom") {
            // Sandboxed flow: do not apply theme, let the last selected theme stay active
            onStatus("Custom draft active. Save inside preview to apply.");
        } else {
            const cfg = (await configStorage.getValue()) as any;
            await configStorage.setValue({ ...cfg, theme: themeName });
            lastActivePresetTheme = themeName;
            clearCustomTheme();
            applyThemeToDocument(themeName, selectedFont);
            onStatus("✓ Theme Saved");
        }
    }

    async function saveFont(fontName: string) {
        selectedFont = fontName;
        const cfg = (await configStorage.getValue()) as any;
        await configStorage.setValue({ ...cfg, font: fontName });
        if (selectedTheme === "custom") {
            applyThemeToDocument("dark-amber", fontName);
            applyCustomTheme(customColors);
        } else {
            applyThemeToDocument(selectedTheme, fontName);
        }
        onStatus("✓ Font Saved");
    }

    async function saveReaderOverride(reader: string, themeName: string) {
        if (reader === "ttu") ttuThemeOverride = themeName;
        if (reader === "yatsu") yatsuThemeOverride = themeName;
        if (reader === "manabe") manabeThemeOverride = themeName;

        const cfg = (await configStorage.getValue()) as any;
        await configStorage.setValue({
            ...cfg,
            [`${reader}ThemeOverride`]: themeName,
        });
        onStatus(`✓ ${reader.toUpperCase()} theme override saved`);
    }

    async function resetAppearance() {
        selectedTheme = "dark-amber";
        selectedFont = "sans";
        lastActivePresetTheme = "dark-amber";
        customColors = { ...DEFAULT_CUSTOM_COLORS };
        ttuThemeOverride = "global";
        yatsuThemeOverride = "global";
        manabeThemeOverride = "global";
        ttuCustomColors = { ...DEFAULT_CUSTOM_COLORS };
        yatsuCustomColors = { ...DEFAULT_CUSTOM_COLORS };
        manabeCustomColors = { ...DEFAULT_CUSTOM_COLORS };

        globalColorsDraft = { ...DEFAULT_CUSTOM_COLORS };
        ttuColorsDraft = { ...DEFAULT_CUSTOM_COLORS };
        yatsuColorsDraft = { ...DEFAULT_CUSTOM_COLORS };
        manabeColorsDraft = { ...DEFAULT_CUSTOM_COLORS };

        const cfg = (await configStorage.getValue()) as any;
        await configStorage.setValue({
            ...cfg,
            theme: "dark-amber",
            font: "sans",
            customColors: undefined,
            ttuThemeOverride: undefined,
            yatsuThemeOverride: undefined,
            manabeThemeOverride: undefined,
            ttuCustomColors: undefined,
            yatsuCustomColors: undefined,
            manabeCustomColors: undefined,
        });
        clearCustomTheme();
        applyThemeToDocument("dark-amber", "sans");
        onStatus("✓ Appearance Defaults Restored");
    }

    onMount(() => {
        load();

        // Dynamically widen the settings page container so split panels sit separated
        const mainContainer = document.querySelector(".main") as HTMLElement;
        if (mainContainer) {
            mainContainer.style.setProperty("max-width", "1100px", "important");
        }

        return () => {
            if (mainContainer) {
                mainContainer.style.removeProperty("max-width");
            }
        };
    });
</script>

<!-- Outer Flexbox Container establishing a true split column layout -->
<div style="display: flex; gap: 32px; align-items: flex-start; width: 100%;">
    <!-- Left form column (containing configurations locked to 600px maximum width) -->
    <div
        style="width: 600px; flex-shrink: 0; display: flex; flex-direction: column; gap: 24px; min-width: 0;"
    >
        <div class="tab-head" style="margin-bottom: 0px; padding-bottom: 8px;">
            <h2>Appearance</h2>
        </div>

        <p class="hint" style="margin-top: -12px; margin-bottom: 0px;">
            Customize the color theme and font layout of the extension Popup,
            Settings page, and video tracking overlays.
        </p>

        <CustomSelect
            options={THEMES_WITH_CUSTOM}
            value={selectedTheme}
            onChange={saveTheme}
            label="Select Color Theme"
        />

        {#if selectedTheme === "custom"}
            <div
                class="custom-theme-builder"
                style="background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: 6px; padding: 14px; display: flex; flex-direction: column; gap: 8px;"
            >
                <div
                    style="font-weight: bold; font-size: 13px; color: var(--color-accent); display: flex; justify-content: space-between; align-items: center;"
                >
                    <span>Global Custom Colors</span>
                    {#if isGlobalModified}
                        <span
                            style="font-size: 10px; color: var(--color-accent); font-family: var(--font-mono);"
                            >● Unsaved Changes</span
                        >
                    {/if}
                </div>
                <p class="hint" style="margin: 0; font-size: 11.5px;">
                    Enter hex codes directly or adjust pickers. Live preview
                    shows draft changes on the right.
                </p>

                <!-- Highly comfortable intermediate 2-column grid layout -->
                <div
                    style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;"
                >
                    {#each [{ key: "background", label: "Background" }, { key: "surface", label: "Surface Panel" }, { key: "border", label: "Border Color" }, { key: "text", label: "Text Color" }, { key: "textMuted", label: "Muted Text" }, { key: "accent", label: "Accent Color" }] as colorItem}
                        <div
                            style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: rgba(0,0,0,0.1); padding: 6px 10px; border-radius: 4px; border: 1px solid var(--color-border);"
                        >
                            <span
                                style="font-size: 11px; font-weight: bold; color: var(--color-text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 95px;"
                                >{colorItem.label}</span
                            >
                            <div
                                style="display: flex; align-items: center; gap: 6px;"
                            >
                                <div
                                    style="width: 16px; height: 16px; border-radius: 3px; border: 1px solid var(--color-border); background: {globalColorsDraft[
                                        colorItem.key
                                    ]}; cursor: pointer; position: relative;"
                                >
                                    <input
                                        type="color"
                                        bind:value={
                                            globalColorsDraft[colorItem.key]
                                        }
                                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; padding: 0; border: none;"
                                    />
                                </div>
                                <input
                                    type="text"
                                    class="input"
                                    style="width: 76px; padding: 4px 6px; font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; text-align: center;"
                                    bind:value={
                                        globalColorsDraft[colorItem.key]
                                    }
                                />
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <CustomSelect
            options={FONT_OPTIONS}
            value={selectedFont}
            onChange={saveFont}
            label="Select Font Family"
        />

        <div class="sub-head"><h3>Reader Site Overrides</h3></div>

        <div
            style="display: flex; flex-direction: column; gap: 12px; background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: 6px; padding: 14px;"
        >
            <!-- TTU Reader Override -->
            <div
                style="display: flex; flex-direction: column; gap: 4px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border);"
            >
                <div
                    style="display: flex; justify-content: space-between; align-items: center; gap: 16px;"
                >
                    <div style="display: flex; flex-direction: column;">
                        <span
                            style="font-weight: 600; font-size: 12.5px; color: var(--color-text);"
                            >TTU Reader</span
                        >
                        <span class="hint" style="margin: 0; font-size: 11px;"
                            >reader.ttsu.app</span
                        >
                    </div>
                    <div style="width: 200px;">
                        <CustomSelect
                            options={readerThemeOptions}
                            value={ttuThemeOverride}
                            onChange={(v) => saveReaderOverride("ttu", v)}
                            label="Override Theme"
                            compact={false}
                        />
                    </div>
                </div>
                {#if ttuThemeOverride === "custom"}
                    <div
                        style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px; padding: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; border: 1px solid var(--color-border);"
                    >
                        <div
                            style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;"
                        >
                            <span
                                style="font-size: 10px; font-weight: bold; color: var(--color-accent);"
                                >TTU Color Palette</span
                            >
                            {#if isTtuModified}
                                <span
                                    style="font-size: 9px; color: var(--color-accent); font-family: var(--font-mono);"
                                    >● Unsaved</span
                                >
                            {/if}
                        </div>

                        <!-- Beautiful cohesive 2-column grid matching Global theme layout perfectly -->
                        <div
                            style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px;"
                        >
                            {#each [{ key: "background", label: "Background" }, { key: "surface", label: "Surface" }, { key: "border", label: "Border" }, { key: "text", label: "Text" }, { key: "textMuted", label: "Muted" }, { key: "accent", label: "Accent" }] as colorItem}
                                <div
                                    style="display: flex; align-items: center; justify-content: space-between; gap: 6px; background: rgba(0,0,0,0.15); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border);"
                                >
                                    <span
                                        style="font-size: 10.5px; font-weight: bold; color: var(--color-text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 80px;"
                                        >{colorItem.label}</span
                                    >
                                    <div
                                        style="display: flex; align-items: center; gap: 4px;"
                                    >
                                        <div
                                            style="width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--color-border); background: {ttuColorsDraft[
                                                colorItem.key
                                            ]}; position: relative; flex-shrink: 0;"
                                        >
                                            <input
                                                type="color"
                                                bind:value={
                                                    ttuColorsDraft[
                                                        colorItem.key
                                                    ]
                                                }
                                                style="position: absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer;"
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            class="input"
                                            style="width: 70px; padding: 2px 4px; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; text-align: center;"
                                            bind:value={
                                                ttuColorsDraft[colorItem.key]
                                            }
                                        />
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Yatsu Reader Override -->
            <div
                style="display: flex; flex-direction: column; gap: 4px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border);"
            >
                <div
                    style="display: flex; justify-content: space-between; align-items: center; gap: 16px;"
                >
                    <div style="display: flex; flex-direction: column;">
                        <span
                            style="font-weight: 600; font-size: 12.5px; color: var(--color-text);"
                            >Yatsu Reader</span
                        >
                        <span class="hint" style="margin: 0; font-size: 11px;"
                            >app.yatsu.moe</span
                        >
                    </div>
                    <div style="width: 200px;">
                        <CustomSelect
                            options={readerThemeOptions}
                            value={yatsuThemeOverride}
                            onChange={(v) => saveReaderOverride("yatsu", v)}
                            label="Override Theme"
                            compact={false}
                        />
                    </div>
                </div>
                {#if yatsuThemeOverride === "custom"}
                    <div
                        style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px; padding: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; border: 1px solid var(--color-border);"
                    >
                        <div
                            style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;"
                        >
                            <span
                                style="font-size: 10px; font-weight: bold; color: var(--color-accent);"
                                >Yatsu Color Palette</span
                            >
                            {#if isYatsuModified}
                                <span
                                    style="font-size: 9px; color: var(--color-accent); font-family: var(--font-mono);"
                                    >● Unsaved</span
                                >
                            {/if}
                        </div>

                        <!-- Beautiful cohesive 2-column grid matching Global theme layout perfectly -->
                        <div
                            style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px;"
                        >
                            {#each [{ key: "background", label: "Background" }, { key: "surface", label: "Surface" }, { key: "border", label: "Border" }, { key: "text", label: "Text" }, { key: "textMuted", label: "Muted" }, { key: "accent", label: "Accent" }] as colorItem}
                                <div
                                    style="display: flex; align-items: center; justify-content: space-between; gap: 6px; background: rgba(0,0,0,0.15); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border);"
                                >
                                    <span
                                        style="font-size: 10.5px; font-weight: bold; color: var(--color-text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 80px;"
                                        >{colorItem.label}</span
                                    >
                                    <div
                                        style="display: flex; align-items: center; gap: 4px;"
                                    >
                                        <div
                                            style="width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--color-border); background: {yatsuColorsDraft[
                                                colorItem.key
                                            ]}; position: relative; flex-shrink: 0;"
                                        >
                                            <input
                                                type="color"
                                                bind:value={
                                                    yatsuColorsDraft[
                                                        colorItem.key
                                                    ]
                                                }
                                                style="position: absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer;"
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            class="input"
                                            style="width: 70px; padding: 2px 4px; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; text-align: center;"
                                            bind:value={
                                                yatsuColorsDraft[colorItem.key]
                                            }
                                        />
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Manabe Reader Override -->
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <div
                    style="display: flex; justify-content: space-between; align-items: center; gap: 16px;"
                >
                    <div style="display: flex; flex-direction: column;">
                        <span
                            style="font-weight: 600; font-size: 12.5px; color: var(--color-text);"
                            >Manabe Reader</span
                        >
                        <span class="hint" style="margin: 0; font-size: 11px;"
                            >manga.manabe.es</span
                        >
                    </div>
                    <div style="width: 200px;">
                        <CustomSelect
                            options={readerThemeOptions}
                            value={manabeThemeOverride}
                            onChange={(v) => saveReaderOverride("manabe", v)}
                            label="Override Theme"
                            compact={false}
                        />
                    </div>
                </div>
                {#if manabeThemeOverride === "custom"}
                    <div
                        style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px; padding: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; border: 1px solid var(--color-border);"
                    >
                        <div
                            style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;"
                        >
                            <span
                                style="font-size: 10px; font-weight: bold; color: var(--color-accent);"
                                >Manabe Color Palette</span
                            >
                            {#if isManabeModified}
                                <span
                                    style="font-size: 9px; color: var(--color-accent); font-family: var(--font-mono);"
                                    >● Unsaved</span
                                >
                            {/if}
                        </div>

                        <!-- Beautiful cohesive 2-column grid matching Global theme layout perfectly -->
                        <div
                            style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px;"
                        >
                            {#each [{ key: "background", label: "Background" }, { key: "surface", label: "Surface" }, { key: "border", label: "Border" }, { key: "text", label: "Text" }, { key: "textMuted", label: "Muted" }, { key: "accent", label: "Accent" }] as colorItem}
                                <div
                                    style="display: flex; align-items: center; justify-content: space-between; gap: 6px; background: rgba(0,0,0,0.15); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border);"
                                >
                                    <span
                                        style="font-size: 10.5px; font-weight: bold; color: var(--color-text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 80px;"
                                        >{colorItem.label}</span
                                    >
                                    <div
                                        style="display: flex; align-items: center; gap: 4px;"
                                    >
                                        <div
                                            style="width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--color-border); background: {manabeColorsDraft[
                                                colorItem.key
                                            ]}; position: relative; flex-shrink: 0;"
                                        >
                                            <input
                                                type="color"
                                                bind:value={
                                                    manabeColorsDraft[
                                                        colorItem.key
                                                    ]
                                                }
                                                style="position: absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer;"
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            class="input"
                                            style="width: 70px; padding: 2px 4px; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; text-align: center;"
                                            bind:value={
                                                manabeColorsDraft[colorItem.key]
                                            }
                                        />
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Right column (True separate Preview Column positioned completely to the side of all parameters - centered) -->
    {#if selectedTheme === "custom" || ttuThemeOverride === "custom" || yatsuThemeOverride === "custom" || manabeThemeOverride === "custom"}
        <div
            style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 20px; position: sticky; top: 16px; align-self: flex-start; margin-top: 36px;"
        >
            <!-- Global Custom Theme Mock NAT Popup Preview -->
            {#if selectedTheme === "custom"}
                <div
                    style="display: flex; flex-direction: column; gap: 10px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; padding: 14px; width: 340px;"
                >
                    <div
                        style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: var(--color-text-muted); letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center;"
                    >
                        <span>NAT POPUP PREVIEW</span>
                        {#if isGlobalModified}
                            <span
                                style="font-size: 9px; color: var(--color-accent); font-family: var(--font-mono); font-weight: normal;"
                                >● UNSAVED</span
                            >
                        {/if}
                    </div>

                    <!-- Mini Mock Popup container styled with globalColorsDraft -->
                    <div
                        style="background: {globalColorsDraft.background}; border: 1px solid {globalColorsDraft.border}; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.4); text-align: left; font-family: var(--font-mono); line-height: 1.35; overflow: hidden; width: 100%;"
                    >
                        <!-- Header mockup -->
                        <div
                            style="display: flex; justify-content: space-between; align-items: center; color: {globalColorsDraft.textMuted};"
                        >
                            <div
                                style="display: flex; align-items: center; gap: 6px;"
                            >
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke={globalColorsDraft.accent}
                                    stroke-width="2.2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    style="display: block;"
                                >
                                    <circle cx="12" cy="12" r="10" />
                                    <path
                                        d="M12 18a6 6 0 1 0 0-12v12z"
                                        fill={globalColorsDraft.accent}
                                    />
                                </svg>
                                <span
                                    style="font-size: 9.5px; font-weight: bold; color: {globalColorsDraft.text};"
                                    >NihongoAutoTracker</span
                                >
                                <span
                                    style="font-size: 7.5px; font-weight: bold; color: {globalColorsDraft.accent}; border: 1px solid color-mix(in srgb, {globalColorsDraft.accent} 25%, transparent); background: color-mix(in srgb, {globalColorsDraft.accent} 7%, transparent); padding: 0.5px 3px; border-radius: 3px; text-transform: uppercase;"
                                    >API KEY ✓</span
                                >
                            </div>
                            <div
                                style="display: flex; gap: 4px; font-size: 10px;"
                            >
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    ><circle cx="12" cy="12" r="10" /><path
                                        d="M12 18a6 6 0 1 0 0-12v12z"
                                        fill="currentColor"
                                    /></svg
                                >
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    ><circle cx="12" cy="12" r="3" /><path
                                        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                                    /></svg
                                >
                            </div>
                        </div>
                        <div
                            style="height: 1px; background: {globalColorsDraft.border}; margin: 2px 0;"
                        ></div>

                        <!-- Queue Control Row mockup -->
                        <div
                            style="display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; font-weight: bold;"
                        >
                            <div
                                style="display: flex; align-items: center; gap: 4px;"
                            >
                                <span
                                    style="color: {globalColorsDraft.textMuted}; letter-spacing: 0.05em;"
                                    >QUEUE</span
                                >
                                <span
                                    style="background: color-mix(in srgb, {globalColorsDraft.accent} 10%, transparent); color: {globalColorsDraft.accent}; border: 1px solid color-mix(in srgb, {globalColorsDraft.accent} 22%, transparent); border-radius: 6px; padding: 0.5px 3.5px;"
                                    >5</span
                                >
                            </div>
                            <div style="display: flex; gap: 4px;">
                                <button
                                    style="background: {globalColorsDraft.accent}; color: {globalColorsDraft.background}; border: none; font-size: 7.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2px; cursor: default;"
                                    >Send All</button
                                >
                                <button
                                    style="background: transparent; color: {globalColorsDraft.textMuted}; border: 1px solid {globalColorsDraft.border}; font-size: 7.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2px; cursor: default;"
                                    >Clear</button
                                >
                            </div>
                        </div>

                        <!-- Tabs mockup -->
                        <div style="display: flex; gap: 4px;">
                            <span
                                style="font-size: 8.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2.5px; background: color-mix(in srgb, {globalColorsDraft.accent} 10%, transparent); color: {globalColorsDraft.accent}; border: 1px solid color-mix(in srgb, {globalColorsDraft.accent} 30%, transparent);"
                                >All</span
                            >
                            <span
                                style="font-size: 8.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2.5px; border: 1px solid {globalColorsDraft.border}; color: {globalColorsDraft.textMuted};"
                                >Video</span
                            >
                            <span
                                style="font-size: 8.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2.5px; border: 1px solid {globalColorsDraft.border}; color: {globalColorsDraft.textMuted};"
                                >Reading</span
                            >
                        </div>

                        <!-- Queue Item mockup -->
                        <div
                            style="background: {globalColorsDraft.surface}; border: 1px solid {globalColorsDraft.border}; border-radius: 4px; padding: 8px; display: flex; flex-direction: column; gap: 4px;"
                        >
                            <div
                                style="display: flex; justify-content: space-between; align-items: center;"
                            >
                                <span
                                    style="font-size: 10px; font-weight: bold; color: {globalColorsDraft.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 140px;"
                                    >転生したらスライムだった件</span
                                >
                                <div
                                    style="display: flex; gap: 4px; font-size: 9px; color: {globalColorsDraft.textMuted};"
                                >
                                    <span
                                        style="color: var(--color-success); font-weight: bold;"
                                        >✓</span
                                    >
                                    <span>×</span>
                                </div>
                            </div>
                            <div
                                style="font-size: 8.5px; color: {globalColorsDraft.textMuted};"
                            >
                                <strong
                                    style="color: {globalColorsDraft.accent};"
                                    >18500</strong
                                >
                                chars •
                                <strong style="color: {globalColorsDraft.text};"
                                    >90</strong
                                >
                                min •
                                <strong
                                    style="color: {globalColorsDraft.accent};"
                                    >3</strong
                                > vol • TTU Reader
                            </div>
                            <div
                                style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;"
                            >
                                <span
                                    style="font-size: 8px; color: {globalColorsDraft.textMuted}; display: flex; align-items: center; gap: 3px;"
                                >
                                    22/05/2026, 08:09 pm
                                    <svg
                                        width="10"
                                        height="10"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><rect
                                            x="3"
                                            y="4"
                                            width="18"
                                            height="18"
                                            rx="2"
                                            ry="2"
                                        /><line
                                            x1="16"
                                            y1="2"
                                            x2="16"
                                            y2="6"
                                        /><line
                                            x1="8"
                                            y1="2"
                                            x2="8"
                                            y2="6"
                                        /><line
                                            x1="3"
                                            y1="10"
                                            x2="21"
                                            y2="10"
                                        /></svg
                                    >
                                </span>
                                <button
                                    style="background: color-mix(in srgb, {globalColorsDraft.accent} 10%, transparent); color: {globalColorsDraft.accent}; border: 1px solid color-mix(in srgb, {globalColorsDraft.accent} 22%, transparent); font-size: 7.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2px; cursor: default;"
                                    >Send</button
                                >
                            </div>

                            <!-- Sessions list replica -->
                            <div
                                style="border-top: 1px solid {globalColorsDraft.border}; margin-top: 4px; padding-top: 4px;"
                            >
                                <div
                                    style="font-size: 8.5px; font-weight: bold; color: {globalColorsDraft.textMuted}; margin-bottom: 2px;"
                                >
                                    ▼ Sessions (3)
                                </div>
                                <div
                                    style="display: flex; flex-direction: column; gap: 2px; font-size: 8px; color: {globalColorsDraft.textMuted};"
                                >
                                    <div
                                        style="display: flex; justify-content: space-between;"
                                    >
                                        <span
                                            >• <span
                                                style="color: color-mix(in srgb, {globalColorsDraft.accent} 60%, transparent); font-weight: bold;"
                                                >S1</span
                                            >
                                            <strong
                                                style="color: {globalColorsDraft.accent};"
                                                >8200</strong
                                            >
                                            chars •
                                            <strong
                                                style="color: {globalColorsDraft.text};"
                                                >40</strong
                                            > min</span
                                        >
                                        <span
                                            style="display: flex; align-items: center; gap: 3px;"
                                        >
                                            22/05
                                            <svg
                                                width="10"
                                                height="10"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                ><rect
                                                    x="3"
                                                    y="4"
                                                    width="18"
                                                    height="18"
                                                    rx="2"
                                                    ry="2"
                                                /><line
                                                    x1="16"
                                                    y1="2"
                                                    x2="16"
                                                    y2="6"
                                                /><line
                                                    x1="8"
                                                    y1="2"
                                                    x2="8"
                                                    y2="6"
                                                /><line
                                                    x1="3"
                                                    y1="10"
                                                    x2="21"
                                                    y2="10"
                                                /></svg
                                            >
                                            <span
                                                style="color: var(--color-error);"
                                                >×</span
                                            >
                                        </span>
                                    </div>
                                    <div
                                        style="display: flex; justify-content: space-between;"
                                    >
                                        <span
                                            >• <span
                                                style="color: color-mix(in srgb, {globalColorsDraft.accent} 60%, transparent); font-weight: bold;"
                                                >S2</span
                                            >
                                            <strong
                                                style="color: {globalColorsDraft.accent};"
                                                >4100</strong
                                            >
                                            chars •
                                            <strong
                                                style="color: {globalColorsDraft.text};"
                                                >30</strong
                                            > min</span
                                        >
                                        <span
                                            style="display: flex; align-items: center; gap: 3px;"
                                        >
                                            22/05
                                            <svg
                                                width="10"
                                                height="10"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                ><rect
                                                    x="3"
                                                    y="4"
                                                    width="18"
                                                    height="18"
                                                    rx="2"
                                                    ry="2"
                                                /><line
                                                    x1="16"
                                                    y1="2"
                                                    x2="16"
                                                    y2="6"
                                                /><line
                                                    x1="8"
                                                    y1="2"
                                                    x2="8"
                                                    y2="6"
                                                /><line
                                                    x1="3"
                                                    y1="10"
                                                    x2="21"
                                                    y2="10"
                                                /></svg
                                            >
                                            <span
                                                style="color: var(--color-error);"
                                                >×</span
                                            >
                                        </span>
                                    </div>
                                    <div
                                        style="display: flex; justify-content: space-between;"
                                    >
                                        <span
                                            >• <span
                                                style="color: color-mix(in srgb, {globalColorsDraft.accent} 60%, transparent); font-weight: bold;"
                                                >S3</span
                                            >
                                            <strong
                                                style="color: {globalColorsDraft.accent};"
                                                >6200</strong
                                            >
                                            chars •
                                            <strong
                                                style="color: {globalColorsDraft.text};"
                                                >20</strong
                                            > min</span
                                        >
                                        <span
                                            style="display: flex; align-items: center; gap: 3px;"
                                        >
                                            22/05
                                            <svg
                                                width="10"
                                                height="10"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                ><rect
                                                    x="3"
                                                    y="4"
                                                    width="18"
                                                    height="18"
                                                    rx="2"
                                                    ry="2"
                                                /><line
                                                    x1="16"
                                                    y1="2"
                                                    x2="16"
                                                    y2="6"
                                                /><line
                                                    x1="8"
                                                    y1="2"
                                                    x2="8"
                                                    y2="6"
                                                /><line
                                                    x1="3"
                                                    y1="10"
                                                    x2="21"
                                                    y2="10"
                                                /></svg
                                            >
                                            <span
                                                style="color: var(--color-error);"
                                                >×</span
                                            >
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Bottom Settings action -->
                        <button
                            style="width: 100%; background: none; color: {globalColorsDraft.textMuted}; border: 1px solid {globalColorsDraft.border}; border-radius: 4px; padding: 4px; font-size: 8.5px; font-weight: bold; cursor: default;"
                            >Open Settings</button
                        >
                    </div>

                    <!-- Actions -->
                    <div style="display: flex; gap: 6px; width: 100%;">
                        <button
                            class="btn btn-amber"
                            style="flex: 1; font-size: 10px; padding: 6px;"
                            onclick={() => saveDraftColors("global")}
                            disabled={!isGlobalModified}>Save</button
                        >
                        <button
                            class="btn btn-ghost"
                            style="font-size: 10px; padding: 6px;"
                            onclick={revertGlobalDraft}
                            disabled={!isGlobalModified}>Revert</button
                        >
                    </div>
                </div>
            {/if}

            <!-- TTU Custom Override Overlay Preview -->
            {#if ttuThemeOverride === "custom"}
                <div
                    style="display: flex; flex-direction: column; gap: 10px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; padding: 14px; width: 340px;"
                >
                    <div
                        style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: var(--color-text-muted); letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center;"
                    >
                        <span>TTU OVERLAY PREVIEW</span>
                        {#if isTtuModified}
                            <span
                                style="font-size: 9px; color: var(--color-accent); font-family: var(--font-mono); font-weight: normal;"
                                >● UNSAVED</span
                            >
                        {/if}
                    </div>

                    <!-- Mini Mock Reader Page + Floating status bar mockup styled with ttuColorsDraft -->
                    <div
                        style="background: #0f0f1d; border-radius: 6px; padding: 16px 12px; text-align: center; border: 1px solid var(--color-border); position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; width: 100%;"
                    >
                        <!-- Book lines background mockup -->
                        <div
                            style="display: flex; flex-direction: column; gap: 6px; opacity: 0.15; width: 100%; align-items: center;"
                        >
                            <div
                                style="height: 4px; background: var(--color-text); border-radius: 2px; width: 80%;"
                            ></div>
                            <div
                                style="height: 4px; background: var(--color-text); border-radius: 2px; width: 95%;"
                            ></div>
                        </div>

                        <!-- Floating Overlay mockup -->
                        <div
                            style="background: {ttuColorsDraft.surface}; border: 1px solid {ttuColorsDraft.border}; border-radius: 4px; padding: 3px 6px; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); font-family: var(--font-mono); line-height: 1; z-index: 2; align-self: center;"
                        >
                            <span
                                style="color: {ttuColorsDraft.textMuted}; font-size: 9px; cursor: default;"
                                >⠿</span
                            >
                            <span
                                style="color: {ttuColorsDraft.text}; font-size: 10px; font-weight: bold; font-variant-numeric: tabular-nums;"
                                >15:32</span
                            >
                            <span
                                style="color: {ttuColorsDraft.accent}; font-size: 10px; cursor: default;"
                                >⏸</span
                            >
                            <span
                                style="color: {ttuColorsDraft.textMuted}; font-size: 10px; cursor: default; display: flex; align-items: center; justify-content: center; width: 10px; height: 10px;"
                            >
                                <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    ><path
                                        d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"
                                    /></svg
                                >
                            </span>
                            <span
                                style="color: {ttuColorsDraft.textMuted}; font-size: 10px; cursor: default;"
                                >×</span
                            >
                        </div>

                        <!-- Progress Dashboard mockup inside reader view -->
                        <div
                            style="background: {ttuColorsDraft.background}; border: 1px solid {ttuColorsDraft.border}; border-radius: 5px; padding: 10px; display: flex; flex-direction: column; gap: 8px; width: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.4); text-align: center; font-family: var(--font-sans);"
                        >
                            <div>
                                <div
                                    style="font-size: 8px; font-weight: bold; color: {ttuColorsDraft.textMuted}; letter-spacing: 0.05em; text-transform: uppercase;"
                                >
                                    Current Session
                                </div>
                                <div
                                    style="display: flex; justify-content: space-around; margin-top: 4px; font-size: 8.5px; color: {ttuColorsDraft.textMuted};"
                                >
                                    <div>
                                        Time
                                        <div
                                            style="font-size: 12px; font-weight: bold; color: {ttuColorsDraft.text}; margin-top: 1px; font-family: var(--font-mono);"
                                        >
                                            0:00
                                        </div>
                                    </div>
                                    <div>
                                        Chars
                                        <div
                                            style="font-size: 12px; font-weight: bold; color: {ttuColorsDraft.text}; margin-top: 1px; font-family: var(--font-mono);"
                                        >
                                            0
                                        </div>
                                    </div>
                                    <div>
                                        Speed
                                        <div
                                            style="font-size: 12px; font-weight: bold; color: {ttuColorsDraft.text}; margin-top: 1px; font-family: var(--font-mono);"
                                        >
                                            0/h
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div
                                style="display: flex; justify-content: center; gap: 14px; font-size: 11px; color: {ttuColorsDraft.textMuted};"
                            >
                                <span
                                    style="cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><polygon
                                            points="5 3 19 12 5 21 5 3"
                                        /></svg
                                    >
                                </span>
                                <span
                                    style="color: {ttuColorsDraft.text}; cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><path
                                            d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"
                                        /></svg
                                    >
                                </span>
                                <span
                                    style="cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><path
                                            d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
                                        /><polyline
                                            points="17 21 17 13 7 13 7 21"
                                        /><polyline
                                            points="7 3 7 8 15 8"
                                        /></svg
                                    >
                                </span>
                                <span
                                    style="color: {ttuColorsDraft.accent}; cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><line
                                            x1="22"
                                            y1="2"
                                            x2="11"
                                            y2="13"
                                        /><polygon
                                            points="22 2 15 22 11 13 2 9 22 2"
                                        /></svg
                                    >
                                </span>
                            </div>

                            <div
                                style="background: {ttuColorsDraft.surface}; border: 1px solid {ttuColorsDraft.border}; border-left: 3px solid var(--color-success); border-radius: 4px; padding: 4px 6px; display: flex; align-items: center; justify-content: space-between; font-size: 8px; text-align: left;"
                            >
                                <div
                                    style="display: flex; align-items: center; gap: 4px; overflow: hidden;"
                                >
                                    <span
                                        style="color: var(--color-success); font-weight: bold;"
                                        >✓</span
                                    >
                                    <span
                                        style="color: var(--color-success); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;"
                                        >無職転生 ~異世界行ったら本気だす~</span
                                    >
                                </div>
                                <span
                                    style="color: {ttuColorsDraft.accent}; font-weight: bold; white-space: nowrap;"
                                    >Vol 1 <span
                                        style="color: {ttuColorsDraft.textMuted}; margin-left: 2px;"
                                        >×</span
                                    ></span
                                >
                            </div>

                            <div
                                style="border-top: 1px dashed {ttuColorsDraft.border}; padding-top: 6px;"
                            >
                                <div
                                    style="font-size: 8px; font-weight: bold; color: {ttuColorsDraft.textMuted}; letter-spacing: 0.05em; text-transform: uppercase;"
                                >
                                    Total Book Progress
                                </div>
                                <div
                                    style="display: flex; justify-content: space-around; margin-top: 4px; font-size: 8.5px; color: {ttuColorsDraft.textMuted};"
                                >
                                    <div>
                                        Total Time
                                        <div
                                            style="font-size: 10px; font-weight: bold; color: {ttuColorsDraft.accent}; margin-top: 1px;"
                                        >
                                            0m
                                        </div>
                                    </div>
                                    <div>
                                        Total Chars
                                        <div
                                            style="font-size: 10px; font-weight: bold; color: {ttuColorsDraft.accent}; margin-top: 1px;"
                                        >
                                            0
                                        </div>
                                    </div>
                                    <div>
                                        Avg Speed
                                        <div
                                            style="font-size: 10px; font-weight: bold; color: {ttuColorsDraft.accent}; margin-top: 1px;"
                                        >
                                            0/h
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Connecting launcher play trigger button, aligned directly underneath Book card to match expand deal -->
                        <div style="padding-left: 2px; margin-top: -4px;">
                            <span
                                style="color: {ttuColorsDraft.accent}; font-size: 14px; cursor: default;"
                                >▶</span
                            >
                        </div>
                    </div>

                    <!-- Actions -->
                    <div style="display: flex; gap: 6px; width: 100%;">
                        <button
                            class="btn btn-amber"
                            style="flex: 1; font-size: 10px; padding: 6px;"
                            onclick={() => saveDraftColors("ttu")}
                            disabled={!isTtuModified}>Save</button
                        >
                        <button
                            class="btn btn-ghost"
                            style="font-size: 10px; padding: 6px;"
                            onclick={revertTtuDraft}
                            disabled={!isTtuModified}>Revert</button
                        >
                    </div>
                </div>
            {/if}

            <!-- Yatsu Custom Override Overlay Preview -->
            {#if yatsuThemeOverride === "custom"}
                <div
                    style="display: flex; flex-direction: column; gap: 10px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; padding: 14px; width: 340px;"
                >
                    <div
                        style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: var(--color-text-muted); letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center;"
                    >
                        <span>YATSU OVERLAY PREVIEW</span>
                        {#if isYatsuModified}
                            <span
                                style="font-size: 9px; color: var(--color-accent); font-family: var(--font-mono); font-weight: normal;"
                                >● UNSAVED</span
                            >
                        {/if}
                    </div>

                    <!-- Mini Mock Yatsu Overlay mockup styled with yatsuColorsDraft -->
                    <div
                        style="background: #0f0f1d; border-radius: 6px; padding: 16px 12px; text-align: center; border: 1px solid var(--color-border); position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; width: 100%;"
                    >
                        <div
                            style="display: flex; flex-direction: column; gap: 6px; opacity: 0.15; width: 100%; align-items: center;"
                        >
                            <div
                                style="height: 4px; background: var(--color-text); border-radius: 2px; width: 75%;"
                            ></div>
                            <div
                                style="height: 4px; background: var(--color-text); border-radius: 2px; width: 90%;"
                            ></div>
                        </div>

                        <div
                            style="background: {yatsuColorsDraft.surface}; border: 1px solid {yatsuColorsDraft.border}; border-radius: 4px; padding: 3px 6px; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); font-family: var(--font-mono); line-height: 1; align-self: center;"
                        >
                            <span
                                style="color: {yatsuColorsDraft.textMuted}; font-size: 9px;"
                                >⠿</span
                            >
                            <span
                                style="color: {yatsuColorsDraft.text}; font-size: 10px; font-weight: bold;"
                                >08:14</span
                            >
                            <span
                                style="color: {yatsuColorsDraft.accent}; font-size: 10px;"
                                >⏸</span
                            >
                            <span
                                style="color: {yatsuColorsDraft.textMuted}; font-size: 10px; cursor: default; display: flex; align-items: center; justify-content: center; width: 10px; height: 10px;"
                            >
                                <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    ><path
                                        d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"
                                    /></svg
                                >
                            </span>
                            <span
                                style="color: {yatsuColorsDraft.textMuted}; font-size: 10px;"
                                >×</span
                            >
                        </div>

                        <!-- Progress Dashboard mockup inside reader view -->
                        <div
                            style="background: {yatsuColorsDraft.background}; border: 1px solid {yatsuColorsDraft.border}; border-radius: 5px; padding: 10px; display: flex; flex-direction: column; gap: 8px; width: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.4); text-align: center; font-family: var(--font-sans);"
                        >
                            <div>
                                <div
                                    style="font-size: 8px; font-weight: bold; color: {yatsuColorsDraft.textMuted}; letter-spacing: 0.05em; text-transform: uppercase;"
                                >
                                    Current Session
                                </div>
                                <div
                                    style="display: flex; justify-content: space-around; margin-top: 4px; font-size: 8.5px; color: {yatsuColorsDraft.textMuted};"
                                >
                                    <div>
                                        Time
                                        <div
                                            style="font-size: 10.5px; font-weight: bold; color: {yatsuColorsDraft.text}; margin-top: 1px; font-family: var(--font-mono);"
                                        >
                                            0:00
                                        </div>
                                    </div>
                                    <div>
                                        Chars
                                        <div
                                            style="font-size: 12px; font-weight: bold; color: {yatsuColorsDraft.text}; margin-top: 1px; font-family: var(--font-mono);"
                                        >
                                            0
                                        </div>
                                    </div>
                                    <div>
                                        Speed
                                        <div
                                            style="font-size: 12px; font-weight: bold; color: {yatsuColorsDraft.text}; margin-top: 1px; font-family: var(--font-mono);"
                                        >
                                            0/h
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div
                                style="display: flex; justify-content: center; gap: 14px; font-size: 11px; color: {yatsuColorsDraft.textMuted};"
                            >
                                <span
                                    style="cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><polygon
                                            points="5 3 19 12 5 21 5 3"
                                        /></svg
                                    >
                                </span>
                                <span
                                    style="color: {yatsuColorsDraft.text}; cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><path
                                            d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"
                                        /></svg
                                    >
                                </span>
                                <span
                                    style="cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><path
                                            d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
                                        /><polyline
                                            points="17 21 17 13 7 13 7 21"
                                        /><polyline
                                            points="7 3 7 8 15 8"
                                        /></svg
                                    >
                                </span>
                                <span
                                    style="color: {yatsuColorsDraft.accent}; cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><line
                                            x1="22"
                                            y1="2"
                                            x2="11"
                                            y2="13"
                                        /><polygon
                                            points="22 2 15 22 11 13 2 9 22 2"
                                        /></svg
                                    >
                                </span>
                            </div>

                            <div
                                style="background: {yatsuColorsDraft.surface}; border: 1px solid {yatsuColorsDraft.border}; border-left: 3px solid var(--color-success); border-radius: 4px; padding: 4px 6px; display: flex; align-items: center; justify-content: space-between; font-size: 8px; text-align: left;"
                            >
                                <div
                                    style="display: flex; align-items: center; gap: 4px; overflow: hidden;"
                                >
                                    <span
                                        style="color: var(--color-success); font-weight: bold;"
                                        >✓</span
                                    >
                                    <span
                                        style="color: var(--color-success); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;"
                                        >無職転生 ~異世界行ったら本気だす~</span
                                    >
                                </div>
                                <span
                                    style="color: {yatsuColorsDraft.accent}; font-weight: bold; white-space: nowrap;"
                                    >Vol 1 <span
                                        style="color: {yatsuColorsDraft.textMuted}; margin-left: 2px;"
                                        >×</span
                                    ></span
                                >
                            </div>

                            <div
                                style="border-top: 1px dashed {yatsuColorsDraft.border}; padding-top: 6px;"
                            >
                                <div
                                    style="font-size: 8px; font-weight: bold; color: {yatsuColorsDraft.textMuted}; letter-spacing: 0.05em; text-transform: uppercase;"
                                >
                                    Total Book Progress
                                </div>
                                <div
                                    style="display: flex; justify-content: space-around; margin-top: 4px; font-size: 8.5px; color: {yatsuColorsDraft.textMuted};"
                                >
                                    <div>
                                        Total Time
                                        <div
                                            style="font-size: 10px; font-weight: bold; color: {yatsuColorsDraft.accent}; margin-top: 1px;"
                                        >
                                            0m
                                        </div>
                                    </div>
                                    <div>
                                        Total Chars
                                        <div
                                            style="font-size: 10px; font-weight: bold; color: {yatsuColorsDraft.accent}; margin-top: 1px;"
                                        >
                                            0
                                        </div>
                                    </div>
                                    <div>
                                        Avg Speed
                                        <div
                                            style="font-size: 10px; font-weight: bold; color: {yatsuColorsDraft.accent}; margin-top: 1px;"
                                        >
                                            0/h
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Connecting launcher play trigger button, aligned directly underneath Book card to match expand deal -->
                        <div style="padding-left: 2px; margin-top: -4px;">
                            <span
                                style="color: {yatsuColorsDraft.accent}; font-size: 14px; cursor: default;"
                                >▶</span
                            >
                        </div>
                    </div>

                    <!-- Actions -->
                    <div style="display: flex; gap: 6px; width: 100%;">
                        <button
                            class="btn btn-amber"
                            style="flex: 1; font-size: 10px; padding: 6px;"
                            onclick={() => saveDraftColors("yatsu")}
                            disabled={!isYatsuModified}>Save</button
                        >
                        <button
                            class="btn btn-ghost"
                            style="font-size: 10px; padding: 6px;"
                            onclick={revertYatsuDraft}
                            disabled={!isYatsuModified}>Revert</button
                        >
                    </div>
                </div>
            {/if}

            <!-- Manabe Custom Override Overlay Preview -->
            {#if manabeThemeOverride === "custom"}
                <div
                    style="display: flex; flex-direction: column; gap: 10px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; padding: 14px; width: 340px;"
                >
                    <div
                        style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: var(--color-text-muted); letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center;"
                    >
                        <span>MANABE OVERLAY PREVIEW</span>
                        {#if isManabeModified}
                            <span
                                style="font-size: 9px; color: var(--color-accent); font-family: var(--font-mono); font-weight: normal;"
                                >● UNSAVED</span
                            >
                        {/if}
                    </div>

                    <!-- Mini Mock Manabe Overlay mockup styled with manabeColorsDraft -->
                    <div
                        style="background: #0f0f1d; border-radius: 6px; padding: 16px 12px; text-align: center; border: 1px solid var(--color-border); position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; width: 100%;"
                    >
                        <div
                            style="display: flex; flex-direction: column; gap: 6px; opacity: 0.15; width: 100%; align-items: center;"
                        >
                            <div
                                style="height: 4px; background: var(--color-text); border-radius: 2px; width: 85%;"
                            ></div>
                            <div
                                style="height: 4px; background: var(--color-text); border-radius: 2px; width: 70%;"
                            ></div>
                        </div>

                        <div
                            style="background: {manabeColorsDraft.surface}; border: 1px solid {manabeColorsDraft.border}; border-radius: 4px; padding: 3px 6px; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); font-family: var(--font-mono); line-height: 1; align-self: center;"
                        >
                            <span
                                style="color: {manabeColorsDraft.textMuted}; font-size: 9px;"
                                >⠿</span
                            >
                            <span
                                style="color: {manabeColorsDraft.text}; font-size: 10px; font-weight: bold;"
                                >42:01</span
                            >
                            <span
                                style="color: {manabeColorsDraft.accent}; font-size: 10px;"
                                >⏸</span
                            >
                            <span
                                style="color: {manabeColorsDraft.textMuted}; font-size: 10px; cursor: default; display: flex; align-items: center; justify-content: center; width: 10px; height: 10px;"
                            >
                                <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    ><path
                                        d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"
                                    /></svg
                                >
                            </span>
                            <span
                                style="color: {manabeColorsDraft.textMuted}; font-size: 10px;"
                                >×</span
                            >
                        </div>

                        <!-- Progress Dashboard mockup inside reader view -->
                        <div
                            style="background: {manabeColorsDraft.background}; border: 1px solid {manabeColorsDraft.border}; border-radius: 5px; padding: 10px; display: flex; flex-direction: column; gap: 8px; width: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.4); text-align: center; font-family: var(--font-sans);"
                        >
                            <div>
                                <div
                                    style="font-size: 8px; font-weight: bold; color: {manabeColorsDraft.textMuted}; letter-spacing: 0.05em; text-transform: uppercase;"
                                >
                                    Current Session
                                </div>
                                <div
                                    style="display: flex; justify-content: space-around; margin-top: 4px; font-size: 8.5px; color: {manabeColorsDraft.textMuted};"
                                >
                                    <div>
                                        Time
                                        <div
                                            style="font-size: 10.5px; font-weight: bold; color: {manabeColorsDraft.text}; margin-top: 1px; font-family: var(--font-mono);"
                                        >
                                            0:00
                                        </div>
                                    </div>
                                    <div>
                                        Chars
                                        <div
                                            style="font-size: 12px; font-weight: bold; color: {manabeColorsDraft.text}; margin-top: 1px; font-family: var(--font-mono);"
                                        >
                                            0
                                        </div>
                                    </div>
                                    <div>
                                        Speed
                                        <div
                                            style="font-size: 12px; font-weight: bold; color: {manabeColorsDraft.text}; margin-top: 1px; font-family: var(--font-mono);"
                                        >
                                            0/h
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div
                                style="display: flex; justify-content: center; gap: 14px; font-size: 11px; color: {manabeColorsDraft.textMuted};"
                            >
                                <span
                                    style="cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><polygon
                                            points="5 3 19 12 5 21 5 3"
                                        /></svg
                                    >
                                </span>
                                <span
                                    style="color: {manabeColorsDraft.text}; cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><path
                                            d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"
                                        /></svg
                                    >
                                </span>
                                <span
                                    style="cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><path
                                            d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
                                        /><polyline
                                            points="17 21 17 13 7 13 7 21"
                                        /><polyline
                                            points="7 3 7 8 15 8"
                                        /></svg
                                    >
                                </span>
                                <span
                                    style="color: {manabeColorsDraft.accent}; cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><line
                                            x1="22"
                                            y1="2"
                                            x2="11"
                                            y2="13"
                                        /><polygon
                                            points="22 2 15 22 11 13 2 9 22 2"
                                        /></svg
                                    >
                                </span>
                            </div>

                            <div
                                style="background: {manabeColorsDraft.surface}; border: 1px solid {manabeColorsDraft.border}; border-left: 3px solid var(--color-success); border-radius: 4px; padding: 4px 6px; display: flex; align-items: center; justify-content: space-between; font-size: 8px; text-align: left;"
                            >
                                <div
                                    style="display: flex; align-items: center; gap: 4px; overflow: hidden;"
                                >
                                    <span
                                        style="color: var(--color-success); font-weight: bold;"
                                        >✓</span
                                    >
                                    <span
                                        style="color: var(--color-success); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;"
                                        >無職転生 ~異世界行ったら本気だす~</span
                                    >
                                </div>
                                <span
                                    style="color: {manabeColorsDraft.accent}; font-weight: bold; white-space: nowrap;"
                                    >Vol 1 <span
                                        style="color: {manabeColorsDraft.textMuted}; margin-left: 2px;"
                                        >×</span
                                    ></span
                                >
                            </div>

                            <div
                                style="border-top: 1px dashed {manabeColorsDraft.border}; padding-top: 6px;"
                            >
                                <div
                                    style="font-size: 8px; font-weight: bold; color: {manabeColorsDraft.textMuted}; letter-spacing: 0.05em; text-transform: uppercase;"
                                >
                                    Total Book Progress
                                </div>
                                <div
                                    style="display: flex; justify-content: space-around; margin-top: 4px; font-size: 8.5px; color: {manabeColorsDraft.textMuted};"
                                >
                                    <div>
                                        Total Time
                                        <div
                                            style="font-size: 10px; font-weight: bold; color: {manabeColorsDraft.accent}; margin-top: 1px;"
                                        >
                                            0m
                                        </div>
                                    </div>
                                    <div>
                                        Total Chars
                                        <div
                                            style="font-size: 10px; font-weight: bold; color: {manabeColorsDraft.accent}; margin-top: 1px;"
                                        >
                                            0
                                        </div>
                                    </div>
                                    <div>
                                        Avg Speed
                                        <div
                                            style="font-size: 10px; font-weight: bold; color: {manabeColorsDraft.accent}; margin-top: 1px;"
                                        >
                                            0/h
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Floating play trigger button -->
                        <div style="padding-left: 2px; margin-top: -4px;">
                            <span
                                style="color: {manabeColorsDraft.accent}; font-size: 14px; cursor: default;"
                                >▶</span
                            >
                        </div>
                    </div>

                    <!-- Actions -->
                    <div style="display: flex; gap: 6px; width: 100%;">
                        <button
                            class="btn btn-amber"
                            style="flex: 1; font-size: 10px; padding: 6px;"
                            onclick={() => saveDraftColors("manabe")}
                            disabled={!isManabeModified}>Save</button
                        >
                        <button
                            class="btn btn-ghost"
                            style="font-size: 10px; padding: 6px;"
                            onclick={revertManabeDraft}
                            disabled={!isManabeModified}>Revert</button
                        >
                    </div>
                </div>
            {/if}
        </div>
    {/if}
</div>

<div style="display:flex; gap:10px; margin-top: 24px;">
    <button id="reset-theme-btn" class="btn btn-ghost" onclick={resetAppearance}
        >Revert to Default</button
    >
</div>
