<!-- ThemeTab.svelte -->
<script lang="ts">
    import { onMount } from "svelte";
    import { configStorage } from "@/lib/storage/config";
    import CustomSelect from "@/components/settings/CustomSelect.svelte";
    import ThemeEditor from "./theme/ThemeEditor.svelte";
    import ThemePreview from "./theme/ThemePreview.svelte";
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

    // Toggle controlling whether the popup inherits reader themes when browsing reader sites
    let syncPopupWithReaderTheme = $state(true);

    // Fallbacks to keep showing the last valid selection while editing unnamed themes
    let lastActiveTtuOverride = $state("global");
    let lastActiveYatsuOverride = $state("global");
    let lastActiveYomiyasuOverride = $state("global");

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
        yomiyasu: true,
    });

    let ttuThemeOverride = $state("global");
    let yatsuThemeOverride = $state("global");
    let yomiyasuThemeOverride = $state("global");

    // Preview & Dropdown Visibility States
    let templateDropdownOpen = $state(false);
    let ttuTemplateDropdownOpen = $state(false);
    let yatsuTemplateDropdownOpen = $state(false);
    let yomiyasuTemplateDropdownOpen = $state(false);

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

    const yomiyasuThemeOverrideToShow = $derived(
        isCustomThemeId(yomiyasuThemeOverride) &&
            !customThemes.find((t) => t.id === yomiyasuThemeOverride)?.name
            ? lastActiveYomiyasuOverride
            : yomiyasuThemeOverride,
    );

    // Determine target fallback values for previews based strictly on currently open editor
    let activeEditingThemeId = $derived(
        !isCollapsed["global"] && isCustomThemeId(selectedTheme)
            ? selectedTheme
            : !isCollapsed["ttu"] && isCustomThemeId(ttuThemeOverride)
              ? ttuThemeOverride
              : !isCollapsed["yatsu"] && isCustomThemeId(yatsuThemeOverride)
                ? yatsuThemeOverride
                : !isCollapsed["yomiyasu"] &&
                    isCustomThemeId(yomiyasuThemeOverride)
                  ? yomiyasuThemeOverride
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
                background: preset.colors.background,
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
        const _trackBackground = draftColors.background;
        const _trackSurface = draftColors.surface;
        const _trackSurfaceAlt = draftColors.surfaceAlt;
        const _trackBorder = draftColors.border;
        const _trackBorderHover = draftColors.borderHover;
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

    // Dynamically style and decorate custom options inside dropdown with extreme right deletion cross
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
            isCustomThemeId(yomiyasuThemeOverride) &&
            !customThemes.some((t) => t.id === yomiyasuThemeOverride)
        ) {
            yomiyasuThemeOverride = lastActiveYomiyasuOverride;
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
            yomiyasuTemplateDropdownOpen = false;
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
            (isCustomThemeId(yomiyasuThemeOverride) &&
                !customThemes.some((t) => t.id === yomiyasuThemeOverride) &&
                isThemeModified(yomiyasuThemeOverride)),
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
        if (yomiyasuThemeOverride === themeId) {
            cfg.yomiyasuThemeOverride = themeId;
            cfg.yomiyasuThemeOverrideId = themeId;
            cfg.yomiyasuCustomColors = { ...draftColors };
        }

        await configStorage.setValue(cfg);

        // Track last active fallback parameters upon successful save
        if (selectedTheme === themeId) {
            lastActivePresetTheme = themeId;
        }
        if (ttuThemeOverride === themeId) lastActiveTtuOverride = themeId;
        if (yatsuThemeOverride === themeId) lastActiveYatsuOverride = themeId;
        if (yomiyasuThemeOverride === themeId)
            lastActiveYomiyasuOverride = themeId;

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
            if (yomiyasuThemeOverride === themeId)
                yomiyasuThemeOverride = lastActiveYomiyasuOverride;

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
        if (yomiyasuThemeOverride === themeId) {
            yomiyasuThemeOverride = "global";
            lastActiveYomiyasuOverride = "global";
            cfg.yomiyasuThemeOverride = "global";
            cfg.yomiyasuThemeOverrideId = undefined;
            cfg.yomiyasuCustomColors = undefined;
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
        yomiyasuThemeOverride =
            cfg.yomiyasuThemeOverrideId ??
            cfg.yomiyasuThemeOverride ??
            "global";
        selectedTheme = cfg.selectedThemeId ?? cfg.theme ?? "dark-amber";
        selectedFont = cfg.font ?? "sans";

        // Read popup theme syncing option from storage configuration (defaulting to true)
        syncPopupWithReaderTheme = cfg.syncPopupWithReaderTheme !== false;

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

        if (!isCustomThemeId(yomiyasuThemeOverride)) {
            lastActiveYomiyasuOverride = yomiyasuThemeOverride;
        } else if (
            customThemes.some(
                (t) => t.id === yomiyasuThemeOverride && t.name.trim() !== "",
            )
        ) {
            lastActiveYomiyasuOverride = yomiyasuThemeOverride;
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
            isCustomThemeId(yomiyasuThemeOverride) &&
            !customThemes.some((t) => t.id === yomiyasuThemeOverride)
        ) {
            if (!themeDraftColors[yomiyasuThemeOverride]) {
                themeDraftColors[yomiyasuThemeOverride] =
                    cfg.yomiyasuCustomColors
                        ? { ...cfg.yomiyasuCustomColors }
                        : getThemeColors(lastActiveYomiyasuOverride);
            }
            if (themeDraftNames[yomiyasuThemeOverride] === undefined) {
                themeDraftNames[yomiyasuThemeOverride] = "";
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
                  : yomiyasuThemeOverride;

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
        if (reader === "yomiyasu") yomiyasuThemeOverride = themeName;

        // Track fallback override points for dropdown label display
        if (!isCustomThemeId(themeName)) {
            if (reader === "ttu") lastActiveTtuOverride = themeName;
            if (reader === "yatsu") lastActiveYatsuOverride = themeName;
            if (reader === "yomiyasu") lastActiveYomiyasuOverride = themeName;
        } else {
            const existing = customThemes.find((t) => t.id === themeName);
            if (existing && existing.name.trim() !== "") {
                if (reader === "ttu") lastActiveTtuOverride = themeName;
                if (reader === "yatsu") lastActiveYatsuOverride = themeName;
                if (reader === "yomiyasu")
                    lastActiveYomiyasuOverride = themeName;
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
        yomiyasuThemeOverride = "global";
        lastActiveYomiyasuOverride = "global";
        syncPopupWithReaderTheme = true;

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
            yomiyasuThemeOverride: undefined,
            yomiyasuThemeOverrideId: undefined,
            ttuCustomColors: undefined,
            yatsuCustomColors: undefined,
            yomiyasuCustomColors: undefined,
            syncPopupWithReaderTheme: undefined,
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
                    : yomiyasuThemeOverride;

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

    async function toggleSyncPopupTheme() {
        const cfg = (await configStorage.getValue()) as any;
        cfg.syncPopupWithReaderTheme = syncPopupWithReaderTheme;
        await configStorage.setValue(cfg);
        onStatus(
            syncPopupWithReaderTheme
                ? "✓ Theme Sync with Popup enabled"
                : "✓ Theme Sync with Popup disabled",
        );
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
                    const nextYomiyasu =
                        val.yomiyasuThemeOverrideId ??
                        val.yomiyasuThemeOverride ??
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
                    yomiyasuThemeOverride = nextYomiyasu;
                    selectedFont = nextFont;
                    syncPopupWithReaderTheme =
                        val.syncPopupWithReaderTheme !== false;

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

                    if (!isCustomThemeId(yomiyasuThemeOverride)) {
                        lastActiveYomiyasuOverride = yomiyasuThemeOverride;
                    } else if (
                        customThemes.some(
                            (t) =>
                                t.id === yomiyasuThemeOverride &&
                                t.name.trim() !== "",
                        )
                    ) {
                        lastActiveYomiyasuOverride = yomiyasuThemeOverride;
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
            browser.storage.onChanged.addListener(storageListener);
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
            {@const activeBackgroundColor =
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
                <ThemeEditor
                    {themeId}
                    bind:themeColors={themeDraftColors[themeId]}
                    bind:themeName={themeDraftNames[themeId]}
                    bind:triedSavingEmptyName={triedSavingEmptyName[themeId]}
                    {customThemes}
                    onSave={saveCustomThemeChanges}
                    onRevert={confirmRevertThemeDraft}
                    onDelete={confirmDeleteTheme}
                    onCollapse={() => handleCollapse("global")}
                />
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

        <!-- Reader Theme Synchronization Toggle -->
        <div class="field" style="margin-top: -4px; margin-bottom: 16px;">
            <label class="toggle">
                <input
                    type="checkbox"
                    id="sync-popup-theme"
                    class="toggle-chk"
                    bind:checked={syncPopupWithReaderTheme}
                    onchange={toggleSyncPopupTheme}
                />
                <span class="toggle-track"
                    ><span class="toggle-thumb"></span></span
                >
                Sync reader's theme to popup when browsing a reader
            </label>
        </div>

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
                    {@const activeBackgroundColor =
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
                        <ThemeEditor
                            {themeId}
                            bind:themeColors={themeDraftColors[themeId]}
                            bind:themeName={themeDraftNames[themeId]}
                            bind:triedSavingEmptyName={
                                triedSavingEmptyName[themeId]
                            }
                            {customThemes}
                            compact={true}
                            onSave={saveCustomThemeChanges}
                            onRevert={confirmRevertThemeDraft}
                            onDelete={confirmDeleteTheme}
                            onCollapse={() => handleCollapse("ttu")}
                        />
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
                    {@const activeBackgroundColor =
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
                        <ThemeEditor
                            {themeId}
                            bind:themeColors={themeDraftColors[themeId]}
                            bind:themeName={themeDraftNames[themeId]}
                            bind:triedSavingEmptyName={
                                triedSavingEmptyName[themeId]
                            }
                            {customThemes}
                            compact={true}
                            onSave={saveCustomThemeChanges}
                            onRevert={confirmRevertThemeDraft}
                            onDelete={confirmDeleteTheme}
                            onCollapse={() => handleCollapse("yatsu")}
                        />
                    {/if}
                {/if}
            </div>

            <!-- YomiYasu Reader Override -->
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <div
                    style="display: flex; justify-content: space-between; align-items: center; gap: 16px;"
                >
                    <div style="display: flex; flex-direction: column;">
                        <span
                            style="font-weight: 600; font-size: 12.5px; color: var(--color-text);"
                            >YomiYasu Reader</span
                        >
                    </div>
                    <div style="width: 200px;">
                        <CustomSelect
                            options={readerThemeOptionsDerived}
                            value={yomiyasuThemeOverrideToShow}
                            onChange={(v) => saveReaderOverride("yomiyasu", v)}
                            label="Override Theme"
                            compact={false}
                        />
                    </div>
                </div>
                {#if isCustomThemeId(yomiyasuThemeOverride)}
                    {@const themeId = yomiyasuThemeOverride}

                    <!-- Read reactive changes directly into Svelte localized variables to trigger visual signal compiles instantly -->
                    {@const activeAccentColor =
                        themeDraftColors[themeId]?.accent ||
                        "var(--color-accent)"}
                    {@const activeAccentHoverColor =
                        themeDraftColors[themeId]?.accentHover ||
                        themeDraftColors[themeId]?.accent ||
                        "var(--color-accent-hover)"}
                    {@const activeBackgroundColor =
                        themeDraftColors[themeId]?.background || "#09090f"}

                    {#if isCollapsed["yomiyasu"]}
                        <button
                            class="btn btn-ghost"
                            style="width: 100%; padding: 4px 10px; font-size: 10.5px; display: flex; align-items: center; justify-content: space-between; margin-top: 4px; background: rgba(0,0,0,0.1); border: 1px dashed var(--color-border);"
                            onclick={() => handleUncollapse("yomiyasu")}
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
                        <ThemeEditor
                            {themeId}
                            bind:themeColors={themeDraftColors[themeId]}
                            bind:themeName={themeDraftNames[themeId]}
                            bind:triedSavingEmptyName={
                                triedSavingEmptyName[themeId]
                            }
                            {customThemes}
                            compact={true}
                            onSave={saveCustomThemeChanges}
                            onRevert={confirmRevertThemeDraft}
                            onDelete={confirmDeleteTheme}
                            onCollapse={() => handleCollapse("yomiyasu")}
                        />
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
        <ThemePreview
            themeColors={currentDraft}
            themeName={currentThemeName}
            isUnsaved={isThemeModified(activeEditingThemeId)}
        />
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
