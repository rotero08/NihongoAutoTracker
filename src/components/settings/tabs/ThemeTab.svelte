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
        THEMES,
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
        success: "#3ddc84",
    };

    interface CustomTheme {
        id: string;
        name: string;
        colors: Record<string, string>;
    }

    let selectedTheme = $state("dark-amber");
    let selectedFont = $state("sans");
    let lastActivePresetTheme = $state("dark-amber");

    // Fallbacks to keep showing the last valid selection while editing unnamed themes
    let lastActiveTtuOverride = $state("global");
    let lastActiveYatsuOverride = $state("global");
    let lastActiveManabeOverride = $state("global");

    // Live custom themes storage
    let customThemes = $state<CustomTheme[]>([]);

    // Live unapplied change drafts (Realtime Preview targets)
    let themeDraftColors = $state<Record<string, Record<string, string>>>({});
    let themeDraftNames = $state<Record<string, string>>({});
    let triedSavingEmptyName = $state<Record<string, boolean>>({});

    // Context-based exclusive collapse state
    let isCollapsed = $state<Record<string, boolean>>({
        global: true,
        ttu: true,
        yatsu: true,
        manabe: true,
    });

    let ttuThemeOverride = $state("global");
    let yatsuThemeOverride = $state("global");
    let manabeThemeOverride = $state("global");

    // Preview & Dropdown Visibility States
    let templateDropdownOpen = $state(false);
    let ttuTemplateDropdownOpen = $state(false);
    let yatsuTemplateDropdownOpen = $state(false);
    let manabeTemplateDropdownOpen = $state(false);

    // Navigation lock state
    let isProceeding = false;

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

    // Derived states to preserve dropdown titles until theme name is committed/saved
    const selectedThemeToShow = $derived(
        isCustomThemeId(selectedTheme) &&
            !customThemes.find((t) => t.id === selectedTheme)?.name
            ? lastActivePresetTheme
            : selectedTheme,
    );

    const ttuThemeOverrideToShow = $derived(
        isCustomThemeId(ttuThemeOverride) &&
            !customThemes.find((t) => t.id === ttuThemeOverride)?.name
            ? lastActiveTtuOverride
            : ttuThemeOverride,
    );

    const yatsuThemeOverrideToShow = $derived(
        isCustomThemeId(yatsuThemeOverride) &&
            !customThemes.find((t) => t.id === yatsuThemeOverride)?.name
            ? lastActiveYatsuOverride
            : yatsuThemeOverride,
    );

    const manabeThemeOverrideToShow = $derived(
        isCustomThemeId(manabeThemeOverride) &&
            !customThemes.find((t) => t.id === manabeThemeOverride)?.name
            ? lastActiveManabeOverride
            : manabeThemeOverride,
    );

    // Determine target fallback values for previews based strictly on currently open editor
    let activeEditingThemeId = $derived(
        !isCollapsed["global"] && isCustomThemeId(selectedTheme)
            ? selectedTheme
            : !isCollapsed["ttu"] && isCustomThemeId(ttuThemeOverride)
              ? ttuThemeOverride
              : !isCollapsed["yatsu"] && isCustomThemeId(yatsuThemeOverride)
                ? yatsuThemeOverride
                : !isCollapsed["manabe"] && isCustomThemeId(manabeThemeOverride)
                  ? manabeThemeOverride
                  : "",
    );

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

    // Resolves the colors of any theme ID (Custom or Preset)
    function getThemeColors(themeId: string): Record<string, string> {
        if (isCustomThemeId(themeId)) {
            const custom = customThemes.find((t) => t.id === themeId);
            if (custom) return { ...custom.colors };
            if (themeDraftColors[themeId])
                return { ...themeDraftColors[themeId] };
        } else if (THEMES[themeId]) {
            const preset = THEMES[themeId];
            return {
                background: preset.colors.bg,
                surface: preset.colors.surface,
                surfaceAlt: preset.colors.surfaceAlt || preset.colors.surface,
                border: preset.colors.border,
                borderHover: preset.colors.borderHover || preset.colors.border,
                text: preset.colors.text,
                textMuted: preset.colors.muted,
                accent: preset.colors.accent,
                accentHover: preset.colors.accentHover || preset.colors.accent,
                success: preset.colors.success || "#3ddc84",
            };
        }
        return { ...DEFAULT_CUSTOM_COLORS };
    }

    // Derived modification checker with explicit nested property subscriptions
    function isThemeModified(themeId: string): boolean {
        const theme = customThemes.find((t) => t.id === themeId);
        const draftColors = themeDraftColors[themeId];
        const draftName = themeDraftNames[themeId];
        if (!draftColors || draftName === undefined) return false;

        // Force fine-grained Svelte 5 dependency tracking to capture inner color modifications
        const _trackName = draftName;
        const _trackBg = draftColors.background;
        const _trackSurf = draftColors.surface;
        const _trackSurfAlt = draftColors.surfaceAlt;
        const _trackBdr = draftColors.border;
        const _trackBdrHov = draftColors.borderHover;
        const _trackText = draftColors.text;
        const _trackMuted = draftColors.textMuted;
        const _trackAccent = draftColors.accent;
        const _trackAccentHov = draftColors.accentHover;
        const _trackSuccess = draftColors.success;

        if (!theme) {
            // New unsaved draft - modified if name is typed or colors differ from the fallback preset starting point
            const fallbackPresetId =
                selectedTheme === themeId
                    ? lastActivePresetTheme
                    : selectedTheme;
            const startingColors = getThemeColors(fallbackPresetId);
            return (
                draftName.trim() !== "" ||
                JSON.stringify($state.snapshot(draftColors)) !==
                    JSON.stringify(startingColors)
            );
        }

        return (
            draftName !== theme.name ||
            JSON.stringify($state.snapshot(draftColors)) !==
                JSON.stringify($state.snapshot(theme.colors))
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
                    const textSpan = document.createElement("span");
                    textSpan.className = "dropdown-option-text";
                    textSpan.textContent = text;
                    textSpan.style.overflow = "hidden";
                    textSpan.style.textOverflow = "ellipsis";
                    textSpan.style.whiteSpace = "nowrap";
                    textSpan.style.flex = "1";
                    textSpan.style.textAlign = "left";

                    opt.innerHTML = "";
                    opt.appendChild(textSpan);

                    (opt as HTMLElement).style.display = "flex";
                    (opt as HTMLElement).style.justifyContent = "space-between";
                    (opt as HTMLElement).style.alignItems = "center";
                    (opt as HTMLElement).style.width = "100%";
                    (opt as HTMLElement).style.position = "relative";
                    (opt as HTMLElement).style.gap = "8px";

                    const cross = document.createElement("span");
                    cross.className = "dropdown-delete-cross";
                    cross.textContent = "✕";
                    cross.style.color = "var(--color-text-muted)";
                    cross.style.fontSize = "10px";
                    cross.style.fontWeight = "bold";
                    cross.style.cursor = "pointer";
                    cross.style.padding = "2px 4px";
                    cross.style.marginLeft = "auto";
                    cross.style.marginRight = "-2px";
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

    // Discard any unsaved theme drafts and revert bindings back to stable selection targets
    function cleanUpUnsavedDrafts() {
        if (
            isCustomThemeId(selectedTheme) &&
            !customThemes.some((t) => t.id === selectedTheme)
        ) {
            selectedTheme = lastActivePresetTheme;
            clearCustomTheme();
            applyThemeToDocument(lastActivePresetTheme, selectedFont);
        }
        if (
            isCustomThemeId(ttuThemeOverride) &&
            !customThemes.some((t) => t.id === ttuThemeOverride)
        ) {
            ttuThemeOverride = lastActiveTtuOverride;
        }
        if (
            isCustomThemeId(yatsuThemeOverride) &&
            !customThemes.some((t) => t.id === yatsuThemeOverride)
        ) {
            yatsuThemeOverride = lastActiveYatsuOverride;
        }
        if (
            isCustomThemeId(manabeThemeOverride) &&
            !customThemes.some((t) => t.id === manabeThemeOverride)
        ) {
            manabeThemeOverride = lastActiveManabeOverride;
        }
    }

    // Intercept navigation via sidebar clicks and inline custom dropdown deletes
    function handleGlobalClick(e: MouseEvent) {
        const target = e.target as HTMLElement;

        // Close templates dropdown picker on outside clicks
        if (!target.closest(".custom-select-trigger")) {
            templateDropdownOpen = false;
            ttuTemplateDropdownOpen = false;
            yatsuTemplateDropdownOpen = false;
            manabeTemplateDropdownOpen = false;
        }

        // 1. Intercept Sidebar tab switching if there are unsaved changes
        const navItem = target.closest(".nav-item");
        if (navItem && hasUnsavedChanges && !isProceeding) {
            e.preventDefault();
            e.stopPropagation();

            askConfirmation(
                "Unsaved Changes",
                "You have unsaved custom theme modifications. Leaving this tab will discard all unsaved edits. Do you want to proceed?",
            ).then((confirmed) => {
                if (confirmed) {
                    isProceeding = true;
                    customThemes.forEach((t) => {
                        if (isThemeModified(t.id)) {
                            revertThemeDraft(t.id);
                        }
                    });
                    cleanUpUnsavedDrafts();
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
        });
    });

    let hasUnsavedChanges = $derived(
        customThemes.some((t) => isThemeModified(t.id)) ||
            (isCustomThemeId(selectedTheme) &&
                !customThemes.some((t) => t.id === selectedTheme) &&
                isThemeModified(selectedTheme)) ||
            (isCustomThemeId(ttuThemeOverride) &&
                !customThemes.some((t) => t.id === ttuThemeOverride) &&
                isThemeModified(ttuThemeOverride)) ||
            (isCustomThemeId(yatsuThemeOverride) &&
                !customThemes.some((t) => t.id === yatsuThemeOverride) &&
                isThemeModified(yatsuThemeOverride)) ||
            (isCustomThemeId(manabeThemeOverride) &&
                !customThemes.some((t) => t.id === manabeThemeOverride) &&
                isThemeModified(manabeThemeOverride)),
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
        root.style.setProperty("--color-success", colors.success || "#3ddc84");

        // Re-synchronize aliases
        root.style.setProperty("--bg", "var(--color-background)");
        root.style.setProperty("--surf", "var(--color-surface)");
        root.style.setProperty("--surf2", "var(--color-surface-alt)");
        root.style.setProperty("--bdr", "var(--color-border)");
        root.style.setProperty("--bdr2", "var(--color-border-hover)");
        root.style.setProperty("--text", "var(--color-text)");
        root.style.setProperty("--muted", "var(--color-text-muted)");
        root.style.setProperty("--dim", "var(--color-text-muted)");
        root.style.setProperty("--amber", "var(--color-accent)");
        root.style.setProperty("--ambrh", "var(--color-accent-hover)");
        root.style.setProperty("--green", "var(--color-success)");
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
        root.style.removeProperty("--color-success");

        root.style.removeProperty("--bg");
        root.style.removeProperty("--surf");
        root.style.removeProperty("--surf2");
        root.style.removeProperty("--bdr");
        root.style.removeProperty("--bdr2");
        root.style.removeProperty("--text");
        root.style.removeProperty("--muted");
        root.style.removeProperty("--dim");
        root.style.removeProperty("--amber");
        root.style.removeProperty("--ambrh");
        root.style.removeProperty("--green");
    }

    function createNewCustomTheme(): string {
        const newId = "custom_" + Date.now(); // Unified underscore prefix matching parent theme selector config

        // Start custom drafts with the currently selected theme's colors as a template base
        const defaultColors = getThemeColors(selectedTheme);

        // Keep local drafts directly in state only - DO NOT commit to customThemes or storage until clicking save
        themeDraftColors[newId] = defaultColors;
        themeDraftNames[newId] = "";
        triedSavingEmptyName[newId] = false;
        isCollapsed["global"] = false; // Expanded initially for configuration

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

        const exists = customThemes.some((t) => t.id === themeId);
        if (exists) {
            customThemes = customThemes.map((t) => {
                if (t.id === themeId) {
                    return {
                        ...t,
                        name: draftName,
                        colors: { ...draftColors },
                    };
                }
                return t;
            });
        } else {
            const newTheme: CustomTheme = {
                id: themeId,
                name: draftName,
                colors: { ...draftColors },
            };
            customThemes = [...customThemes, newTheme];
        }

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

        // Track last active fallback parameters upon successful save
        if (selectedTheme === themeId) {
            lastActivePresetTheme = themeId;
        }
        if (ttuThemeOverride === themeId) lastActiveTtuOverride = themeId;
        if (yatsuThemeOverride === themeId) lastActiveYatsuOverride = themeId;
        if (manabeThemeOverride === themeId) lastActiveManabeOverride = themeId;

        // ALWAYS apply base stylesheet attributes BEFORE custom theme variables to prevent browser wiping values
        if (selectedTheme === themeId) {
            applyThemeToDocument("dark-amber", selectedFont, draftColors);
        }

        // Collapse to minuscule header after saving
        isCollapsed["global"] = true;

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
        } else {
            // New unsaved draft - revert cleans up and restores selection to fallback presets
            if (selectedTheme === themeId) {
                selectedTheme = lastActivePresetTheme;
                clearCustomTheme();
                applyThemeToDocument(lastActivePresetTheme, selectedFont);
            }
            if (ttuThemeOverride === themeId)
                ttuThemeOverride = lastActiveTtuOverride;
            if (yatsuThemeOverride === themeId)
                yatsuThemeOverride = lastActiveYatsuOverride;
            if (manabeThemeOverride === themeId)
                manabeThemeOverride = lastActiveManabeOverride;

            delete themeDraftColors[themeId];
            delete themeDraftNames[themeId];
            delete triedSavingEmptyName[themeId];
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
                : "Custom Theme Draft";

        customThemes = customThemes.filter((t) => t.id !== themeId);

        const cfg = (await configStorage.getValue()) as any;

        if (selectedTheme === themeId) {
            selectedTheme = "dark-amber";
            lastActivePresetTheme = "dark-amber";
            cfg.theme = "dark-amber";
            cfg.selectedThemeId = undefined;
            cfg.customColors = undefined;
            clearCustomTheme();
            applyThemeToDocument("dark-amber", selectedFont);
        }
        if (ttuThemeOverride === themeId) {
            ttuThemeOverride = "global";
            lastActiveTtuOverride = "global";
            cfg.ttuThemeOverride = "global";
            cfg.ttuThemeOverrideId = undefined;
            cfg.ttuCustomColors = undefined;
        }
        if (yatsuThemeOverride === themeId) {
            yatsuThemeOverride = "global";
            lastActiveYatsuOverride = "global";
            cfg.yatsuThemeOverride = "global";
            cfg.yatsuThemeOverrideId = undefined;
            cfg.yatsuCustomColors = undefined;
        }
        if (manabeThemeOverride === themeId) {
            manabeThemeOverride = "global";
            lastActiveManabeOverride = "global";
            cfg.manabeThemeOverride = "global";
            cfg.manabeThemeOverrideId = undefined;
            cfg.manabeCustomColors = undefined;
        }

        cfg.customThemes = $state.snapshot(customThemes);
        await configStorage.setValue(cfg);

        // Delete from registries
        delete themeDraftColors[themeId];
        delete themeDraftNames[themeId];
        delete triedSavingEmptyName[themeId];

        onStatus(`✓ Deleted "${themeName}"`);
    }

    export async function load() {
        const cfg = (await configStorage.getValue()) as any;

        let loadedThemes: CustomTheme[] = [];
        if (cfg.customThemes) {
            loadedThemes = [...cfg.customThemes];
        }
        customThemes = loadedThemes;

        // Restore active override mappings if present
        ttuThemeOverride =
            cfg.ttuThemeOverrideId ?? cfg.ttuThemeOverride ?? "global";
        yatsuThemeOverride =
            cfg.yatsuThemeOverrideId ?? cfg.yatsuThemeOverride ?? "global";
        manabeThemeOverride =
            cfg.manabeThemeOverrideId ?? cfg.manabeThemeOverride ?? "global";
        selectedTheme = cfg.selectedThemeId ?? cfg.theme ?? "dark-amber";
        selectedFont = cfg.font ?? "sans";

        // Cache last active presets and override fallback points
        if (!isCustomThemeId(selectedTheme)) {
            lastActivePresetTheme = selectedTheme;
        } else if (
            customThemes.some(
                (t) => t.id === selectedTheme && t.name.trim() !== "",
            )
        ) {
            lastActivePresetTheme = selectedTheme;
        }

        if (!isCustomThemeId(ttuThemeOverride)) {
            lastActiveTtuOverride = ttuThemeOverride;
        } else if (
            customThemes.some(
                (t) => t.id === ttuThemeOverride && t.name.trim() !== "",
            )
        ) {
            lastActiveTtuOverride = ttuThemeOverride;
        }

        if (!isCustomThemeId(yatsuThemeOverride)) {
            lastActiveYatsuOverride = yatsuThemeOverride;
        } else if (
            customThemes.some(
                (t) => t.id === yatsuThemeOverride && t.name.trim() !== "",
            )
        ) {
            lastActiveYatsuOverride = yatsuThemeOverride;
        }

        if (!isCustomThemeId(manabeThemeOverride)) {
            lastActiveManabeOverride = manabeThemeOverride;
        } else if (
            customThemes.some(
                (t) => t.id === manabeThemeOverride && t.name.trim() !== "",
            )
        ) {
            lastActiveManabeOverride = manabeThemeOverride;
        }

        // RECOVER UNCOMMITTED TRANSIENT DRAFTS IF PREVIOUSLY CREATED BUT NEVER SAVED TO STORAGE
        if (
            isCustomThemeId(selectedTheme) &&
            !customThemes.some((t) => t.id === selectedTheme)
        ) {
            if (!themeDraftColors[selectedTheme]) {
                themeDraftColors[selectedTheme] = cfg.customColors
                    ? { ...cfg.customColors }
                    : getThemeColors(lastActivePresetTheme);
            }
            if (themeDraftNames[selectedTheme] === undefined) {
                themeDraftNames[selectedTheme] = "";
            }
        }
        if (
            isCustomThemeId(ttuThemeOverride) &&
            !customThemes.some((t) => t.id === ttuThemeOverride)
        ) {
            if (!themeDraftColors[ttuThemeOverride]) {
                themeDraftColors[ttuThemeOverride] = cfg.ttuCustomColors
                    ? { ...cfg.ttuCustomColors }
                    : getThemeColors(lastActiveTtuOverride);
            }
            if (themeDraftNames[ttuThemeOverride] === undefined) {
                themeDraftNames[ttuThemeOverride] = "";
            }
        }
        if (
            isCustomThemeId(yatsuThemeOverride) &&
            !customThemes.some((t) => t.id === yatsuThemeOverride)
        ) {
            if (!themeDraftColors[yatsuThemeOverride]) {
                themeDraftColors[yatsuThemeOverride] = cfg.yatsuCustomColors
                    ? { ...cfg.yatsuCustomColors }
                    : getThemeColors(lastActiveYatsuOverride);
            }
            if (themeDraftNames[yatsuThemeOverride] === undefined) {
                themeDraftNames[yatsuThemeOverride] = "";
            }
        }
        if (
            isCustomThemeId(manabeThemeOverride) &&
            !customThemes.some((t) => t.id === manabeThemeOverride)
        ) {
            if (!themeDraftColors[manabeThemeOverride]) {
                themeDraftColors[manabeThemeOverride] = cfg.manabeCustomColors
                    ? { ...cfg.manabeCustomColors }
                    : getThemeColors(lastActiveManabeOverride);
            }
            if (themeDraftNames[manabeThemeOverride] === undefined) {
                themeDraftNames[manabeThemeOverride] = "";
            }
        }

        customThemes.forEach((theme) => {
            themeDraftColors[theme.id] = { ...theme.colors };
            themeDraftNames[theme.id] = theme.name;
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
                applyThemeToDocument(lastActivePresetTheme, selectedFont);
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

        if (isCustomThemeId(themeName)) {
            const currentTheme = customThemes.find((t) => t.id === themeName);
            if (currentTheme) {
                // Only commit saved custom themes to config storage
                const cfg = (await configStorage.getValue()) as any;
                cfg.theme = themeName;
                cfg.selectedThemeId = themeName;
                cfg.customColors = { ...currentTheme.colors };
                cfg.customThemes = $state.snapshot(customThemes);
                await configStorage.setValue(cfg);
                applyThemeToDocument(
                    "dark-amber",
                    selectedFont,
                    currentTheme.colors,
                );
            } else {
                // Keep draft strictly local in Svelte state to prevent global applicator from reverting layout
                applyThemeToDocument(lastActivePresetTheme, selectedFont);
                onStatus("Custom draft active. Save inside preview to apply.");
            }
        } else {
            const cfg = (await configStorage.getValue()) as any;
            cfg.theme = themeName;
            cfg.selectedThemeId = undefined;
            cfg.customColors = undefined;
            cfg.customThemes = $state.snapshot(customThemes);
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
        cfg.customThemes = $state.snapshot(customThemes);
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
                applyThemeToDocument(lastActivePresetTheme, fontName);
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

        // Track fallback override points for dropdown label display
        if (!isCustomThemeId(themeName)) {
            if (reader === "ttu") lastActiveTtuOverride = themeName;
            if (reader === "yatsu") lastActiveYatsuOverride = themeName;
            if (reader === "manabe") lastActiveManabeOverride = themeName;
        } else {
            const existing = customThemes.find((t) => t.id === themeName);
            if (existing && existing.name.trim() !== "") {
                if (reader === "ttu") lastActiveTtuOverride = themeName;
                if (reader === "yatsu") lastActiveYatsuOverride = themeName;
                if (reader === "manabe") lastActiveManabeOverride = themeName;
            }
        }

        // Commit modifications to storage only if this selection is a preset or a fully saved custom theme
        const currentTheme = customThemes.find((t) => t.id === themeName);
        if (!isCustomThemeId(themeName) || currentTheme) {
            const cfg = (await configStorage.getValue()) as any;
            if (isCustomThemeId(themeName)) {
                cfg[`${reader}ThemeOverride`] = themeName;
                cfg[`${reader}ThemeOverrideId`] = themeName;
                if (currentTheme) {
                    cfg[`${reader}CustomColors`] = { ...currentTheme.colors };
                }
            } else {
                cfg[`${reader}ThemeOverride`] = themeName;
                cfg[`${reader}ThemeOverrideId`] = undefined;
                cfg[`${reader}CustomColors`] = undefined;
            }

            cfg.customThemes = $state.snapshot(customThemes);
            await configStorage.setValue(cfg);
        }
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
        lastActiveTtuOverride = "global";
        yatsuThemeOverride = "global";
        lastActiveYatsuOverride = "global";
        manabeThemeOverride = "global";
        lastActiveManabeOverride = "global";

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

    function handleColorChange(themeId: string, key: string) {
        // Automatically calculate and update accentHover as a starting template draft helper only when modifying the accent color
        if (key === "accent") {
            const draftColors = themeDraftColors[themeId];
            if (draftColors && draftColors.accent) {
                draftColors.accentHover = lightenHexColor(
                    draftColors.accent,
                    12,
                );
            }
        }
    }

    function handleCollapse(context: string) {
        const currentActiveTheme =
            context === "global"
                ? selectedTheme
                : context === "ttu"
                  ? ttuThemeOverride
                  : context === "yatsu"
                    ? yatsuThemeOverride
                    : manabeThemeOverride;

        if (
            isCustomThemeId(currentActiveTheme) &&
            isThemeModified(currentActiveTheme)
        ) {
            askConfirmation(
                "Unsaved Changes",
                "You have unsaved changes. Collapsing will discard your current edits. Do you want to proceed?",
            ).then((confirmed) => {
                if (confirmed) {
                    revertThemeDraft(currentActiveTheme);
                    isCollapsed[context] = true;
                }
            });
            return;
        }
        isCollapsed[context] = true;
    }

    function handleCollapseForced(context: string) {
        isCollapsed[context] = true;
    }

    function handleUncollapse(context: string) {
        // Exclusive collapse: close all other editors when expanding a new one
        Object.keys(isCollapsed).forEach((k) => {
            isCollapsed[k] = true;
        });
        isCollapsed[context] = false;
    }

    onMount(() => {
        load();
        window.addEventListener("beforeunload", onBeforeUnload);
        window.addEventListener("click", handleGlobalClick, true);

        // Reactively synchronize interface options when changed elsewhere (e.g. from Popup)
        const storageListener = (changes: any, area: string) => {
            if (area === "local" && changes["config"]) {
                const val = changes["config"].newValue as any;
                if (val) {
                    const nextTheme =
                        val.selectedThemeId ?? val.theme ?? "dark-amber";
                    const nextTtu =
                        val.ttuThemeOverrideId ??
                        val.ttuThemeOverride ??
                        "global";
                    const nextYatsu =
                        val.yatsuThemeOverrideId ??
                        val.yatsuThemeOverride ??
                        "global";
                    const nextManabe =
                        val.manabeThemeOverrideId ??
                        val.manabeThemeOverride ??
                        "global";
                    const nextFont = val.font ?? "sans";

                    if (val.customThemes) {
                        customThemes = val.customThemes;
                        customThemes.forEach((theme) => {
                            if (!isThemeModified(theme.id)) {
                                themeDraftColors[theme.id] = {
                                    ...theme.colors,
                                };
                                themeDraftNames[theme.id] = theme.name;
                            }
                        });
                    }

                    selectedTheme = nextTheme;
                    ttuThemeOverride = nextTtu;
                    yatsuThemeOverride = nextYatsu;
                    manabeThemeOverride = nextManabe;
                    selectedFont = nextFont;

                    if (!isCustomThemeId(selectedTheme)) {
                        lastActivePresetTheme = selectedTheme;
                    } else if (
                        customThemes.some(
                            (t) =>
                                t.id === selectedTheme && t.name.trim() !== "",
                        )
                    ) {
                        lastActivePresetTheme = selectedTheme;
                    }

                    if (!isCustomThemeId(ttuThemeOverride)) {
                        lastActiveTtuOverride = ttuThemeOverride;
                    } else if (
                        customThemes.some(
                            (t) =>
                                t.id === ttuThemeOverride &&
                                t.name.trim() !== "",
                        )
                    ) {
                        lastActiveTtuOverride = ttuThemeOverride;
                    }

                    if (!isCustomThemeId(yatsuThemeOverride)) {
                        lastActiveYatsuOverride = yatsuThemeOverride;
                    } else if (
                        customThemes.some(
                            (t) =>
                                t.id === yatsuThemeOverride &&
                                t.name.trim() !== "",
                        )
                    ) {
                        lastActiveYatsuOverride = yatsuThemeOverride;
                    }

                    if (!isCustomThemeId(manabeThemeOverride)) {
                        lastActiveManabeOverride = manabeThemeOverride;
                    } else if (
                        customThemes.some(
                            (t) =>
                                t.id === manabeThemeOverride &&
                                t.name.trim() !== "",
                        )
                    ) {
                        lastActiveManabeOverride = manabeThemeOverride;
                    }

                    // Keep local draft configurations loaded reactively if storage change triggered updates
                    if (
                        isCustomThemeId(nextTheme) &&
                        !customThemes.some((t) => t.id === nextTheme)
                    ) {
                        if (!themeDraftColors[nextTheme]) {
                            themeDraftColors[nextTheme] = val.customColors
                                ? { ...val.customColors }
                                : getThemeColors(lastActivePresetTheme);
                            themeDraftNames[nextTheme] = "";
                        }
                    }

                    if (isCustomThemeId(nextTheme)) {
                        const activeCustomTheme = customThemes.find(
                            (t) => t.id === nextTheme,
                        );
                        if (activeCustomTheme) {
                            applyThemeToDocument(
                                "dark-amber",
                                selectedFont,
                                activeCustomTheme.colors,
                            );
                        } else {
                            applyThemeToDocument(
                                lastActivePresetTheme,
                                selectedFont,
                            );
                        }
                    } else {
                        clearCustomTheme();
                        applyThemeToDocument(nextTheme, selectedFont);
                    }
                }
            }
        };
        browser.storage.onChanged.addListener(storageListener);

        // Dynamically widen the settings page container so split panels sit separated
        const mainContainer = document.querySelector(".main") as HTMLElement;
        if (mainContainer) {
            mainContainer.style.setProperty("max-width", "1100px", "important");
        }

        return () => {
            window.removeEventListener("beforeunload", onBeforeUnload);
            window.removeEventListener("click", handleGlobalClick, true);
            browser.storage.onChanged.removeListener(storageListener);
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
                value={selectedThemeToShow}
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

            {#if isCollapsed["global"]}
                <!-- Minuscule header option when custom builder is collapsed -->
                <button
                    class="btn btn-ghost"
                    style="width: 100%; padding: 8px 12px; font-size: 11.5px; display: flex; align-items: center; justify-content: space-between; background: var(--color-surface-alt); border: 1px dashed var(--color-border); border-radius: 6px;"
                    onclick={() => handleUncollapse("global")}
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
                            >Edit Custom Theme</span
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
                        <!-- Clean, pure styled collapse button without full bar overlay -->
                        <button
                            class="btn btn-ghost"
                            style="padding: 2px 6px; font-size: 11px; background: transparent; border: none; font-weight: bold; cursor: pointer; color: var(--color-accent); transition: opacity 0.15s;"
                            onmouseenter={(e) =>
                                (e.currentTarget.style.opacity = "0.8")}
                            onmouseleave={(e) =>
                                (e.currentTarget.style.opacity = "1")}
                            onclick={() => handleCollapse("global")}
                        >
                            Collapse Editor ▴
                        </button>
                    </div>

                    <div
                        style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 2px 0;"
                    >
                        <p
                            class="hint"
                            style="margin: 0; font-size: 11.5px; flex: 1;"
                        >
                            Enter hex codes directly or adjust pickers. Live
                            preview shows draft changes on the right.
                        </p>
                        <div
                            style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; position: relative;"
                        >
                            <span
                                style="font-size: 11px; color: var(--color-text-muted); font-weight: bold; white-space: nowrap;"
                                >Template:</span
                            >

                            <!-- Custom Select Trigger following the NAT Theme perfectly -->
                            <button
                                type="button"
                                class="custom-select-trigger"
                                style="background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text); font-family: var(--font-mono); font-size: 11px; padding: 4px 10px; border-radius: 4px; outline: none; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none; transition: border-color 0.15s, background 0.15s;"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    templateDropdownOpen =
                                        !templateDropdownOpen;
                                }}
                            >
                                <span>Load Preset...</span>
                                <span
                                    style="font-size: 8px; color: var(--color-text-muted);"
                                    >▼</span
                                >
                            </button>

                            {#if templateDropdownOpen}
                                <div
                                    style="position: absolute; top: calc(100% + 4px); right: 0; background: var(--color-surface); border: 1px solid var(--color-border-hover); border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.6); z-index: 1000; width: 160px; max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; padding: 4px 0;"
                                >
                                    {#each Object.entries(THEMES) as [key, value]}
                                        {@const themeObj = value as any}
                                        <button
                                            type="button"
                                            style="background: transparent; border: none; color: var(--color-text); font-family: var(--font-mono); font-size: 11px; padding: 6px 12px; text-align: left; cursor: pointer; width: 100%; transition: background 0.15s;"
                                            onmouseenter={(e) =>
                                                (e.currentTarget.style.background =
                                                    "rgba(255, 255, 255, 0.05)")}
                                            onmouseleave={(e) =>
                                                (e.currentTarget.style.background =
                                                    "transparent")}
                                            onclick={() => {
                                                const presetTheme = THEMES[key];
                                                themeDraftColors[themeId] = {
                                                    background:
                                                        presetTheme.colors.bg,
                                                    surface:
                                                        presetTheme.colors
                                                            .surface,
                                                    surfaceAlt:
                                                        presetTheme.colors
                                                            .surfaceAlt ||
                                                        presetTheme.colors
                                                            .surface,
                                                    border: presetTheme.colors
                                                        .border,
                                                    borderHover:
                                                        presetTheme.colors
                                                            .borderHover ||
                                                        presetTheme.colors
                                                            .border,
                                                    text: presetTheme.colors
                                                        .text,
                                                    textMuted:
                                                        presetTheme.colors
                                                            .muted,
                                                    accent: presetTheme.colors
                                                        .accent,
                                                    accentHover:
                                                        presetTheme.colors
                                                            .accentHover ||
                                                        presetTheme.colors
                                                            .accent,
                                                    success:
                                                        presetTheme.colors
                                                            .success ||
                                                        "#3ddc84",
                                                };
                                                templateDropdownOpen = false;
                                            }}
                                        >
                                            {themeObj.name}
                                        </button>
                                    {/each}

                                    <!-- Custom Theme Presets (Excluding current and empty/unsaved themes) -->
                                    {#if customThemes.filter((t) => t.id !== themeId && t.name.trim() !== "").length > 0}
                                        <div
                                            style="border-top: 1px solid var(--color-border); margin: 4px 0;"
                                        ></div>
                                        {#each customThemes.filter((t) => t.id !== themeId && t.name.trim() !== "") as customPreset}
                                            <button
                                                type="button"
                                                style="background: transparent; border: none; color: var(--color-text); font-family: var(--font-mono); font-size: 11px; padding: 6px 12px; text-align: left; cursor: pointer; width: 100%; transition: background 0.15s;"
                                                onmouseenter={(e) =>
                                                    (e.currentTarget.style.background =
                                                        "rgba(255, 255, 255, 0.05)")}
                                                onmouseleave={(e) =>
                                                    (e.currentTarget.style.background =
                                                        "transparent")}
                                                onclick={() => {
                                                    themeDraftColors[themeId] =
                                                        {
                                                            background:
                                                                customPreset
                                                                    .colors
                                                                    .background,
                                                            surface:
                                                                customPreset
                                                                    .colors
                                                                    .surface,
                                                            surfaceAlt:
                                                                customPreset
                                                                    .colors
                                                                    .surfaceAlt ||
                                                                customPreset
                                                                    .colors
                                                                    .surface,
                                                            border: customPreset
                                                                .colors.border,
                                                            borderHover:
                                                                customPreset
                                                                    .colors
                                                                    .borderHover ||
                                                                customPreset
                                                                    .colors
                                                                    .border,
                                                            text: customPreset
                                                                .colors.text,
                                                            textMuted:
                                                                customPreset
                                                                    .colors
                                                                    .textMuted,
                                                            accent: customPreset
                                                                .colors.accent,
                                                            accentHover:
                                                                customPreset
                                                                    .colors
                                                                    .accentHover ||
                                                                customPreset
                                                                    .colors
                                                                    .accent,
                                                            success:
                                                                customPreset
                                                                    .colors
                                                                    .success ||
                                                                "#3ddc84",
                                                        };
                                                    templateDropdownOpen = false;
                                                }}
                                            >
                                                ★ {customPreset.name}
                                            </button>
                                        {/each}
                                    {/if}
                                </div>
                            {/if}
                        </div>
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
                            maxlength="16"
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
                            }}
                        />
                        {#if triedSavingEmptyName[themeId] && (!themeDraftNames[themeId] || !themeDraftNames[themeId].trim())}
                            <span
                                style="color: var(--color-error, #ff4444); font-size: 11px; font-weight: bold;"
                                >Theme name is required. Please type a name.</span
                            >
                        {/if}
                    </div>

                    <!-- Highly comfortable intermediate 2-column grid layout -->
                    <div
                        style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;"
                    >
                        {#each [{ key: "background", label: "Background" }, { key: "surface", label: "Surface Panel" }, { key: "surfaceAlt", label: "Surface Alt" }, { key: "border", label: "Border Color" }, { key: "borderHover", label: "Border Hover" }, { key: "text", label: "Text Color" }, { key: "textMuted", label: "Muted Text" }, { key: "accent", label: "Accent Color" }, { key: "accentHover", label: "Accent Hover" }, { key: "success", label: "Success Color" }] as colorItem}
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
                                            oninput={() =>
                                                handleColorChange(
                                                    themeId,
                                                    colorItem.key,
                                                )}
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
                                        oninput={() =>
                                            handleColorChange(
                                                themeId,
                                                colorItem.key,
                                            )}
                                    />
                                </div>
                            </div>
                        {/each}
                    </div>

                    <!-- Theme actions (Save, Revert, Delete) -->
                    <div style="display: flex; gap: 6px; margin-top: 4px;">
                        <button
                            class="btn btn-amber"
                            style="flex: 1; font-size: 11.5px; padding: 8px 12px;"
                            onclick={() => saveCustomThemeChanges(themeId)}
                            disabled={!themeDraftNames[themeId]?.trim()}
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
                            value={ttuThemeOverrideToShow}
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

                    {#if isCollapsed["ttu"]}
                        <button
                            class="btn btn-ghost"
                            style="width: 100%; padding: 4px 10px; font-size: 10.5px; display: flex; align-items: center; justify-content: space-between; margin-top: 4px; background: rgba(0,0,0,0.1); border: 1px dashed var(--color-border);"
                            onclick={() => handleUncollapse("ttu")}
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
                                    >Edit Custom Theme</span
                                >
                            </span>
                            <span style="color: var(--color-accent);"
                                >Expand Editor ▾</span
                            >
                        </button>
                    {:else}
                        <div
                            style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px; padding: 10px; background: var(--color-surface-alt); border-radius: 4px; border: 1px solid var(--color-border);"
                        >
                            <div
                                style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;"
                            >
                                <span
                                    style="font-size: 10px; font-weight: bold; color: var(--color-accent);"
                                    >Edit Custom Theme</span
                                >
                                <!-- Clean, pure styled collapse button without full bar overlay -->
                                <button
                                    class="btn btn-ghost"
                                    style="padding: 2px 6px; font-size: 11px; background: transparent; border: none; font-weight: bold; cursor: pointer; color: var(--color-accent); transition: opacity 0.15s;"
                                    onmouseenter={(e) =>
                                        (e.currentTarget.style.opacity = "0.8")}
                                    onmouseleave={(e) =>
                                        (e.currentTarget.style.opacity = "1")}
                                    onclick={() => handleCollapse("ttu")}
                                >
                                    Collapse Editor ▴
                                </button>
                            </div>

                            <div
                                style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 2px 0;"
                            >
                                <p
                                    class="hint"
                                    style="margin: 0; font-size: 11.5px; flex: 1;"
                                >
                                    Enter hex codes directly or adjust pickers.
                                    Live preview shows draft changes on the
                                    right.
                                </p>
                                <div
                                    style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; position: relative;"
                                >
                                    <span
                                        style="font-size: 11px; color: var(--color-text-muted); font-weight: bold; white-space: nowrap;"
                                        >Template:</span
                                    >

                                    <!-- Custom Select Trigger following the NAT Theme perfectly -->
                                    <button
                                        type="button"
                                        class="custom-select-trigger"
                                        style="background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text); font-family: var(--font-mono); font-size: 11px; padding: 4px 10px; border-radius: 4px; outline: none; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none; transition: border-color 0.15s, background 0.15s;"
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            ttuTemplateDropdownOpen =
                                                !ttuTemplateDropdownOpen;
                                        }}
                                    >
                                        <span>Load Preset...</span>
                                        <span
                                            style="font-size: 8px; color: var(--color-text-muted);"
                                            >▼</span
                                        >
                                    </button>

                                    {#if ttuTemplateDropdownOpen}
                                        <div
                                            style="position: absolute; top: calc(100% + 4px); right: 0; background: var(--color-surface); border: 1px solid var(--color-border-hover); border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.6); z-index: 1000; width: 160px; max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; padding: 4px 0;"
                                        >
                                            {#each Object.entries(THEMES) as [key, value]}
                                                {@const themeObj = value as any}
                                                <button
                                                    type="button"
                                                    style="background: transparent; border: none; color: var(--color-text); font-family: var(--font-mono); font-size: 11px; padding: 6px 12px; text-align: left; cursor: pointer; width: 100%; transition: background 0.15s;"
                                                    onmouseenter={(e) =>
                                                        (e.currentTarget.style.background =
                                                            "rgba(255, 255, 255, 0.05)")}
                                                    onmouseleave={(e) =>
                                                        (e.currentTarget.style.background =
                                                            "transparent")}
                                                    onclick={() => {
                                                        const presetTheme =
                                                            THEMES[key];
                                                        themeDraftColors[
                                                            themeId
                                                        ] = {
                                                            background:
                                                                presetTheme
                                                                    .colors.bg,
                                                            surface:
                                                                presetTheme
                                                                    .colors
                                                                    .surface,
                                                            surfaceAlt:
                                                                presetTheme
                                                                    .colors
                                                                    .surfaceAlt ||
                                                                presetTheme
                                                                    .colors
                                                                    .surface,
                                                            border: presetTheme
                                                                .colors.border,
                                                            borderHover:
                                                                presetTheme
                                                                    .colors
                                                                    .borderHover ||
                                                                presetTheme
                                                                    .colors
                                                                    .border,
                                                            text: presetTheme
                                                                .colors.text,
                                                            textMuted:
                                                                presetTheme
                                                                    .colors
                                                                    .muted,
                                                            accent: presetTheme
                                                                .colors.accent,
                                                            accentHover:
                                                                presetTheme
                                                                    .colors
                                                                    .accentHover ||
                                                                presetTheme
                                                                    .colors
                                                                    .accent,
                                                            success:
                                                                presetTheme
                                                                    .colors
                                                                    .success ||
                                                                "#3ddc84",
                                                        };
                                                        ttuTemplateDropdownOpen = false;
                                                    }}
                                                >
                                                    {themeObj.name}
                                                </button>
                                            {/each}

                                            <!-- Custom Theme Presets (Excluding current and empty/unsaved themes) -->
                                            {#if customThemes.filter((t) => t.id !== themeId && t.name.trim() !== "").length > 0}
                                                <div
                                                    style="border-top: 1px solid var(--color-border); margin: 4px 0;"
                                                ></div>
                                                {#each customThemes.filter((t) => t.id !== themeId && t.name.trim() !== "") as customPreset}
                                                    <button
                                                        type="button"
                                                        style="background: transparent; border: none; color: var(--color-text); font-family: var(--font-mono); font-size: 11px; padding: 6px 12px; text-align: left; cursor: pointer; width: 100%; transition: background 0.15s;"
                                                        onmouseenter={(e) =>
                                                            (e.currentTarget.style.background =
                                                                "rgba(255, 255, 255, 0.05)")}
                                                        onmouseleave={(e) =>
                                                            (e.currentTarget.style.background =
                                                                "transparent")}
                                                        onclick={() => {
                                                            themeDraftColors[
                                                                themeId
                                                            ] = {
                                                                background:
                                                                    customPreset
                                                                        .colors
                                                                        .background,
                                                                surface:
                                                                    customPreset
                                                                        .colors
                                                                        .surface,
                                                                surfaceAlt:
                                                                    customPreset
                                                                        .colors
                                                                        .surfaceAlt ||
                                                                    customPreset
                                                                        .colors
                                                                        .surface,
                                                                border: customPreset
                                                                    .colors
                                                                    .border,
                                                                borderHover:
                                                                    customPreset
                                                                        .colors
                                                                        .borderHover ||
                                                                    customPreset
                                                                        .colors
                                                                        .border,
                                                                text: customPreset
                                                                    .colors
                                                                    .text,
                                                                textMuted:
                                                                    customPreset
                                                                        .colors
                                                                        .textMuted,
                                                                accent: customPreset
                                                                    .colors
                                                                    .accent,
                                                                accentHover:
                                                                    customPreset
                                                                        .colors
                                                                        .accentHover ||
                                                                    customPreset
                                                                        .colors
                                                                        .accent,
                                                                success:
                                                                    customPreset
                                                                        .colors
                                                                        .success ||
                                                                    "#3ddc84",
                                                            };
                                                            ttuTemplateDropdownOpen = false;
                                                        }}
                                                    >
                                                        ★ {customPreset.name}
                                                    </button>
                                                {/each}
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
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
                                    maxlength="16"
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
                                {#each [{ key: "background", label: "Background" }, { key: "surface", label: "Surface" }, { key: "surfaceAlt", label: "Surface Alt" }, { key: "border", label: "Border" }, { key: "borderHover", label: "Border Hover" }, { key: "text", label: "Text" }, { key: "textMuted", label: "Muted" }, { key: "accent", label: "Accent" }, { key: "accentHover", label: "Accent Hover" }, { key: "success", label: "Success" }] as colorItem}
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
                                                    oninput={() =>
                                                        handleColorChange(
                                                            themeId,
                                                            colorItem.key,
                                                        )}
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
                                                oninput={() =>
                                                    handleColorChange(
                                                        themeId,
                                                        colorItem.key,
                                                    )}
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
                                    class="btn btn-amber"
                                    style="flex: 1; font-size: 9.5px; padding: 4px 8px;"
                                    onclick={() =>
                                        saveCustomThemeChanges(themeId)}
                                    disabled={!themeDraftNames[themeId]?.trim()}
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
                            value={yatsuThemeOverrideToShow}
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

                    {#if isCollapsed["yatsu"]}
                        <button
                            class="btn btn-ghost"
                            style="width: 100%; padding: 4px 10px; font-size: 10.5px; display: flex; align-items: center; justify-content: space-between; margin-top: 4px; background: rgba(0,0,0,0.1); border: 1px dashed var(--color-border);"
                            onclick={() => handleUncollapse("yatsu")}
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
                                    >Edit Custom Theme</span
                                >
                            </span>
                            <span style="color: var(--color-accent);"
                                >Expand Editor ▾</span
                            >
                        </button>
                    {:else}
                        <div
                            style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px; padding: 10px; background: var(--color-surface-alt); border-radius: 4px; border: 1px solid var(--color-border);"
                        >
                            <div
                                style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;"
                            >
                                <span
                                    style="font-size: 10px; font-weight: bold; color: var(--color-accent);"
                                    >Edit Custom Theme</span
                                >
                                <!-- Clean, pure styled collapse button without full bar overlay -->
                                <button
                                    class="btn btn-ghost"
                                    style="padding: 2px 6px; font-size: 11px; background: transparent; border: none; font-weight: bold; cursor: pointer; color: var(--color-accent); transition: opacity 0.15s;"
                                    onmouseenter={(e) =>
                                        (e.currentTarget.style.opacity = "0.8")}
                                    onmouseleave={(e) =>
                                        (e.currentTarget.style.opacity = "1")}
                                    onclick={() => handleCollapse("yatsu")}
                                >
                                    Collapse Editor ▴
                                </button>
                            </div>

                            <div
                                style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 2px 0;"
                            >
                                <p
                                    class="hint"
                                    style="margin: 0; font-size: 11.5px; flex: 1;"
                                >
                                    Enter hex codes directly or adjust pickers.
                                    Live preview shows draft changes on the
                                    right.
                                </p>
                                <div
                                    style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; position: relative;"
                                >
                                    <span
                                        style="font-size: 11px; color: var(--color-text-muted); font-weight: bold; white-space: nowrap;"
                                        >Template:</span
                                    >

                                    <!-- Custom Select Trigger following the NAT Theme perfectly -->
                                    <button
                                        type="button"
                                        class="custom-select-trigger"
                                        style="background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text); font-family: var(--font-mono); font-size: 11px; padding: 4px 10px; border-radius: 4px; outline: none; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none; transition: border-color 0.15s, background 0.15s;"
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            yatsuTemplateDropdownOpen =
                                                !yatsuTemplateDropdownOpen;
                                        }}
                                    >
                                        <span>Load Preset...</span>
                                        <span
                                            style="font-size: 8px; color: var(--color-text-muted);"
                                            >▼</span
                                        >
                                    </button>

                                    {#if yatsuTemplateDropdownOpen}
                                        <div
                                            style="position: absolute; top: calc(100% + 4px); right: 0; background: var(--color-surface); border: 1px solid var(--color-border-hover); border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.6); z-index: 1000; width: 160px; max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; padding: 4px 0;"
                                        >
                                            {#each Object.entries(THEMES) as [key, value]}
                                                {@const themeObj = value as any}
                                                <button
                                                    type="button"
                                                    style="background: transparent; border: none; color: var(--color-text); font-family: var(--font-mono); font-size: 11px; padding: 6px 12px; text-align: left; cursor: pointer; width: 100%; transition: background 0.15s;"
                                                    onmouseenter={(e) =>
                                                        (e.currentTarget.style.background =
                                                            "rgba(255, 255, 255, 0.05)")}
                                                    onmouseleave={(e) =>
                                                        (e.currentTarget.style.background =
                                                            "transparent")}
                                                    onclick={() => {
                                                        const presetTheme =
                                                            THEMES[key];
                                                        themeDraftColors[
                                                            themeId
                                                        ] = {
                                                            background:
                                                                presetTheme
                                                                    .colors.bg,
                                                            surface:
                                                                presetTheme
                                                                    .colors
                                                                    .surface,
                                                            surfaceAlt:
                                                                presetTheme
                                                                    .colors
                                                                    .surfaceAlt ||
                                                                presetTheme
                                                                    .colors
                                                                    .surface,
                                                            border: presetTheme
                                                                .colors.border,
                                                            borderHover:
                                                                presetTheme
                                                                    .colors
                                                                    .borderHover ||
                                                                presetTheme
                                                                    .colors
                                                                    .border,
                                                            text: presetTheme
                                                                .colors.text,
                                                            textMuted:
                                                                presetTheme
                                                                    .colors
                                                                    .muted,
                                                            accent: presetTheme
                                                                .colors.accent,
                                                            accentHover:
                                                                presetTheme
                                                                    .colors
                                                                    .accentHover ||
                                                                presetTheme
                                                                    .colors
                                                                    .accent,
                                                            success:
                                                                presetTheme
                                                                    .colors
                                                                    .success ||
                                                                "#3ddc84",
                                                        };
                                                        yatsuTemplateDropdownOpen = false;
                                                    }}
                                                >
                                                    {themeObj.name}
                                                </button>
                                            {/each}

                                            <!-- Custom Theme Presets (Excluding current and empty/unsaved themes) -->
                                            {#if customThemes.filter((t) => t.id !== themeId && t.name.trim() !== "").length > 0}
                                                <div
                                                    style="border-top: 1px solid var(--color-border); margin: 4px 0;"
                                                ></div>
                                                {#each customThemes.filter((t) => t.id !== themeId && t.name.trim() !== "") as customPreset}
                                                    <button
                                                        type="button"
                                                        style="background: transparent; border: none; color: var(--color-text); font-family: var(--font-mono); font-size: 11px; padding: 6px 12px; text-align: left; cursor: pointer; width: 100%; transition: background 0.15s;"
                                                        onmouseenter={(e) =>
                                                            (e.currentTarget.style.background =
                                                                "rgba(255, 255, 255, 0.05)")}
                                                        onmouseleave={(e) =>
                                                            (e.currentTarget.style.background =
                                                                "transparent")}
                                                        onclick={() => {
                                                            themeDraftColors[
                                                                themeId
                                                            ] = {
                                                                background:
                                                                    customPreset
                                                                        .colors
                                                                        .background,
                                                                surface:
                                                                    customPreset
                                                                        .colors
                                                                        .surface,
                                                                surfaceAlt:
                                                                    customPreset
                                                                        .colors
                                                                        .surfaceAlt ||
                                                                    customPreset
                                                                        .colors
                                                                        .surface,
                                                                border: customPreset
                                                                    .colors
                                                                    .border,
                                                                borderHover:
                                                                    customPreset
                                                                        .colors
                                                                        .borderHover ||
                                                                    customPreset
                                                                        .colors
                                                                        .border,
                                                                text: customPreset
                                                                    .colors
                                                                    .text,
                                                                textMuted:
                                                                    customPreset
                                                                        .colors
                                                                        .textMuted,
                                                                accent: customPreset
                                                                    .colors
                                                                    .accent,
                                                                accentHover:
                                                                    customPreset
                                                                        .colors
                                                                        .accentHover ||
                                                                    customPreset
                                                                        .colors
                                                                        .accent,
                                                                success:
                                                                    customPreset
                                                                        .colors
                                                                        .success ||
                                                                    "#3ddc84",
                                                            };
                                                            yatsuTemplateDropdownOpen = false;
                                                        }}
                                                    >
                                                        ★ {customPreset.name}
                                                    </button>
                                                {/each}
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
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
                                    maxlength="16"
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
                                {#each [{ key: "background", label: "Background" }, { key: "surface", label: "Surface" }, { key: "surfaceAlt", label: "Surface Alt" }, { key: "border", label: "Border" }, { key: "borderHover", label: "Border Hover" }, { key: "text", label: "Text" }, { key: "textMuted", label: "Muted" }, { key: "accent", label: "Accent" }, { key: "accentHover", label: "Accent Hover" }, { key: "success", label: "Success" }] as colorItem}
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
                                                    oninput={() =>
                                                        handleColorChange(
                                                            themeId,
                                                            colorItem.key,
                                                        )}
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
                                                oninput={() =>
                                                    handleColorChange(
                                                        themeId,
                                                        colorItem.key,
                                                    )}
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
                                    class="btn btn-amber"
                                    style="flex: 1; font-size: 9.5px; padding: 4px 8px;"
                                    onclick={() =>
                                        saveCustomThemeChanges(themeId)}
                                    disabled={!themeDraftNames[themeId]?.trim()}
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
                            value={manabeThemeOverrideToShow}
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

                    {#if isCollapsed["manabe"]}
                        <button
                            class="btn btn-ghost"
                            style="width: 100%; padding: 4px 10px; font-size: 10.5px; display: flex; align-items: center; justify-content: space-between; margin-top: 4px; background: rgba(0,0,0,0.1); border: 1px dashed var(--color-border);"
                            onclick={() => handleUncollapse("manabe")}
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
                                    >Edit Custom Theme</span
                                >
                            </span>
                            <span style="color: var(--color-accent);"
                                >Expand Editor ▾</span
                            >
                        </button>
                    {:else}
                        <div
                            style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px; padding: 10px; background: var(--color-surface-alt); border-radius: 4px; border: 1px solid var(--color-border);"
                        >
                            <div
                                style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;"
                            >
                                <span
                                    style="font-size: 10px; font-weight: bold; color: var(--color-accent);"
                                    >Edit Custom Theme</span
                                >
                                <!-- Clean, pure styled collapse button without full bar overlay -->
                                <button
                                    class="btn btn-ghost"
                                    style="padding: 2px 6px; font-size: 11px; background: transparent; border: none; font-weight: bold; cursor: pointer; color: var(--color-accent); transition: opacity 0.15s;"
                                    onmouseenter={(e) =>
                                        (e.currentTarget.style.opacity = "0.8")}
                                    onmouseleave={(e) =>
                                        (e.currentTarget.style.opacity = "1")}
                                    onclick={() => handleCollapse("manabe")}
                                >
                                    Collapse Editor ▴
                                </button>
                            </div>

                            <div
                                style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 2px 0;"
                            >
                                <p
                                    class="hint"
                                    style="margin: 0; font-size: 11.5px; flex: 1;"
                                >
                                    Enter hex codes directly or adjust pickers.
                                    Live preview shows draft changes on the
                                    right.
                                </p>
                                <div
                                    style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; position: relative;"
                                >
                                    <span
                                        style="font-size: 11px; color: var(--color-text-muted); font-weight: bold; white-space: nowrap;"
                                        >Template:</span
                                    >

                                    <!-- Custom Select Trigger following the NAT Theme perfectly -->
                                    <button
                                        type="button"
                                        class="custom-select-trigger"
                                        style="background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text); font-family: var(--font-mono); font-size: 11px; padding: 4px 10px; border-radius: 4px; outline: none; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none; transition: border-color 0.15s, background 0.15s;"
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            manabeTemplateDropdownOpen =
                                                !manabeTemplateDropdownOpen;
                                        }}
                                    >
                                        <span>Load Preset...</span>
                                        <span
                                            style="font-size: 8px; color: var(--color-text-muted);"
                                            >▼</span
                                        >
                                    </button>

                                    {#if manabeTemplateDropdownOpen}
                                        <div
                                            style="position: absolute; top: calc(100% + 4px); right: 0; background: var(--color-surface); border: 1px solid var(--color-border-hover); border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.6); z-index: 1000; width: 160px; max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; padding: 4px 0;"
                                        >
                                            {#each Object.entries(THEMES) as [key, value]}
                                                {@const themeObj = value as any}
                                                <button
                                                    type="button"
                                                    style="background: transparent; border: none; color: var(--color-text); font-family: var(--font-mono); font-size: 11px; padding: 6px 12px; text-align: left; cursor: pointer; width: 100%; transition: background 0.15s;"
                                                    onmouseenter={(e) =>
                                                        (e.currentTarget.style.background =
                                                            "rgba(255, 255, 255, 0.05)")}
                                                    onmouseleave={(e) =>
                                                        (e.currentTarget.style.background =
                                                            "transparent")}
                                                    onclick={() => {
                                                        const presetTheme =
                                                            THEMES[key];
                                                        themeDraftColors[
                                                            themeId
                                                        ] = {
                                                            background:
                                                                presetTheme
                                                                    .colors.bg,
                                                            surface:
                                                                presetTheme
                                                                    .colors
                                                                    .surface,
                                                            surfaceAlt:
                                                                presetTheme
                                                                    .colors
                                                                    .surfaceAlt ||
                                                                presetTheme
                                                                    .colors
                                                                    .surface,
                                                            border: presetTheme
                                                                .colors.border,
                                                            borderHover:
                                                                presetTheme
                                                                    .colors
                                                                    .borderHover ||
                                                                presetTheme
                                                                    .colors
                                                                    .border,
                                                            text: presetTheme
                                                                .colors.text,
                                                            textMuted:
                                                                presetTheme
                                                                    .colors
                                                                    .muted,
                                                            accent: presetTheme
                                                                .colors.accent,
                                                            accentHover:
                                                                presetTheme
                                                                    .colors
                                                                    .accentHover ||
                                                                presetTheme
                                                                    .colors
                                                                    .accent,
                                                            success:
                                                                presetTheme
                                                                    .colors
                                                                    .success ||
                                                                "#3ddc84",
                                                        };
                                                        manabeTemplateDropdownOpen = false;
                                                    }}
                                                >
                                                    {themeObj.name}
                                                </button>
                                            {/each}

                                            <!-- Custom Theme Presets (Excluding current and empty/unsaved themes) -->
                                            {#if customThemes.filter((t) => t.id !== themeId && t.name.trim() !== "").length > 0}
                                                <div
                                                    style="border-top: 1px solid var(--color-border); margin: 4px 0;"
                                                ></div>
                                                {#each customThemes.filter((t) => t.id !== themeId && t.name.trim() !== "") as customPreset}
                                                    <button
                                                        type="button"
                                                        style="background: transparent; border: none; color: var(--color-text); font-family: var(--font-mono); font-size: 11px; padding: 6px 12px; text-align: left; cursor: pointer; width: 100%; transition: background 0.15s;"
                                                        onmouseenter={(e) =>
                                                            (e.currentTarget.style.background =
                                                                "rgba(255, 255, 255, 0.05)")}
                                                        onmouseleave={(e) =>
                                                            (e.currentTarget.style.background =
                                                                "transparent")}
                                                        onclick={() => {
                                                            themeDraftColors[
                                                                themeId
                                                            ] = {
                                                                background:
                                                                    customPreset
                                                                        .colors
                                                                        .background,
                                                                surface:
                                                                    customPreset
                                                                        .colors
                                                                        .surface,
                                                                surfaceAlt:
                                                                    customPreset
                                                                        .colors
                                                                        .surfaceAlt ||
                                                                    customPreset
                                                                        .colors
                                                                        .surface,
                                                                border: customPreset
                                                                    .colors
                                                                    .border,
                                                                borderHover:
                                                                    customPreset
                                                                        .colors
                                                                        .borderHover ||
                                                                    customPreset
                                                                        .colors
                                                                        .border,
                                                                text: customPreset
                                                                    .colors
                                                                    .text,
                                                                textMuted:
                                                                    customPreset
                                                                        .colors
                                                                        .textMuted,
                                                                accent: customPreset
                                                                    .colors
                                                                    .accent,
                                                                accentHover:
                                                                    customPreset
                                                                        .colors
                                                                        .accentHover ||
                                                                    customPreset
                                                                        .colors
                                                                        .accent,
                                                                success:
                                                                    customPreset
                                                                        .colors
                                                                        .success ||
                                                                    "#3ddc84",
                                                            };
                                                            manabeTemplateDropdownOpen = false;
                                                        }}
                                                    >
                                                        ★ {customPreset.name}
                                                    </button>
                                                {/each}
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
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
                                    maxlength="16"
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
                                {#each [{ key: "background", label: "Background" }, { key: "surface", label: "Surface" }, { key: "surfaceAlt", label: "Surface Alt" }, { key: "border", label: "Border" }, { key: "borderHover", label: "Border Hover" }, { key: "text", label: "Text" }, { key: "textMuted", label: "Muted" }, { key: "accent", label: "Accent" }, { key: "accentHover", label: "Accent Hover" }, { key: "success", label: "Success" }] as colorItem}
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
                                                    oninput={() =>
                                                        handleColorChange(
                                                            themeId,
                                                            colorItem.key,
                                                        )}
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
                                                oninput={() =>
                                                    handleColorChange(
                                                        themeId,
                                                        colorItem.key,
                                                    )}
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
                                    class="btn btn-amber"
                                    style="flex: 1; font-size: 9.5px; padding: 4px 8px;"
                                    onclick={() =>
                                        saveCustomThemeChanges(themeId)}
                                    disabled={!themeDraftNames[themeId]?.trim()}
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
    {#if activeEditingThemeId !== ""}
        {@const currentDraft =
            themeDraftColors[activeEditingThemeId] || DEFAULT_CUSTOM_COLORS}
        {@const currentThemeName =
            themeDraftNames[activeEditingThemeId] || "Custom Theme"}
        <div
            style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 20px; position: sticky; top: 16px; align-self: flex-start; margin-top: 36px;"
        >
            <!-- Global Custom Theme Mock NAT Popup Preview -->
            <div
                style="display: flex; flex-direction: column; gap: 10px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; padding: 14px; width: 340px;"
            >
                <div
                    style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: var(--color-text-muted); letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center;"
                >
                    <span>NAT POPUP PREVIEW ({currentThemeName})</span>
                    {#if isThemeModified(activeEditingThemeId)}
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
                                style="font-size: 7.5px; font-weight: bold; color: #3ddc84; border: 1px solid color-mix(in srgb, #3ddc84 25%, transparent); background: color-mix(in srgb, #3ddc84 7%, transparent); padding: 0.5px 3px; border-radius: 3px; text-transform: uppercase;"
                                >API KEY ✓</span
                            >
                        </div>
                        <div style="display: flex; gap: 4px; font-size: 10px;">
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
                                <span style="color: #3ddc84; font-weight: bold;"
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
                                    /><line x1="8" y1="2" x2="8" y2="6" /><line
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
                                        <span style="color: var(--color-error);"
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
                                        <span style="color: var(--color-error);"
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
                                            stroke-width="2.5"
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
                                        <span style="color: var(--color-error);"
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

            <!-- Custom Override Overlay Preview -->
            <div
                style="display: flex; flex-direction: column; gap: 10px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; padding: 14px; width: 340px;"
            >
                <div
                    style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: var(--color-text-muted); letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center;"
                >
                    <span>READER OVERLAY PREVIEW ({currentThemeName})</span>
                    {#if isThemeModified(activeEditingThemeId)}
                        <span
                            style="font-size: 9px; color: var(--color-accent); font-family: var(--font-mono); font-weight: normal;"
                            >● UNSAVED</span
                        >
                    {/if}
                </div>

                <!-- Mini Mock Reader Page + Floating status bar mockup styled with currentDraft -->
                <!-- Calculated theme dark background: 65% currentDraft.background mixed with deep dark #05050a to fit better and avoid being too dark -->
                <div
                    style="background: color-mix(in srgb, {currentDraft.background} 65%, #05050a); border-radius: 6px; padding: 16px 12px; text-align: center; border: 1px solid var(--color-border); position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; width: 100%;"
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
                            style="color: {currentDraft.accent}; font-size: 10px; font-weight: bold; font-variant-numeric: tabular-nums;"
                            >15:32</span
                        >
                        <span
                            style="color: {currentDraft.textMuted}; font-size: 10px; cursor: default;"
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
                                stroke-width="2.5"
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
                                style="color: {currentDraft.textMuted}; cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                            >
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    ><path d="M8 5v14l11-7z" /></svg
                                >
                            </span>
                            <span
                                style="color: {currentDraft.textMuted}; cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                            >
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.5"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    ><path
                                        d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"
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
                                    fill="currentColor"
                                    ><path
                                        d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"
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
                                    fill="currentColor"
                                    ><path
                                        d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"
                                    /></svg
                                >
                            </span>
                        </div>

                        <div
                            style="background: color-mix(in srgb, {currentDraft.success} 5%, {currentDraft.surface}); border: 1px solid color-mix(in srgb, {currentDraft.success} 25%, transparent); border-radius: 4px; padding: 6px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; text-align: left; width: 100%;"
                        >
                            <div
                                style="display: flex; align-items: center; gap: 4px; overflow: hidden;"
                            >
                                <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="3"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    style="color: {currentDraft.success}; flex-shrink: 0;"
                                >
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span
                                    style="color: {currentDraft.success}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; font-weight: bold;"
                                    >無職転生 ~異世界行ったら...</span
                                >
                            </div>
                            <span
                                style="color: {currentDraft.accent}; font-weight: bold; white-space: nowrap;"
                                >Vol 1 <span
                                    style="color: #f0706a; margin-left: 4px; font-weight: bold; cursor: default;"
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
                                        12m
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

                        <!-- past sessions history details mockup -->
                        <div
                            style="border-top: 1px solid {currentDraft.border}; margin-top: 6px; padding-top: 6px; text-align: left;"
                        >
                            <details
                                open
                                style="cursor: pointer; user-select: none;"
                            >
                                <summary
                                    style="font-size: 11px; font-weight: bold; color: {currentDraft.textMuted}; display: flex; align-items: center; gap: 4px; outline: none; list-style: none; white-space: nowrap !important;"
                                >
                                    <span
                                        style="font-size: 9px; color: {currentDraft.textMuted}; flex-shrink: 0;"
                                        >▼</span
                                    > Past Sessions History
                                </summary>
                                <div
                                    style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;"
                                >
                                    <div
                                        style="display: flex; align-items: center; justify-content: space-between; background: {currentDraft.surfaceAlt ||
                                            currentDraft.surface}; padding: 6px 8px; border-radius: 4px; font-size: 11px; color: {currentDraft.text}; white-space: nowrap !important;"
                                    >
                                        <span
                                            style="color: {currentDraft.textMuted};"
                                            >24 May</span
                                        >
                                        <span
                                            style="font-weight: bold; color: {currentDraft.accent}; margin: 0 4px;"
                                            >12m</span
                                        >
                                        <span
                                            style="color: {currentDraft.textMuted}; font-family: var(--font-mono); flex: 1; text-align: right; margin-right: 6px;"
                                            >0 chars</span
                                        >
                                        <span
                                            style="color: #f0706a; font-weight: bold; font-size: 12px; cursor: default; line-height: 1;"
                                            >×</span
                                        >
                                    </div>
                                </div>
                            </details>
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
