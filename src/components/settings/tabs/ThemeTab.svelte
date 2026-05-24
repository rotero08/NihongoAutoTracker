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

    interface CustomTheme {
        id: string;
        name: string;
        colors: Record<string, string>;
    }

    let selectedTheme = $state("dark-amber");
    let selectedFont = $state("sans");
    let lastActivePresetTheme = $state("dark-amber");

    // Live custom themes storage
    let customThemes = $state<CustomTheme[]>([]);

    // Live unapplied change drafts (Realtime Preview targets)
    let themeDraftColors = $state<Record<string, Record<string, string>>>({});
    let themeDraftNames = $state<Record<string, string>>({});
    let triedSavingEmptyName = $state<Record<string, boolean>>({});
    let isCollapsed = $state<Record<string, boolean>>({});

    let ttuThemeOverride = $state("global");
    let yatsuThemeOverride = $state("global");
    let manabeThemeOverride = $state("global");

    // Preview Visibility State
    let showPreviews = $state(false);

    // Inline Confirmation Modal State
    let modalOpen = $state(false);
    let modalTitle = $state("");
    let modalMsg = $state("");
    let modalResolve = $state<((value: boolean) => void) | null>(null);

    function isCustomThemeId(id: string): boolean {
        return id === "custom" || id.startsWith("custom_");
    }

    const globalThemeOptions = $derived([
        ...THEME_OPTIONS,
        ...customThemes.map((t) => ({ value: t.id, label: t.name })),
        { value: "add-custom", label: "+ Add custom theme" },
    ]);

    const readerThemeOptionsDerived = $derived([
        { value: "global", label: "Use Global Theme" },
        { value: "match-reader", label: "Match Reader Theme" },
        ...THEME_OPTIONS,
        ...customThemes.map((t) => ({ value: t.id, label: t.name })),
        { value: "add-custom", label: "+ Add custom theme" },
    ]);

    let activeTheme = $derived(
        getTheme(
            isCustomThemeId(selectedTheme)
                ? lastActivePresetTheme
                : selectedTheme,
        ) || { borderRadius: 6, borderRadiusSmall: 4 },
    );

    function lightenHexColor(hex: string, percent: number): string {
        if (!hex || !hex.startsWith("#")) return hex;
        try {
            let h = hex.trim();
            if (h.length === 4) {
                h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
            }
            let num = parseInt(h.slice(1), 16),
                amt = Math.round(2.55 * percent),
                R = (num >> 16) + amt,
                G = ((num >> 8) & 0x00ff) + amt,
                B = (num & 0x0000ff) + amt;
            R = Math.max(0, Math.min(255, R));
            G = Math.max(0, Math.min(255, G));
            B = Math.max(0, Math.min(255, B));
            return (
                "#" +
                (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)
            );
        } catch (e) {
            return hex;
        }
    }

    // Derived modification checker
    function isThemeModified(themeId: string): boolean {
        const theme = customThemes.find((t) => t.id === themeId);
        if (!theme) return false;
        const draftColors = themeDraftColors[themeId];
        const draftName = themeDraftNames[themeId];
        if (!draftColors || draftName === undefined) return false;
        return (
            draftName !== theme.name ||
            JSON.stringify(draftColors) !== JSON.stringify(theme.colors)
        );
    }

    // Direct binding focus action helper
    function autofocus(node: HTMLInputElement) {
        node.focus();
        node.select();
    }

    // Modal confirmation helper styled identical to parent component
    function askConfirmation(title: string, msg: string): Promise<boolean> {
        modalOpen = true;
        modalTitle = title;
        modalMsg = msg;
        return new Promise<boolean>((resolve) => {
            modalResolve = (val: boolean) => {
                modalOpen = false;
                resolve(val);
            };
        });
    }

    // Dynically style and decorate custom options inside dropdown with extreme right deletion cross
    function decorateDropdownOptions() {
        const options = document.querySelectorAll(
            ".select-option, .option, [class*='option']",
        );
        options.forEach((opt) => {
            const text = (opt.textContent || "").replace("✕", "").trim();
            if (!text) return;

            const isPreset = [
                "Dark Amber (Default)",
                "Charcoal Amber",
                "Deep Ocean Dark",
                "Nordic Light",
                "Amethyst Purple",
                "Use Global Theme",
                "Match Reader Theme",
                "Select Color Theme",
                "Select Font Family",
                "+ Add custom theme",
            ].some((preset) => text.startsWith(preset));

            if (
                !isPreset &&
                customThemes.some((t) => t.name && text === t.name)
            ) {
                if (!opt.querySelector(".dropdown-delete-cross")) {
                    (opt as HTMLElement).style.display = "flex";
                    (opt as HTMLElement).style.justifyContent = "space-between";
                    (opt as HTMLElement).style.alignItems = "center";
                    (opt as HTMLElement).style.width = "100%";
                    (opt as HTMLElement).style.position = "relative";

                    const cross = document.createElement("span");
                    cross.className = "dropdown-delete-cross";
                    cross.textContent = "✕";
                    cross.style.color = "var(--color-text-muted)";
                    cross.style.fontSize = "12px";
                    cross.style.fontWeight = "bold";
                    cross.style.cursor = "pointer";
                    cross.style.padding = "2px 8px";
                    cross.style.marginLeft = "auto";
                    cross.style.transition = "color 0.15s";

                    cross.onmouseenter = () =>
                        (cross.style.color = "var(--color-error, #ff4444)");
                    cross.onmouseleave = () =>
                        (cross.style.color = "var(--color-text-muted)");

                    opt.appendChild(cross);
                }
            }
        });
    }

    // Intercept navigation via sidebar clicks and inline custom dropdown deletes
    function handleGlobalClick(e: MouseEvent) {
        const target = e.target as HTMLElement;

        // 1. Intercept Sidebar tab switching if there are unsaved changes
        const navItem = target.closest(".nav-item");
        if (navItem && hasUnsavedChanges) {
            e.preventDefault();
            e.stopPropagation();

            askConfirmation(
                "Unsaved Changes",
                "You have unsaved custom theme modifications. Leaving this tab will discard all unsaved edits. Do you want to proceed?",
            ).then((confirmed) => {
                if (confirmed) {
                    customThemes.forEach((t) => {
                        if (isThemeModified(t.id)) {
                            revertThemeDraft(t.id);
                        }
                    });
                    setTimeout(() => {
                        (navItem as HTMLElement).click();
                    }, 50);
                }
            });
            return;
        }

        // 2. Intercept click on the '✕' symbol in dropdown options list to trigger Delete
        if (target.classList.contains("dropdown-delete-cross")) {
            e.preventDefault();
            e.stopPropagation();

            const optionEl = target.closest(
                ".select-option, .option, [class*='option']",
            );
            if (optionEl) {
                const text = (optionEl.textContent || "")
                    .replace("✕", "")
                    .trim();
                const matchedTheme = customThemes.find((t) => t.name === text);
                if (matchedTheme) {
                    // Force close the dropdown select container before displaying modal
                    if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                    }
                    const dropdownMenu = target.closest(
                        ".select-dropdown, .dropdown-menu, [class*='dropdown'], [class*='popover']",
                    );
                    if (dropdownMenu instanceof HTMLElement) {
                        dropdownMenu.style.display = "none";
                    }
                    document.body.click(); // Close any other custom dropdown overlays gracefully
                    confirmDeleteTheme(matchedTheme.id);
                }
            }
            return;
        }

        // Schedule decoration whenever a dropdown may have been rendered
        setTimeout(decorateDropdownOptions, 30);
    }

    // Keep draft registries in sync reactively
    $effect(() => {
        customThemes.forEach((theme) => {
            if (!themeDraftColors[theme.id]) {
                themeDraftColors[theme.id] = { ...theme.colors };
            }
            if (themeDraftNames[theme.id] === undefined) {
                themeDraftNames[theme.id] = theme.name;
            }
            // Dynamically calculate and update accentHover if accent changes
            const draftColors = themeDraftColors[theme.id];
            if (draftColors && draftColors.accent) {
                draftColors.accentHover = lightenHexColor(
                    draftColors.accent,
                    12,
                );
            }
        });
    });

    let hasUnsavedChanges = $derived(
        customThemes.some((t) => isThemeModified(t.id)),
    );

    function onBeforeUnload(e: BeforeUnloadEvent) {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = "You have unsaved changes in your custom themes.";
            return e.returnValue;
        }
    }

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

    function createNewCustomTheme(): string {
        const newId = "custom_" + Date.now(); // Unified underscore prefix matching parent theme selector config
        const newTheme: CustomTheme = {
            id: newId,
            name: "", // Start completely empty
            colors: { ...DEFAULT_CUSTOM_COLORS },
        };

        // Add local draft directly to Svelte state only - DO NOT commit to storage until clicking save
        customThemes = [...customThemes, newTheme];

        themeDraftColors[newId] = { ...newTheme.colors };
        themeDraftNames[newId] = "";
        triedSavingEmptyName[newId] = false;
        isCollapsed[newId] = false; // Expanded initially for configuration

        showPreviews = true;
        return newId;
    }

    async function saveCustomThemeChanges(themeId: string) {
        const draftName = themeDraftNames[themeId]?.trim() || "";
        if (!draftName) {
            triedSavingEmptyName[themeId] = true;
            onStatus("❌ Theme name cannot be empty.", true);
            return;
        }

        const draftColors = themeDraftColors[themeId] || {
            ...DEFAULT_CUSTOM_COLORS,
        };

        customThemes = customThemes.map((t) => {
            if (t.id === themeId) {
                return { ...t, name: draftName, colors: { ...draftColors } };
            }
            return t;
        });

        const cfg = (await configStorage.getValue()) as any;
        cfg.customThemes = $state.snapshot(customThemes);

        // Keep classic storage elements synchronized to maintain complete backward-compatibility
        if (selectedTheme === themeId) {
            cfg.theme = themeId;
            cfg.selectedThemeId = themeId;
            cfg.customColors = { ...draftColors };
        }

        if (ttuThemeOverride === themeId) {
            cfg.ttuThemeOverride = themeId;
            cfg.ttuThemeOverrideId = themeId;
            cfg.ttuCustomColors = { ...draftColors };
        }
        if (yatsuThemeOverride === themeId) {
            cfg.yatsuThemeOverride = themeId;
            cfg.yatsuThemeOverrideId = themeId;
            cfg.yatsuCustomColors = { ...draftColors };
        }
        if (manabeThemeOverride === themeId) {
            cfg.manabeThemeOverride = themeId;
            cfg.manabeThemeOverrideId = themeId;
            cfg.manabeCustomColors = { ...draftColors };
        }

        await configStorage.setValue(cfg);

        // ALWAYS apply base stylesheet attributes BEFORE custom theme variables to prevent browser wiping values
        if (selectedTheme === themeId) {
            applyThemeToDocument("dark-amber", selectedFont, draftColors);
        }

        // Collapse to minuscule header after saving
        isCollapsed[themeId] = true;
        showPreviews = false;

        onStatus(`✓ Theme "${draftName}" Saved`);
    }

    async function confirmRevertThemeDraft(themeId: string) {
        const confirmed = await askConfirmation(
            "Revert Changes",
            "Are you sure you want to discard your unsaved draft edits for this theme? The changes will be lost.",
        );
        if (confirmed) {
            revertThemeDraft(themeId);
        }
    }

    function revertThemeDraft(themeId: string) {
        const theme = customThemes.find((t) => t.id === themeId);
        if (theme) {
            themeDraftColors[themeId] = { ...theme.colors };
            themeDraftNames[themeId] = theme.name;
            triedSavingEmptyName[themeId] = false;
        }
    }

    async function confirmDeleteTheme(themeId: string) {
        const theme = customThemes.find((t) => t.id === themeId);
        const name = theme && theme.name ? theme.name : "this custom theme";
        const confirmed = await askConfirmation(
            "Delete Theme",
            `Are you sure you want to delete "${name}"? This action cannot be reverted.`,
        );
        if (confirmed) {
            await deleteCustomTheme(themeId);
        }
    }

    async function deleteCustomTheme(themeId: string) {
        const themeToDelete = customThemes.find((t) => t.id === themeId);
        const themeName =
            themeToDelete && themeToDelete.name
                ? themeToDelete.name
                : "Custom Theme";

        customThemes = customThemes.filter((t) => t.id !== themeId);

        const cfg = (await configStorage.getValue()) as any;

        if (selectedTheme === themeId) {
            selectedTheme = "dark-amber";
            cfg.theme = "dark-amber";
            cfg.selectedThemeId = undefined;
            cfg.customColors = undefined;
            clearCustomTheme();
            applyThemeToDocument("dark-amber", selectedFont);
        }
        if (ttuThemeOverride === themeId) {
            ttuThemeOverride = "global";
            cfg.ttuThemeOverride = "global";
            cfg.ttuThemeOverrideId = undefined;
            cfg.ttuCustomColors = undefined;
        }
        if (yatsuThemeOverride === themeId) {
            yatsuThemeOverride = "global";
            cfg.yatsuThemeOverride = "global";
            cfg.yatsuThemeOverrideId = undefined;
            cfg.yatsuCustomColors = undefined;
        }
        if (manabeThemeOverride === themeId) {
            manabeThemeOverride = "global";
            cfg.manabeThemeOverride = "global";
            cfg.manabeThemeOverrideId = undefined;
            cfg.manabeCustomColors = undefined;
        }

        cfg.customThemes = $state.snapshot(customThemes);
        await configStorage.setValue(cfg);

        showPreviews = false;
        onStatus(`✓ Deleted "${themeName}"`);
    }

    export async function load() {
        const cfg = (await configStorage.getValue()) as any;

        // Restore active override mappings if present
        ttuThemeOverride =
            cfg.ttuThemeOverrideId ?? cfg.ttuThemeOverride ?? "global";
        yatsuThemeOverride =
            cfg.yatsuThemeOverrideId ?? cfg.yatsuThemeOverride ?? "global";
        manabeThemeOverride =
            cfg.manabeThemeOverrideId ?? cfg.manabeThemeOverride ?? "global";
        selectedTheme = cfg.selectedThemeId ?? cfg.theme ?? "dark-amber";
        selectedFont = cfg.font ?? "sans";

        if (!isCustomThemeId(selectedTheme)) {
            lastActivePresetTheme = selectedTheme;
        }

        let loadedThemes: CustomTheme[] = [];
        if (cfg.customThemes) {
            loadedThemes = [...cfg.customThemes];
        }

        customThemes = loadedThemes;

        customThemes.forEach((theme) => {
            themeDraftColors[theme.id] = { ...theme.colors };
            themeDraftNames[theme.id] = theme.name;
            isCollapsed[theme.id] = true; // Collapse by default on start
        });

        if (isCustomThemeId(selectedTheme)) {
            const activeCustomTheme = customThemes.find(
                (t) => t.id === selectedTheme,
            );
            if (activeCustomTheme) {
                applyThemeToDocument(
                    "dark-amber",
                    selectedFont,
                    activeCustomTheme.colors,
                );
            } else {
                applyThemeToDocument("dark-amber", selectedFont);
            }
        } else {
            clearCustomTheme();
            applyThemeToDocument(selectedTheme, selectedFont);
        }
    }

    async function saveTheme(themeName: string) {
        if (themeName.startsWith("delete-")) {
            return;
        }

        // Intercept selection transitions and warn users if there are unsaved theme builder changes
        if (
            isCustomThemeId(selectedTheme) &&
            isThemeModified(selectedTheme) &&
            selectedTheme !== themeName
        ) {
            const confirmed = await askConfirmation(
                "Unsaved Changes",
                "You have unsaved custom theme modifications. Selecting another theme will discard your current edits. Do you want to proceed?",
            );
            if (!confirmed) {
                // Force select dropdown state back to currently active theme
                selectedTheme = selectedTheme;
                return;
            }
            revertThemeDraft(selectedTheme);
        }

        if (themeName === "add-custom") {
            const newId = createNewCustomTheme();
            themeName = newId;
        }
        selectedTheme = themeName;
        // Preview strictly shown if the selected theme is a custom theme AND currently uncollapsed
        showPreviews = isCustomThemeId(themeName)
            ? !isCollapsed[themeName]
            : false;

        if (isCustomThemeId(themeName)) {
            const currentTheme = customThemes.find((t) => t.id === themeName);
            const cfg = (await configStorage.getValue()) as any;
            cfg.theme = themeName;
            cfg.selectedThemeId = themeName;
            if (currentTheme) {
                cfg.customColors = { ...currentTheme.colors };
            }
            await configStorage.setValue(cfg);
            if (currentTheme) {
                applyThemeToDocument(
                    "dark-amber",
                    selectedFont,
                    currentTheme.colors,
                );
            } else {
                applyThemeToDocument("dark-amber", selectedFont);
            }
            onStatus("Custom draft active. Save inside preview to apply.");
        } else {
            const cfg = (await configStorage.getValue()) as any;
            cfg.theme = themeName;
            cfg.selectedThemeId = undefined;
            cfg.customColors = undefined;
            await configStorage.setValue(cfg);
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
        if (isCustomThemeId(selectedTheme)) {
            const activeCustomTheme = customThemes.find(
                (t) => t.id === selectedTheme,
            );
            if (activeCustomTheme) {
                applyThemeToDocument(
                    "dark-amber",
                    fontName,
                    activeCustomTheme.colors,
                );
            } else {
                applyThemeToDocument("dark-amber", fontName);
            }
        } else {
            applyThemeToDocument(selectedTheme, fontName);
        }
        onStatus("✓ Font Saved");
    }

    async function saveReaderOverride(reader: string, themeName: string) {
        if (themeName.startsWith("delete-")) {
            return;
        }

        const currentOverride =
            reader === "ttu"
                ? ttuThemeOverride
                : reader === "yatsu"
                  ? yatsuThemeOverride
                  : manabeThemeOverride;

        // Intercept reader dropdown transitions and warn if there are unsaved override draft edits
        if (
            isCustomThemeId(currentOverride) &&
            isThemeModified(currentOverride) &&
            currentOverride !== themeName
        ) {
            const confirmed = await askConfirmation(
                "Unsaved Changes",
                "You have unsaved custom theme modifications for this reader override. Selecting another option will discard your edits. Do you want to proceed?",
            );
            if (!confirmed) {
                return;
            }
            revertThemeDraft(currentOverride);
        }

        if (themeName === "add-custom") {
            const newId = createNewCustomTheme();
            themeName = newId;
        }

        if (reader === "ttu") ttuThemeOverride = themeName;
        if (reader === "yatsu") yatsuThemeOverride = themeName;
        if (reader === "manabe") manabeThemeOverride = themeName;

        // Preview strictly shown if the selected override is a custom theme AND currently uncollapsed
        showPreviews = isCustomThemeId(themeName)
            ? !isCollapsed[themeName]
            : false;

        const cfg = (await configStorage.getValue()) as any;
        if (isCustomThemeId(themeName)) {
            cfg[`${reader}ThemeOverride`] = themeName;
            cfg[`${reader}ThemeOverrideId`] = themeName;
            const currentTheme = customThemes.find((t) => t.id === themeName);
            if (currentTheme) {
                cfg[`${reader}CustomColors`] = { ...currentTheme.colors };
            }
        } else {
            cfg[`${reader}ThemeOverride`] = themeName;
            cfg[`${reader}ThemeOverrideId`] = undefined;
            cfg[`${reader}CustomColors`] = undefined;
        }

        await configStorage.setValue(cfg);
        onStatus(`✓ ${reader.toUpperCase()} theme override saved`);
    }

    async function confirmResetAppearance() {
        const confirmed = await askConfirmation(
            "Restore Defaults",
            "Are you sure you want to restore all appearance styles to factory default? Your custom themes will not be deleted.",
        );
        if (confirmed) {
            await resetAppearance();
        }
    }

    async function resetAppearance() {
        selectedTheme = "dark-amber";
        selectedFont = "sans";
        lastActivePresetTheme = "dark-amber";
        ttuThemeOverride = "global";
        yatsuThemeOverride = "global";
        manabeThemeOverride = "global";
        showPreviews = false;

        const cfg = (await configStorage.getValue()) as any;
        await configStorage.setValue({
            ...cfg,
            theme: "dark-amber",
            font: "sans",
            selectedThemeId: undefined,
            customColors: undefined,
            ttuThemeOverride: undefined,
            ttuThemeOverrideId: undefined,
            yatsuThemeOverride: undefined,
            yatsuThemeOverrideId: undefined,
            manabeThemeOverride: undefined,
            manabeThemeOverrideId: undefined,
            ttuCustomColors: undefined,
            yatsuCustomColors: undefined,
            manabeCustomColors: undefined,
        });
        clearCustomTheme();
        applyThemeToDocument("dark-amber", "sans");
        onStatus("✓ Appearance Defaults Restored");
    }

    function handleColorChange() {
        showPreviews = true;
    }

    function handleCollapse(themeId: string) {
        if (isThemeModified(themeId)) {
            askConfirmation(
                "Unsaved Changes",
                "You have unsaved changes. Collapsing will discard your current edits. Do you want to proceed?",
            ).then((confirmed) => {
                if (confirmed) {
                    revertThemeDraft(themeId);
                    isCollapsed[themeId] = true;
                    showPreviews = false;
                }
            });
        } else {
            isCollapsed[themeId] = true;
            showPreviews = false;
        }
    }

    function handleUncollapse(themeId: string) {
        isCollapsed[themeId] = false;
        showPreviews = true;
    }

    // Determine target fallback values for previews
    let activePreviewThemeId = $derived(
        isCustomThemeId(selectedTheme)
            ? selectedTheme
            : isCustomThemeId(ttuThemeOverride)
              ? ttuThemeOverride
              : isCustomThemeId(yatsuThemeOverride)
                ? yatsuThemeOverride
                : isCustomThemeId(manabeThemeOverride)
                  ? manabeThemeOverride
                  : "",
    );

    let popupThemeIdForPreview = $derived(
        isCustomThemeId(selectedTheme) ? selectedTheme : activePreviewThemeId,
    );

    let readerThemeIdForPreview = $derived(
        isCustomThemeId(ttuThemeOverride)
            ? ttuThemeOverride
            : isCustomThemeId(yatsuThemeOverride)
              ? yatsuThemeOverride
              : isCustomThemeId(manabeThemeOverride)
                ? manabeThemeOverride
                : activePreviewThemeId,
    );

    onMount(() => {
        load();
        window.addEventListener("beforeunload", onBeforeUnload);
        window.addEventListener("click", handleGlobalClick, true);

        // Dynamically widen the settings page container so split panels sit separated
        const mainContainer = document.querySelector(".main") as HTMLElement;
        if (mainContainer) {
            mainContainer.style.setProperty("max-width", "1100px", "important");
        }

        return () => {
            window.removeEventListener("beforeunload", onBeforeUnload);
            window.removeEventListener("click", handleGlobalClick, true);
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

        <div style="display: flex; flex-direction: column; gap: 6px;">
            <CustomSelect
                options={globalThemeOptions}
                value={selectedTheme}
                onChange={saveTheme}
                label="Select Color Theme"
            />
        </div>

        {#if isCustomThemeId(selectedTheme)}
            {@const themeId = selectedTheme}

            <!-- Read reactive changes directly into Svelte localized variables to trigger visual signal compiles instantly -->
            {@const activeAccentColor =
                themeDraftColors[themeId]?.accent || "var(--color-accent)"}
            {@const activeAccentHoverColor =
                themeDraftColors[themeId]?.accentHover ||
                themeDraftColors[themeId]?.accent ||
                "var(--color-accent-hover)"}
            {@const activeBgColor =
                themeDraftColors[themeId]?.background || "#09090f"}

            {#if isCollapsed[themeId]}
                <!-- Minuscule header option when custom builder is collapsed -->
                <button
                    class="btn btn-ghost"
                    style="width: 100%; padding: 8px 12px; font-size: 11.5px; display: flex; align-items: center; justify-content: space-between; background: var(--color-surface-alt); border: 1px dashed var(--color-border); border-radius: 6px;"
                    onclick={() => handleUncollapse(themeId)}
                >
                    <span style="display: flex; align-items: center; gap: 2px;">
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="var(--color-accent)"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            style="display: inline-block; margin-right: 6px;"
                        >
                            <path
                                d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                            />
                        </svg>
                        <span
                            style="font-weight: 600; color: var(--color-text);"
                            >Edit Colors: {themeDraftNames[themeId] ||
                                "Custom Theme"}</span
                        >
                    </span>
                    <span style="font-size: 10px; color: var(--color-accent);"
                        >Expand Editor ▾</span
                    >
                </button>
            {:else}
                <!-- Full dynamic customization panel -->
                <div
                    class="custom-theme-builder"
                    style="background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: 6px; padding: 14px; display: flex; flex-direction: column; gap: 10px;"
                >
                    <div
                        style="font-weight: bold; font-size: 13px; color: var(--color-accent); display: flex; justify-content: space-between; align-items: center;"
                    >
                        <span>Edit Custom Theme</span>
                        <button
                            class="btn btn-ghost btn-sm"
                            style="padding: 2px 6px; font-size: 10px;"
                            onclick={() => handleCollapse(themeId)}
                        >
                            Collapse ▴
                        </button>
                    </div>

                    <div
                        style="display: flex; flex-direction: column; gap: 4px;"
                    >
                        <span
                            style="font-size: 11px; font-weight: bold; color: var(--color-text-muted);"
                            >Theme Name</span
                        >
                        <input
                            use:autofocus
                            type="text"
                            class="input"
                            style="width: 100%; padding: 6px 8px; font-size: 12px; border: 1px solid {triedSavingEmptyName[
                                themeId
                            ] &&
                            (!themeDraftNames[themeId] ||
                                !themeDraftNames[themeId].trim())
                                ? 'var(--color-error, #ff4444)'
                                : 'var(--color-border)'}; box-shadow: {triedSavingEmptyName[
                                themeId
                            ] &&
                            (!themeDraftNames[themeId] ||
                                !themeDraftNames[themeId].trim())
                                ? '0 0 0 2px rgba(239, 68, 68, 0.2)'
                                : 'none'}"
                            bind:value={themeDraftNames[themeId]}
                            placeholder="Type theme name here..."
                            oninput={() => {
                                triedSavingEmptyName[themeId] = false;
                                showPreviews = true;
                            }}
                        />
                        {#if triedSavingEmptyName[themeId] && (!themeDraftNames[themeId] || !themeDraftNames[themeId].trim())}
                            <span
                                style="color: var(--color-error, #ff4444); font-size: 11px; font-weight: bold;"
                                >Theme name is required. Please type a name.</span
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
                                        style="width: 16px; height: 16px; border-radius: 3px; border: 1px solid var(--color-border); background: {themeDraftColors[
                                            themeId
                                        ]?.[colorItem.key] ||
                                            DEFAULT_CUSTOM_COLORS[
                                                colorItem.key
                                            ]}; cursor: pointer; position: relative;"
                                    >
                                        <input
                                            type="color"
                                            bind:value={
                                                themeDraftColors[themeId][
                                                    colorItem.key
                                                ]
                                            }
                                            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; padding: 0; border: none;"
                                            oninput={handleColorChange}
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        class="input"
                                        style="width: 76px; padding: 4px 6px; font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; text-align: center;"
                                        bind:value={
                                            themeDraftColors[themeId][
                                                colorItem.key
                                            ]
                                        }
                                        oninput={handleColorChange}
                                    />
                                </div>
                            </div>
                        {/each}
                    </div>

                    <!-- Theme actions (Save, Revert, Delete) -->
                    <div style="display: flex; gap: 6px; margin-top: 4px;">
                        <button
                            class="btn"
                            style="flex: 1; font-size: 11px; padding: 6px 10px; background: {activeAccentColor}; color: {activeBgColor}; font-weight: bold; border-radius: 4px; border: none; cursor: pointer; transition: background-color 0.15s;"
                            onclick={() => saveCustomThemeChanges(themeId)}
                            disabled={!isThemeModified(themeId)}
                            onmouseenter={(e) => {
                                e.currentTarget.style.background =
                                    activeAccentHoverColor;
                            }}
                            onmouseleave={(e) => {
                                e.currentTarget.style.background =
                                    activeAccentColor;
                            }}
                        >
                            Save Theme
                        </button>
                        <button
                            class="btn btn-ghost"
                            style="font-size: 11px; padding: 6px 10px;"
                            onclick={() => confirmRevertThemeDraft(themeId)}
                            disabled={!isThemeModified(themeId)}
                        >
                            Revert
                        </button>
                        <button
                            class="btn btn-ghost"
                            style="font-size: 11px; padding: 6px 10px; color: var(--color-error); border-color: rgba(239, 68, 68, 0.2);"
                            onclick={() => confirmDeleteTheme(themeId)}
                        >
                            Delete
                        </button>
                    </div>
                </div>
            {/if}
        {/if}

        <CustomSelect
            options={FONT_OPTIONS}
            value={selectedFont}
            onChange={saveFont}
            label="Select Font Family"
        />

        <div class="sub-head"><h3>Reader Site Overrides</h3></div>

        <p class="hint" style="margin-top: -12px; margin-bottom: 12px;">
            Customize overlay trackers strictly for individual readers:
            <br />
            • <strong>Use Global Theme:</strong> Seamlessly inherits whichever
            theme is currently selected globally in the extension.
            <br />
            • <strong>Match Reader Theme:</strong> Dynamically adapts layout
            styling to seamlessly blend with the hosting site's original colors
            and palette.
            <br />
            • <strong>Preset / Custom Themes:</strong> Restricts style rendering
            exclusively to this reader site.
        </p>

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
                            options={readerThemeOptionsDerived}
                            value={ttuThemeOverride}
                            onChange={(v) => saveReaderOverride("ttu", v)}
                            label="Override Theme"
                            compact={false}
                        />
                    </div>
                </div>
                {#if isCustomThemeId(ttuThemeOverride)}
                    {@const themeId = ttuThemeOverride}

                    <!-- Read reactive changes directly into Svelte localized variables to trigger visual signal compiles instantly -->
                    {@const activeAccentColor =
                        themeDraftColors[themeId]?.accent ||
                        "var(--color-accent)"}
                    {@const activeAccentHoverColor =
                        themeDraftColors[themeId]?.accentHover ||
                        themeDraftColors[themeId]?.accent ||
                        "var(--color-accent-hover)"}
                    {@const activeBgColor =
                        themeDraftColors[themeId]?.background || "#09090f"}

                    {#if isCollapsed[themeId]}
                        <button
                            class="btn btn-ghost"
                            style="width: 100%; padding: 4px 10px; font-size: 10.5px; display: flex; align-items: center; justify-content: space-between; margin-top: 4px; background: rgba(0,0,0,0.1); border: 1px dashed var(--color-border);"
                            onclick={() => handleUncollapse(themeId)}
                        >
                            <span
                                style="display: flex; align-items: center; gap: 2px;"
                            >
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="var(--color-accent)"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    style="display: inline-block; margin-right: 6px;"
                                >
                                    <path
                                        d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                                    />
                                </svg>
                                <span
                                    style="font-weight: 600; color: var(--color-text);"
                                    >Edit TTU Theme: {themeDraftNames[
                                        themeId
                                    ] || "Custom Theme"}</span
                                >
                            </span>
                            <span style="color: var(--color-accent);"
                                >Expand Editor ▾</span
                            >
                        </button>
                    {:else}
                        <div
                            style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px; padding: 10px; background: rgba(0,0,0,0.1); border-radius: 4px; border: 1px solid var(--color-border);"
                        >
                            <div
                                style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;"
                            >
                                <span
                                    style="font-size: 10px; font-weight: bold; color: var(--color-accent);"
                                    >Edit TTU Custom Theme</span
                                >
                                <button
                                    class="btn btn-ghost"
                                    style="padding: 1px 4px; font-size: 9px;"
                                    onclick={() => handleCollapse(themeId)}
                                >
                                    Collapse ▴
                                </button>
                            </div>

                            <div
                                style="display: flex; flex-direction: column; gap: 2px; margin-bottom: 4px;"
                            >
                                <span
                                    style="font-size: 9.5px; font-weight: bold; color: var(--color-text-muted);"
                                    >Theme Name</span
                                >
                                <input
                                    type="text"
                                    class="input"
                                    style="width: 100%; padding: 4px 6px; font-size: 11px; border: 1px solid {triedSavingEmptyName[
                                        themeId
                                    ] &&
                                    (!themeDraftNames[themeId] ||
                                        !themeDraftNames[themeId].trim())
                                        ? 'var(--color-error, #ff4444)'
                                        : 'var(--color-border)'}"
                                    bind:value={themeDraftNames[themeId]}
                                    placeholder="Theme Name"
                                    oninput={() => {
                                        triedSavingEmptyName[themeId] = false;
                                        showPreviews = true;
                                    }}
                                />
                                {#if triedSavingEmptyName[themeId] && (!themeDraftNames[themeId] || !themeDraftNames[themeId].trim())}
                                    <span
                                        style="color: var(--color-error, #ff4444); font-size: 10px; font-weight: bold;"
                                        >Name is required.</span
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
                                                style="width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--color-border); background: {themeDraftColors[
                                                    themeId
                                                ]?.[colorItem.key] ||
                                                    DEFAULT_CUSTOM_COLORS[
                                                        colorItem.key
                                                    ]}; position: relative; flex-shrink: 0;"
                                            >
                                                <input
                                                    type="color"
                                                    bind:value={
                                                        themeDraftColors[
                                                            themeId
                                                        ][colorItem.key]
                                                    }
                                                    style="position: absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer;"
                                                    oninput={handleColorChange}
                                                />
                                            </div>
                                            <input
                                                type="text"
                                                class="input"
                                                style="width: 70px; padding: 2px 4px; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; text-align: center;"
                                                bind:value={
                                                    themeDraftColors[themeId][
                                                        colorItem.key
                                                    ]
                                                }
                                                oninput={handleColorChange}
                                            />
                                        </div>
                                    </div>
                                {/each}
                            </div>

                            <!-- Theme actions (Save, Revert, Delete) -->
                            <div
                                style="display: flex; gap: 4px; margin-top: 6px;"
                            >
                                <button
                                    class="btn"
                                    style="flex: 1; font-size: 9.5px; padding: 4px 8px; background: {activeAccentColor}; color: {activeBgColor}; font-weight: bold; border-radius: 4px; border: none; cursor: pointer; transition: background-color 0.15s;"
                                    onclick={() =>
                                        saveCustomThemeChanges(themeId)}
                                    disabled={!isThemeModified(themeId)}
                                    onmouseenter={(e) => {
                                        e.currentTarget.style.background =
                                            activeAccentHoverColor;
                                    }}
                                    onmouseleave={(e) => {
                                        e.currentTarget.style.background =
                                            activeAccentColor;
                                    }}
                                >
                                    Save Theme
                                </button>
                                <button
                                    class="btn btn-ghost"
                                    style="font-size: 9.5px; padding: 4px 8px;"
                                    onclick={() =>
                                        confirmRevertThemeDraft(themeId)}
                                    disabled={!isThemeModified(themeId)}
                                >
                                    Revert
                                </button>
                                <button
                                    class="btn btn-ghost"
                                    style="font-size: 9.5px; padding: 4px 8px; color: var(--color-error); border-color: rgba(239, 68, 68, 0.2);"
                                    onclick={() => confirmDeleteTheme(themeId)}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    {/if}
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
                            options={readerThemeOptionsDerived}
                            value={yatsuThemeOverride}
                            onChange={(v) => saveReaderOverride("yatsu", v)}
                            label="Override Theme"
                            compact={false}
                        />
                    </div>
                </div>
                {#if isCustomThemeId(yatsuThemeOverride)}
                    {@const themeId = yatsuThemeOverride}

                    <!-- Read reactive changes directly into Svelte localized variables to trigger visual signal compiles instantly -->
                    {@const activeAccentColor =
                        themeDraftColors[themeId]?.accent ||
                        "var(--color-accent)"}
                    {@const activeAccentHoverColor =
                        themeDraftColors[themeId]?.accentHover ||
                        themeDraftColors[themeId]?.accent ||
                        "var(--color-accent-hover)"}
                    {@const activeBgColor =
                        themeDraftColors[themeId]?.background || "#09090f"}

                    {#if isCollapsed[themeId]}
                        <button
                            class="btn btn-ghost"
                            style="width: 100%; padding: 4px 10px; font-size: 10.5px; display: flex; align-items: center; justify-content: space-between; margin-top: 4px; background: rgba(0,0,0,0.1); border: 1px dashed var(--color-border);"
                            onclick={() => handleUncollapse(themeId)}
                        >
                            <span
                                style="display: flex; align-items: center; gap: 2px;"
                            >
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="var(--color-accent)"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    style="display: inline-block; margin-right: 6px;"
                                >
                                    <path
                                        d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                                    />
                                </svg>
                                <span
                                    style="font-weight: 600; color: var(--color-text);"
                                    >Edit Yatsu Theme: {themeDraftNames[
                                        themeId
                                    ] || "Custom Theme"}</span
                                >
                            </span>
                            <span style="color: var(--color-accent);"
                                >Expand Editor ▾</span
                            >
                        </button>
                    {:else}
                        <div
                            style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px; padding: 10px; background: rgba(0,0,0,0.1); border-radius: 4px; border: 1px solid var(--color-border);"
                        >
                            <div
                                style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;"
                            >
                                <span
                                    style="font-size: 10px; font-weight: bold; color: var(--color-accent);"
                                    >Edit Yatsu Custom Theme</span
                                >
                                <button
                                    class="btn btn-ghost"
                                    style="padding: 1px 4px; font-size: 9px;"
                                    onclick={() => handleCollapse(themeId)}
                                >
                                    Collapse ▴
                                </button>
                            </div>

                            <div
                                style="display: flex; flex-direction: column; gap: 2px; margin-bottom: 4px;"
                            >
                                <span
                                    style="font-size: 9.5px; font-weight: bold; color: var(--color-text-muted);"
                                    >Theme Name</span
                                >
                                <input
                                    type="text"
                                    class="input"
                                    style="width: 100%; padding: 4px 6px; font-size: 11px; border: 1px solid {triedSavingEmptyName[
                                        themeId
                                    ] &&
                                    (!themeDraftNames[themeId] ||
                                        !themeDraftNames[themeId].trim())
                                        ? 'var(--color-error, #ff4444)'
                                        : 'var(--color-border)'}"
                                    bind:value={themeDraftNames[themeId]}
                                    placeholder="Theme Name"
                                    oninput={() => {
                                        triedSavingEmptyName[themeId] = false;
                                        showPreviews = true;
                                    }}
                                />
                                {#if triedSavingEmptyName[themeId] && (!themeDraftNames[themeId] || !themeDraftNames[themeId].trim())}
                                    <span
                                        style="color: var(--color-error, #ff4444); font-size: 10px; font-weight: bold;"
                                        >Name is required.</span
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
                                                style="width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--color-border); background: {themeDraftColors[
                                                    themeId
                                                ]?.[colorItem.key] ||
                                                    DEFAULT_CUSTOM_COLORS[
                                                        colorItem.key
                                                    ]}; position: relative; flex-shrink: 0;"
                                            >
                                                <input
                                                    type="color"
                                                    bind:value={
                                                        themeDraftColors[
                                                            themeId
                                                        ][colorItem.key]
                                                    }
                                                    style="position: absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer;"
                                                    oninput={handleColorChange}
                                                />
                                            </div>
                                            <input
                                                type="text"
                                                class="input"
                                                style="width: 70px; padding: 2px 4px; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; text-align: center;"
                                                bind:value={
                                                    themeDraftColors[themeId][
                                                        colorItem.key
                                                    ]
                                                }
                                                oninput={handleColorChange}
                                            />
                                        </div>
                                    </div>
                                {/each}
                            </div>

                            <!-- Theme actions (Save, Revert, Delete) -->
                            <div
                                style="display: flex; gap: 4px; margin-top: 6px;"
                            >
                                <button
                                    class="btn"
                                    style="flex: 1; font-size: 9.5px; padding: 4px 8px; background: {activeAccentColor}; color: {activeBgColor}; font-weight: bold; border-radius: 4px; border: none; cursor: pointer; transition: background-color 0.15s;"
                                    onclick={() =>
                                        saveCustomThemeChanges(themeId)}
                                    disabled={!isThemeModified(themeId)}
                                    onmouseenter={(e) => {
                                        e.currentTarget.style.background =
                                            activeAccentHoverColor;
                                    }}
                                    onmouseleave={(e) => {
                                        e.currentTarget.style.background =
                                            activeAccentColor;
                                    }}
                                >
                                    Save Theme
                                </button>
                                <button
                                    class="btn btn-ghost"
                                    style="font-size: 9.5px; padding: 4px 8px;"
                                    onclick={() =>
                                        confirmRevertThemeDraft(themeId)}
                                    disabled={!isThemeModified(themeId)}
                                >
                                    Revert
                                </button>
                                <button
                                    class="btn btn-ghost"
                                    style="font-size: 9.5px; padding: 4px 8px; color: var(--color-error); border-color: rgba(239, 68, 68, 0.2);"
                                    onclick={() => confirmDeleteTheme(themeId)}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    {/if}
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
                            options={readerThemeOptionsDerived}
                            value={manabeThemeOverride}
                            onChange={(v) => saveReaderOverride("manabe", v)}
                            label="Override Theme"
                            compact={false}
                        />
                    </div>
                </div>
                {#if isCustomThemeId(manabeThemeOverride)}
                    {@const themeId = manabeThemeOverride}

                    <!-- Read reactive changes directly into Svelte localized variables to trigger visual signal compiles instantly -->
                    {@const activeAccentColor =
                        themeDraftColors[themeId]?.accent ||
                        "var(--color-accent)"}
                    {@const activeAccentHoverColor =
                        themeDraftColors[themeId]?.accentHover ||
                        themeDraftColors[themeId]?.accent ||
                        "var(--color-accent-hover)"}
                    {@const activeBgColor =
                        themeDraftColors[themeId]?.background || "#09090f"}

                    {#if isCollapsed[themeId]}
                        <button
                            class="btn btn-ghost"
                            style="width: 100%; padding: 4px 10px; font-size: 10.5px; display: flex; align-items: center; justify-content: space-between; margin-top: 4px; background: rgba(0,0,0,0.1); border: 1px dashed var(--color-border);"
                            onclick={() => handleUncollapse(themeId)}
                        >
                            <span
                                style="display: flex; align-items: center; gap: 2px;"
                            >
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="var(--color-accent)"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    style="display: inline-block; margin-right: 6px;"
                                >
                                    <path
                                        d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                                    />
                                </svg>
                                <span
                                    style="font-weight: 600; color: var(--color-text);"
                                    >Edit Manabe Theme: {themeDraftNames[
                                        themeId
                                    ] || "Custom Theme"}</span
                                >
                            </span>
                            <span style="color: var(--color-accent);"
                                >Expand Editor ▾</span
                            >
                        </button>
                    {:else}
                        <div
                            style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px; padding: 10px; background: rgba(0,0,0,0.1); border-radius: 4px; border: 1px solid var(--color-border);"
                        >
                            <div
                                style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;"
                            >
                                <span
                                    style="font-size: 10px; font-weight: bold; color: var(--color-accent);"
                                    >Edit Manabe Custom Theme</span
                                >
                                <button
                                    class="btn btn-ghost"
                                    style="padding: 1px 4px; font-size: 9px;"
                                    onclick={() => handleCollapse(themeId)}
                                >
                                    Collapse ▴
                                </button>
                            </div>

                            <div
                                style="display: flex; flex-direction: column; gap: 2px; margin-bottom: 4px;"
                            >
                                <span
                                    style="font-size: 9.5px; font-weight: bold; color: var(--color-text-muted);"
                                    >Theme Name</span
                                >
                                <input
                                    type="text"
                                    class="input"
                                    style="width: 100%; padding: 4px 6px; font-size: 11px; border: 1px solid {triedSavingEmptyName[
                                        themeId
                                    ] &&
                                    (!themeDraftNames[themeId] ||
                                        !themeDraftNames[themeId].trim())
                                        ? 'var(--color-error, #ff4444)'
                                        : 'var(--color-border)'}"
                                    bind:value={themeDraftNames[themeId]}
                                    placeholder="Theme Name"
                                    oninput={() => {
                                        triedSavingEmptyName[themeId] = false;
                                        showPreviews = true;
                                    }}
                                />
                                {#if triedSavingEmptyName[themeId] && (!themeDraftNames[themeId] || !themeDraftNames[themeId].trim())}
                                    <span
                                        style="color: var(--color-error, #ff4444); font-size: 10px; font-weight: bold;"
                                        >Name is required.</span
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
                                                style="width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--color-border); background: {themeDraftColors[
                                                    themeId
                                                ]?.[colorItem.key] ||
                                                    DEFAULT_CUSTOM_COLORS[
                                                        colorItem.key
                                                    ]}; position: relative; flex-shrink: 0;"
                                            >
                                                <input
                                                    type="color"
                                                    bind:value={
                                                        themeDraftColors[
                                                            themeId
                                                        ][colorItem.key]
                                                    }
                                                    style="position: absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer;"
                                                    oninput={handleColorChange}
                                                />
                                            </div>
                                            <input
                                                type="text"
                                                class="input"
                                                style="width: 70px; padding: 2px 4px; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; text-align: center;"
                                                bind:value={
                                                    themeDraftColors[themeId][
                                                        colorItem.key
                                                    ]
                                                }
                                                oninput={handleColorChange}
                                            />
                                        </div>
                                    </div>
                                {/each}
                            </div>

                            <!-- Theme actions (Save, Revert, Delete) -->
                            <div
                                style="display: flex; gap: 4px; margin-top: 6px;"
                            >
                                <button
                                    class="btn"
                                    style="flex: 1; font-size: 9.5px; padding: 4px 8px; background: {activeAccentColor}; color: {activeBgColor}; font-weight: bold; border-radius: 4px; border: none; cursor: pointer; transition: background-color 0.15s;"
                                    onclick={() =>
                                        saveCustomThemeChanges(themeId)}
                                    disabled={!isThemeModified(themeId)}
                                    onmouseenter={(e) => {
                                        e.currentTarget.style.background =
                                            activeAccentHoverColor;
                                    }}
                                    onmouseleave={(e) => {
                                        e.currentTarget.style.background =
                                            activeAccentColor;
                                    }}
                                >
                                    Save Theme
                                </button>
                                <button
                                    class="btn btn-ghost"
                                    style="font-size: 9.5px; padding: 4px 8px;"
                                    onclick={() =>
                                        confirmRevertThemeDraft(themeId)}
                                    disabled={!isThemeModified(themeId)}
                                >
                                    Revert
                                </button>
                                <button
                                    class="btn btn-ghost"
                                    style="font-size: 9.5px; padding: 4px 8px; color: var(--color-error); border-color: rgba(239, 68, 68, 0.2);"
                                    onclick={() => confirmDeleteTheme(themeId)}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    {/if}
                {/if}
            </div>
        </div>
    </div>

    <!-- Right column (True separate Preview Column positioned completely to the side of all parameters - centered) -->
    {#if showPreviews && (isCustomThemeId(selectedTheme) || isCustomThemeId(ttuThemeOverride) || isCustomThemeId(yatsuThemeOverride) || isCustomThemeId(manabeThemeOverride))}
        <div
            style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 20px; position: sticky; top: 16px; align-self: flex-start; margin-top: 36px;"
        >
            <!-- Global Custom Theme Mock NAT Popup Preview -->
            {#if popupThemeIdForPreview}
                {@const currentDraft =
                    themeDraftColors[popupThemeIdForPreview] ||
                    DEFAULT_CUSTOM_COLORS}
                {@const currentThemeName =
                    themeDraftNames[popupThemeIdForPreview] || "Custom Theme"}
                <div
                    style="display: flex; flex-direction: column; gap: 10px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; padding: 14px; width: 340px;"
                >
                    <div
                        style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: var(--color-text-muted); letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center;"
                    >
                        <span>NAT POPUP PREVIEW ({currentThemeName})</span>
                        {#if isThemeModified(popupThemeIdForPreview)}
                            <span
                                style="font-size: 9px; color: var(--color-accent); font-family: var(--font-mono); font-weight: normal;"
                                >● UNSAVED</span
                            >
                        {/if}
                    </div>

                    <!-- Mini Mock Popup container styled with currentDraft -->
                    <div
                        style="background: {currentDraft.background}; border: 1px solid {currentDraft.border}; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.4); text-align: left; font-family: var(--font-mono); line-height: 1.35; overflow: hidden; width: 100%;"
                    >
                        <!-- Header mockup -->
                        <div
                            style="display: flex; justify-content: space-between; align-items: center; color: {currentDraft.textMuted};"
                        >
                            <div
                                style="display: flex; align-items: center; gap: 6px;"
                            >
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke={currentDraft.accent}
                                    stroke-width="2.2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    style="display: block;"
                                >
                                    <circle cx="12" cy="12" r="10" />
                                    <path
                                        d="M12 18a6 6 0 1 0 0-12v12z"
                                        fill={currentDraft.accent}
                                    />
                                </svg>
                                <span
                                    style="font-size: 9.5px; font-weight: bold; color: {currentDraft.text};"
                                    >NihongoAutoTracker</span
                                >
                                <span
                                    style="font-size: 7.5px; font-weight: bold; color: {currentDraft.accent}; border: 1px solid color-mix(in srgb, {currentDraft.accent} 25%, transparent); background: color-mix(in srgb, {currentDraft.accent} 7%, transparent); padding: 0.5px 3px; border-radius: 3px; text-transform: uppercase;"
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
                            style="height: 1px; background: {currentDraft.border}; margin: 2px 0;"
                        ></div>

                        <!-- Queue Control Row mockup -->
                        <div
                            style="display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; font-weight: bold;"
                        >
                            <div
                                style="display: flex; align-items: center; gap: 4px;"
                            >
                                <span
                                    style="color: {currentDraft.textMuted}; letter-spacing: 0.05em;"
                                    >QUEUE</span
                                >
                                <span
                                    style="background: color-mix(in srgb, {currentDraft.accent} 10%, transparent); color: {currentDraft.accent}; border: 1px solid color-mix(in srgb, {currentDraft.accent} 22%, transparent); border-radius: 6px; padding: 0.5px 3.5px;"
                                    >5</span
                                >
                            </div>
                            <div style="display: flex; gap: 4px;">
                                <button
                                    style="background: {currentDraft.accent}; color: {currentDraft.background}; border: none; font-size: 7.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2px; cursor: default;"
                                    >Send All</button
                                >
                                <button
                                    style="background: transparent; color: {currentDraft.textMuted}; border: 1px solid {currentDraft.border}; font-size: 7.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2px; cursor: default;"
                                    >Clear</button
                                >
                            </div>
                        </div>

                        <!-- Tabs mockup -->
                        <div style="display: flex; gap: 4px;">
                            <span
                                style="font-size: 8.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2.5px; background: color-mix(in srgb, {currentDraft.accent} 10%, transparent); color: {currentDraft.accent}; border: 1px solid color-mix(in srgb, {currentDraft.accent} 30%, transparent);"
                                >All</span
                            >
                            <span
                                style="font-size: 8.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2.5px; border: 1px solid {currentDraft.border}; color: {currentDraft.textMuted};"
                                >Video</span
                            >
                            <span
                                style="font-size: 8.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2.5px; border: 1px solid {currentDraft.border}; color: {currentDraft.textMuted};"
                                >Reading</span
                            >
                        </div>

                        <!-- Queue Item mockup -->
                        <div
                            style="background: {currentDraft.surface}; border: 1px solid {currentDraft.border}; border-radius: 4px; padding: 8px; display: flex; flex-direction: column; gap: 4px;"
                        >
                            <div
                                style="display: flex; justify-content: space-between; align-items: center;"
                            >
                                <span
                                    style="font-size: 10px; font-weight: bold; color: {currentDraft.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 140px;"
                                    >転生したらスライムだった件</span
                                >
                                <div
                                    style="display: flex; gap: 4px; font-size: 9px; color: {currentDraft.textMuted};"
                                >
                                    <span
                                        style="color: var(--color-success); font-weight: bold;"
                                        >✓</span
                                    >
                                    <span>×</span>
                                </div>
                            </div>
                            <div
                                style="font-size: 8.5px; color: {currentDraft.textMuted};"
                            >
                                <strong style="color: {currentDraft.accent};"
                                    >18500</strong
                                >
                                chars •
                                <strong style="color: {currentDraft.text};"
                                    >90</strong
                                >
                                min •
                                <strong style="color: {currentDraft.accent};"
                                    >3</strong
                                > vol • TTU Reader
                            </div>
                            <div
                                style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;"
                            >
                                <span
                                    style="font-size: 8px; color: {currentDraft.textMuted}; display: flex; align-items: center; gap: 3px;"
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
                                    style="background: color-mix(in srgb, {currentDraft.accent} 10%, transparent); color: {currentDraft.accent}; border: 1px solid color-mix(in srgb, {currentDraft.accent} 22%, transparent); font-size: 7.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2px; cursor: default;"
                                    >Send</button
                                >
                            </div>

                            <!-- Sessions list replica -->
                            <div
                                style="border-top: 1px solid {currentDraft.border}; margin-top: 4px; padding-top: 4px;"
                            >
                                <div
                                    style="font-size: 8.5px; font-weight: bold; color: {currentDraft.textMuted}; margin-bottom: 2px;"
                                >
                                    ▼ Sessions (3)
                                </div>
                                <div
                                    style="display: flex; flex-direction: column; gap: 2px; font-size: 8px; color: {currentDraft.textMuted};"
                                >
                                    <div
                                        style="display: flex; justify-content: space-between;"
                                    >
                                        <span
                                            >• <span
                                                style="color: color-mix(in srgb, {currentDraft.accent} 60%, transparent); font-weight: bold;"
                                                >S1</span
                                            >
                                            <strong
                                                style="color: {currentDraft.accent};"
                                                >8200</strong
                                            >
                                            chars •
                                            <strong
                                                style="color: {currentDraft.text};"
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
                                                style="color: color-mix(in srgb, {currentDraft.accent} 60%, transparent); font-weight: bold;"
                                                >S2</span
                                            >
                                            <strong
                                                style="color: {currentDraft.accent};"
                                                >4100</strong
                                            >
                                            chars •
                                            <strong
                                                style="color: {currentDraft.text};"
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
                                                style="color: color-mix(in srgb, {currentDraft.accent} 60%, transparent); font-weight: bold;"
                                                >S3</span
                                            >
                                            <strong
                                                style="color: {currentDraft.accent};"
                                                >6200</strong
                                            >
                                            chars •
                                            <strong
                                                style="color: {currentDraft.text};"
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
                            style="width: 100%; background: none; color: {currentDraft.textMuted}; border: 1px solid {currentDraft.border}; border-radius: 4px; padding: 4px; font-size: 8.5px; font-weight: bold; cursor: default;"
                            >Open Settings</button
                        >
                    </div>
                </div>
            {/if}

            <!-- Custom Override Overlay Preview -->
            {#if readerThemeIdForPreview}
                {@const currentDraft =
                    themeDraftColors[readerThemeIdForPreview] ||
                    DEFAULT_CUSTOM_COLORS}
                {@const currentThemeName =
                    themeDraftNames[readerThemeIdForPreview] || "Custom Theme"}
                <div
                    style="display: flex; flex-direction: column; gap: 10px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; padding: 14px; width: 340px;"
                >
                    <div
                        style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: var(--color-text-muted); letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center;"
                    >
                        <span>READER OVERLAY PREVIEW ({currentThemeName})</span>
                        {#if isThemeModified(readerThemeIdForPreview)}
                            <span
                                style="font-size: 9px; color: var(--color-accent); font-family: var(--font-mono); font-weight: normal;"
                                >● UNSAVED</span
                            >
                        {/if}
                    </div>

                    <!-- Mini Mock Reader Page + Floating status bar mockup styled with currentDraft -->
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
                            style="background: {currentDraft.surface}; border: 1px solid {currentDraft.border}; border-radius: 4px; padding: 3px 6px; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); font-family: var(--font-mono); line-height: 1; z-index: 2; align-self: center;"
                        >
                            <span
                                style="color: {currentDraft.textMuted}; font-size: 9px; cursor: default;"
                                >⠿</span
                            >
                            <span
                                style="color: {currentDraft.text}; font-size: 10px; font-weight: bold; font-variant-numeric: tabular-nums;"
                                >15:32</span
                            >
                            <span
                                style="color: {currentDraft.accent}; font-size: 10px; cursor: default;"
                                >⏸</span
                            >
                            <span
                                style="color: {currentDraft.textMuted}; font-size: 10px; cursor: default; display: flex; align-items: center; justify-content: center; width: 10px; height: 10px;"
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
                                style="color: {currentDraft.textMuted}; font-size: 10px; cursor: default;"
                                >×</span
                            >
                        </div>

                        <!-- Progress Dashboard mockup inside reader view -->
                        <div
                            style="background: {currentDraft.background}; border: 1px solid {currentDraft.border}; border-radius: 5px; padding: 10px; display: flex; flex-direction: column; gap: 8px; width: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.4); text-align: center; font-family: var(--font-sans);"
                        >
                            <div>
                                <div
                                    style="font-size: 8px; font-weight: bold; color: {currentDraft.textMuted}; letter-spacing: 0.05em; text-transform: uppercase;"
                                >
                                    Current Session
                                </div>
                                <div
                                    style="display: flex; justify-content: space-around; margin-top: 4px; font-size: 8.5px; color: {currentDraft.textMuted};"
                                >
                                    <div>
                                        Time
                                        <div
                                            style="font-size: 12px; font-weight: bold; color: {currentDraft.text}; margin-top: 1px; font-family: var(--font-mono);"
                                        >
                                            0:00
                                        </div>
                                    </div>
                                    <div>
                                        Chars
                                        <div
                                            style="font-size: 12px; font-weight: bold; color: {currentDraft.text}; margin-top: 1px; font-family: var(--font-mono);"
                                        >
                                            0
                                        </div>
                                    </div>
                                    <div>
                                        Speed
                                        <div
                                            style="font-size: 12px; font-weight: bold; color: {currentDraft.text}; margin-top: 1px; font-family: var(--font-mono);"
                                        >
                                            0/h
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div
                                style="display: flex; justify-content: center; gap: 14px; font-size: 11px; color: {currentDraft.textMuted};"
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
                                    style="color: {currentDraft.text}; cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
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
                                    style="color: {currentDraft.accent}; cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
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
                                style="background: {currentDraft.surface}; border: 1px solid {currentDraft.border}; border-left: 3px solid var(--color-success); border-radius: 4px; padding: 4px 6px; display: flex; align-items: center; justify-content: space-between; font-size: 8px; text-align: left;"
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
                                    style="color: {currentDraft.accent}; font-weight: bold; white-space: nowrap;"
                                    >Vol 1 <span
                                        style="color: {currentDraft.textMuted}; margin-left: 2px;"
                                        >×</span
                                    ></span
                                >
                            </div>

                            <div
                                style="border-top: 1px dashed {currentDraft.border}; padding-top: 6px;"
                            >
                                <div
                                    style="font-size: 8px; font-weight: bold; color: {currentDraft.textMuted}; letter-spacing: 0.05em; text-transform: uppercase;"
                                >
                                    Total Book Progress
                                </div>
                                <div
                                    style="display: flex; justify-content: space-around; margin-top: 4px; font-size: 8.5px; color: {currentDraft.textMuted};"
                                >
                                    <div>
                                        Total Time
                                        <div
                                            style="font-size: 10px; font-weight: bold; color: {currentDraft.accent}; margin-top: 1px;"
                                        >
                                            0m
                                        </div>
                                    </div>
                                    <div>
                                        Total Chars
                                        <div
                                            style="font-size: 10px; font-weight: bold; color: {currentDraft.accent}; margin-top: 1px;"
                                        >
                                            0
                                        </div>
                                    </div>
                                    <div>
                                        Avg Speed
                                        <div
                                            style="font-size: 10px; font-weight: bold; color: {currentDraft.accent}; margin-top: 1px;"
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
                                style="color: {currentDraft.accent}; font-size: 14px; cursor: default;"
                                >▶</span
                            >
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    {/if}
</div>

<div style="display:flex; gap:10px; margin-top: 24px;">
    <button
        id="reset-theme-btn"
        class="btn btn-ghost"
        onclick={confirmResetAppearance}>Revert to Default</button
    >
</div>

<!-- Inline warning overlays matching original settings theme styles -->
{#if modalOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-overlay open" onclick={() => modalResolve?.(false)}>
        <div class="modal-box" onclick={(e) => e.stopPropagation()}>
            <h3>{modalTitle}</h3>
            <p>{modalMsg}</p>

            <div class="modal-actions">
                <button
                    class="btn btn-ghost btn-sm"
                    onclick={() => modalResolve?.(false)}>Cancel</button
                >
                <button
                    class="btn btn-amber btn-sm"
                    onclick={() => modalResolve?.(true)}>Proceed</button
                >
            </div>
        </div>
    </div>
{/if}

<style>
    /* CSS rules styling dropdown option layouts globally */
    :global(.select-option, .option, [class*="option"]) {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        width: 100%;
        position: relative;
    }
</style>
