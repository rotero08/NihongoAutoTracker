<!-- ThemeTab.svelte -->
<script lang="ts">
    import { onMount } from "svelte";
    import { configStorage } from "@/lib/storage/config";
    import CustomSelect from "@/components/settings/CustomSelect.svelte";
    import ThemeEditor from "./ThemeEditor.svelte";
    import ThemePreview from "./ThemePreview.svelte";
    import ThemePreferences from "./ThemePreferences.svelte";
    import ReaderOverrides from "./ReaderOverrides.svelte";
    import {
        getTheme,
        applyThemeToDocument,
        THEME_OPTIONS,
        FONT_OPTIONS,
        THEMES,
        lightenHexColor,
    } from "@/lib/ui/themes";

    interface Props {
        onStatus: (msg: string, err?: boolean) => void;
        onConfirm: (title: string, msg: string) => Promise<boolean>;
    }
    let { onStatus, onConfirm }: Props = $props();

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

    let useStaticToolbarIcon = $state(false);
    let useStaticInPageLogo = $state(false);

    let syncPopupWithReaderTheme = $state(true);

    let lastActiveTtuOverride = $state("global");
    let lastActiveYatsuOverride = $state("global");
    let lastActiveYomiyasuOverride = $state("global");

    let customThemes = $state<CustomTheme[]>([]);

    let themeDraftColors = $state<Record<string, Record<string, string>>>({});
    let themeDraftNames = $state<Record<string, string>>({});
    let triedSavingEmptyName = $state<Record<string, boolean>>({});

    let isCollapsed = $state<Record<string, boolean>>({
        global: true,
        ttu: true,
        yatsu: true,
        yomiyasu: true,
    });

    let ttuThemeOverride = $state("global");
    let yatsuThemeOverride = $state("global");
    let yomiyasuThemeOverride = $state("global");

    let isProceeding = false;



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

    function isThemeModified(themeId: string): boolean {
        const theme = customThemes.find((t) => t.id === themeId);
        const draftColors = themeDraftColors[themeId];
        const draftName = themeDraftNames[themeId];
        if (!draftColors || draftName === undefined) return false;

        if (!theme) {
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



    function cleanUpUnsavedDrafts() {
        if (
            isCustomThemeId(selectedTheme) &&
            !customThemes.some((t) => t.id === selectedTheme)
        ) {
            selectedTheme = lastActivePresetTheme;
            applyThemeToDocument(
                lastActivePresetTheme,
                selectedFont,
                undefined,
                { useStaticInPageLogo },
            );
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

    function handleGlobalClick(e: MouseEvent) {
        const target = e.target as HTMLElement;

        const navItem = target.closest(".nav-item");
        if (navItem && hasUnsavedChanges && !isProceeding) {
            e.preventDefault();
            e.stopPropagation();

            onConfirm(
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
    }

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

    function createNewCustomTheme(): string {
        const newId = "custom_" + Date.now();
        const defaultColors = getThemeColors(selectedTheme);

        themeDraftColors[newId] = defaultColors;
        themeDraftNames[newId] = "";
        triedSavingEmptyName[newId] = false;
        isCollapsed["global"] = false;

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

        if (selectedTheme === themeId) {
            lastActivePresetTheme = themeId;
        }
        if (ttuThemeOverride === themeId) lastActiveTtuOverride = themeId;
        if (yatsuThemeOverride === themeId) lastActiveYatsuOverride = themeId;
        if (yomiyasuThemeOverride === themeId)
            lastActiveYomiyasuOverride = themeId;

        if (selectedTheme === themeId) {
            applyThemeToDocument("dark-amber", selectedFont, draftColors, {
                useStaticInPageLogo,
            });
        }

        isCollapsed["global"] = true;
        onStatus(`✓ Theme "${draftName}" Saved`);
    }

    async function confirmRevertThemeDraft(themeId: string) {
        const confirmed = await onConfirm(
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
            if (selectedTheme === themeId) {
                selectedTheme = lastActivePresetTheme;
                applyThemeToDocument(
                    lastActivePresetTheme,
                    selectedFont,
                    undefined,
                    { useStaticInPageLogo },
                );
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
        const confirmed = await onConfirm(
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
            applyThemeToDocument("dark-amber", selectedFont, undefined, {
                useStaticInPageLogo,
            });
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

        useStaticToolbarIcon = cfg.useStaticToolbarIcon === true;
        useStaticInPageLogo = cfg.useStaticInPageLogo === true;

        syncPopupWithReaderTheme = cfg.syncPopupWithReaderTheme !== false;

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

        if (
            isCustomThemeId(selectedTheme) &&
            !customThemes.some((t) => t.id === selectedTheme)
        ) {
            if (!themeDraftColors[selectedTheme]) {
                themeDraftColors[selectedTheme] = cfg.customColors
                    ? { ...cfg.customColors }
                    : getThemeColors(lastActivePresetTheme);
                themeDraftNames[selectedTheme] = "";
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
                    { useStaticInPageLogo },
                );
            } else {
                applyThemeToDocument(
                    lastActivePresetTheme,
                    selectedFont,
                    undefined,
                    { useStaticInPageLogo },
                );
            }
        } else {
            applyThemeToDocument(selectedTheme, selectedFont, undefined, {
                useStaticInPageLogo,
            });
        }
    }

    async function saveTheme(themeName: string) {
        if (themeName.startsWith("delete-")) {
            return;
        }

        if (
            isCustomThemeId(selectedTheme) &&
            isThemeModified(selectedTheme) &&
            selectedTheme !== themeName
        ) {
            const confirmed = await onConfirm(
                "Unsaved Changes",
                "You have unsaved custom theme modifications. Selecting another theme will discard your current edits. Do you want to proceed?",
            );
            if (!confirmed) {
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
                    { useStaticInPageLogo },
                );
            } else {
                applyThemeToDocument(
                    lastActivePresetTheme,
                    selectedFont,
                    undefined,
                    { useStaticInPageLogo },
                );
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
            applyThemeToDocument(themeName, selectedFont, undefined, {
                useStaticInPageLogo,
            });
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
                    { useStaticInPageLogo },
                );
            } else {
                applyThemeToDocument(
                    lastActivePresetTheme,
                    fontName,
                    undefined,
                    { useStaticInPageLogo },
                );
            }
        } else {
            applyThemeToDocument(selectedTheme, fontName, undefined, {
                useStaticInPageLogo,
            });
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

        if (
            isCustomThemeId(currentOverride) &&
            isThemeModified(currentOverride) &&
            currentOverride !== themeName
        ) {
            const confirmed = await onConfirm(
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
        const confirmed = await onConfirm(
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
        useStaticToolbarIcon = false;
        useStaticInPageLogo = false;
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
            useStaticToolbarIcon: undefined,
            useStaticInPageLogo: undefined,
        });
        applyThemeToDocument("dark-amber", "sans", undefined, {
            useStaticInPageLogo: false,
        });
        onStatus("✓ Appearance Defaults Restored");
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
            onConfirm(
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

    function handleUncollapse(context: string) {
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
                ? "✓ Popup theme sync with reader enabled"
                : "✓ Popup theme sync with reader disabled",
        );
    }

    async function handleToolbarIconPref(val: boolean) {
        useStaticToolbarIcon = val;
        const cfg = (await configStorage.getValue()) as any;
        cfg.useStaticToolbarIcon = val;
        await configStorage.setValue(cfg);
        onStatus(
            val
                ? "✓ Classic toolbar icon applied"
                : "✓ Theme-matching toolbar icon applied",
        );
    }

    async function handleInPageLogoPref(val: boolean) {
        useStaticInPageLogo = val;
        const cfg = (await configStorage.getValue()) as any;
        cfg.useStaticInPageLogo = val;
        await configStorage.setValue(cfg);

        const currentColors = getThemeColors(selectedTheme);
        applyThemeToDocument(
            isCustomThemeId(selectedTheme) ? "dark-amber" : selectedTheme,
            selectedFont,
            isCustomThemeId(selectedTheme) ? currentColors : undefined,
            { useStaticInPageLogo: val },
        );

        onStatus(
            val
                ? "✓ Classic brand logo applied in-app"
                : "✓ Adaptive brand logo applied in-app",
        );
    }

    onMount(() => {
        load();
        window.addEventListener("beforeunload", onBeforeUnload);
        window.addEventListener("click", handleGlobalClick, true);

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

                    useStaticToolbarIcon = val.useStaticToolbarIcon === true;
                    useStaticInPageLogo = val.useStaticInPageLogo === true;

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
                                {
                                    useStaticInPageLogo:
                                        val.useStaticInPageLogo === true,
                                },
                            );
                        } else {
                            applyThemeToDocument(
                                lastActivePresetTheme,
                                selectedFont,
                                undefined,
                                {
                                    useStaticInPageLogo:
                                        val.useStaticInPageLogo === true,
                                },
                            );
                        }
                    } else {
                        applyThemeToDocument(
                            nextTheme,
                            selectedFont,
                            undefined,
                            {
                                useStaticInPageLogo:
                                    val.useStaticInPageLogo === true,
                            },
                        );
                    }
                }
            }
        };
        browser.storage.onChanged.addListener(storageListener);

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

<div style="display: flex; gap: 32px; align-items: flex-start; width: 100%;">
    <div
        style="width: 600px; flex-shrink: 0; display: flex; flex-direction: column; gap: 24px; min-width: 0; padding-bottom: 24px;"
    >
        <div class="tab-head" style="margin-bottom: 0px; padding-bottom: 8px;">
            <h2>Appearance</h2>
        </div>

        <p class="hint" style="margin-top: -12px; margin-bottom: 0px;">
            Customize the color theme and font layout of the extension Popup,
            Settings page, and video tracking overlays.
        </p>

        <ThemePreferences
            bind:useStaticToolbarIcon
            bind:useStaticInPageLogo
            onToolbarIconChange={handleToolbarIconPref}
            onInPageLogoChange={handleInPageLogoPref}
        />

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

            {#if isCollapsed["global"]}
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
                Sync popup's theme to reader's when browsing a reader
            </label>
        </div>

        <ReaderOverrides
            {readerThemeOptionsDerived}
            bind:ttuThemeOverride
            bind:yatsuThemeOverride
            bind:yomiyasuThemeOverride
            {ttuThemeOverrideToShow}
            {yatsuThemeOverrideToShow}
            {yomiyasuThemeOverrideToShow}
            bind:isCollapsed
            bind:themeDraftColors
            bind:themeDraftNames
            bind:triedSavingEmptyName
            {customThemes}
            onSaveOverride={saveReaderOverride}
            onSaveCustomThemeChanges={saveCustomThemeChanges}
            {confirmRevertThemeDraft}
            {confirmDeleteTheme}
            {handleCollapse}
            {handleUncollapse}
        />
    </div>

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


<style>
    :global(.select-option, .option, [class*="option"]) {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        width: 100%;
        position: relative;
    }

    :global(.dropup-select .select-dropdown),
    :global(.dropup-select .dropdown-menu),
    :global(.dropup-select [class*="select-dropdown"]),
    :global(.dropup-select [class*="dropdown-menu"]),
    :global(.dropup-select [class*="select-options"]),
    :global(.dropup-select [class*="options-container"]) {
        top: auto !important;
        bottom: calc(100% + 4px) !important;
    }

    :global(
            .select-dropdown,
            .dropdown-menu,
            [class*="select-dropdown"],
            [class*="dropdown-menu"],
            [class*="select-options"],
            [class*="options-container"]
        ) {
        max-height: 160px !important;
        overflow-y: auto !important;
    }

    :global(
            .select-dropdown::-webkit-scrollbar,
            .dropdown-menu::-webkit-scrollbar,
            [class*="select-dropdown"]::-webkit-scrollbar,
            [class*="dropdown-menu"]::-webkit-scrollbar,
            [class*="select-options"]::-webkit-scrollbar,
            [class*="options-container"]::-webkit-scrollbar
        ) {
        width: 6px !important;
        height: 6px !important;
    }
    :global(
            .select-dropdown::-webkit-scrollbar-track,
            .dropdown-menu::-webkit-scrollbar-track,
            [class*="select-dropdown"]::-webkit-scrollbar-track,
            [class*="dropdown-menu"]::-webkit-scrollbar-track,
            [class*="select-options"]::-webkit-scrollbar-track,
            [class*="options-container"]::-webkit-scrollbar-track
        ) {
        background: transparent !important;
    }
    :global(
            .select-dropdown::-webkit-scrollbar-thumb,
            .dropdown-menu::-webkit-scrollbar-thumb,
            [class*="select-dropdown"]::-webkit-scrollbar-thumb,
            [class*="dropdown-menu"]::-webkit-scrollbar-thumb,
            [class*="select-options"]::-webkit-scrollbar-thumb,
            [class*="options-container"]::-webkit-scrollbar-thumb
        ) {
        background: rgba(255, 255, 255, 0.12) !important;
        border-radius: 10px !important;
    }
    :global(
            .select-dropdown::-webkit-scrollbar-thumb:hover,
            .dropdown-menu::-webkit-scrollbar-thumb:hover,
            [class*="select-dropdown"]::-webkit-scrollbar-thumb:hover,
            [class*="dropdown-menu"]::-webkit-scrollbar-thumb:hover,
            [class*="select-options"]::-webkit-scrollbar-thumb:hover,
            [class*="options-container"]::-webkit-scrollbar-thumb:hover
        ) {
        background: rgba(255, 255, 255, 0.25) !important;
    }
    :global(
            .select-dropdown,
            .dropdown-menu,
            [class*="select-dropdown"],
            [class*="dropdown-menu"],
            [class*="select-options"],
            [class*="options-container"]
        ) {
        scrollbar-width: thin !important;
        scrollbar-color: rgba(255, 255, 255, 0.12) transparent !important;
    }
</style>
