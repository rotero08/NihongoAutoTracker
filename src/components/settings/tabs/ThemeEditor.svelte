<!-- ThemeEditor.svelte -->
<script lang="ts">
    import { onMount } from "svelte";
    import CustomSelect from "@/components/common/CustomSelect.svelte";
    import { THEMES, lightenHexColor, DEFAULT_CUSTOM_COLORS } from "@/lib/ui/themes";

    interface Props {
        themeId: string;
        themeColors: Record<string, string>;
        themeName: string;
        triedSavingEmptyName: boolean;
        customThemes: Array<{
            id: string;
            name: string;
            colors: Record<string, string>;
        }>;
        compact?: boolean;
        onSave: (themeId: string) => void;
        onRevert: (themeId: string) => void;
        onDelete: (themeId: string) => void;
        onCollapse: () => void;
    }

    let {
        themeId,
        themeColors = $bindable(),
        themeName = $bindable(),
        triedSavingEmptyName = $bindable(),
        customThemes,
        compact = false,
        onSave,
        onRevert,
        onDelete,
        onCollapse,
    }: Props = $props();

    let importInputOpen = $state(false);
    let importCode = $state("");
    let exportStatus = $state("Share");

    async function handleExport() {
        try {
            const compactData = {
                n: themeName || "Shared Theme",
                c: themeColors,
            };
            const serialized = btoa(
                unescape(encodeURIComponent(JSON.stringify(compactData))),
            );
            await navigator.clipboard.writeText(serialized);
            exportStatus = "Copied!";
            setTimeout(() => {
                exportStatus = "Share";
            }, 1500);
        } catch {
            exportStatus = "Error";
            setTimeout(() => {
                exportStatus = "Share";
            }, 1500);
        }
    }

    function handleImport() {
        if (!importCode.trim()) return;
        try {
            const decoded = JSON.parse(
                decodeURIComponent(escape(atob(importCode.trim()))),
            );
            if (decoded && decoded.c) {
                themeColors = {
                    background:
                        decoded.c.background ||
                        DEFAULT_CUSTOM_COLORS.background,
                    surface: decoded.c.surface || DEFAULT_CUSTOM_COLORS.surface,
                    surfaceAlt:
                        decoded.c.surfaceAlt ||
                        decoded.c.surface ||
                        DEFAULT_CUSTOM_COLORS.surfaceAlt,
                    border: decoded.c.border || DEFAULT_CUSTOM_COLORS.border,
                    borderHover:
                        decoded.c.borderHover ||
                        decoded.c.border ||
                        DEFAULT_CUSTOM_COLORS.borderHover,
                    text: decoded.c.text || DEFAULT_CUSTOM_COLORS.text,
                    textMuted:
                        decoded.c.textMuted || DEFAULT_CUSTOM_COLORS.textMuted,
                    accent: decoded.c.accent || DEFAULT_CUSTOM_COLORS.accent,
                    accentHover:
                        decoded.c.accentHover ||
                        decoded.c.accent ||
                        DEFAULT_CUSTOM_COLORS.accentHover,
                    success: decoded.c.success || DEFAULT_CUSTOM_COLORS.success,
                };
                if (decoded.n) {
                    themeName = decoded.n;
                }
                importCode = "";
                importInputOpen = false;
            }
        } catch {
            alert("Invalid theme share code.");
        }
    }

    function handlePresetChange(val: string) {
        if (!val) return;
        const presetTheme = THEMES[val];
        if (presetTheme) {
            themeColors = {
                background: presetTheme.colors.background,
                surface: presetTheme.colors.surface,
                surfaceAlt: presetTheme.colors.surfaceAlt || presetTheme.colors.surface,
                border: presetTheme.colors.border,
                borderHover: presetTheme.colors.borderHover || presetTheme.colors.border,
                text: presetTheme.colors.text,
                textMuted: presetTheme.colors.muted,
                accent: presetTheme.colors.accent,
                accentHover: presetTheme.colors.accentHover || presetTheme.colors.accent,
                success: presetTheme.colors.success || "#3ddc84",
            };
        } else {
            const customPreset = customThemes.find(t => t.id === val);
            if (customPreset) {
                themeColors = {
                    background: customPreset.colors.background,
                    surface: customPreset.colors.surface,
                    surfaceAlt: customPreset.colors.surfaceAlt || customPreset.colors.surface,
                    border: customPreset.colors.border,
                    borderHover: customPreset.colors.borderHover || customPreset.colors.border,
                    text: customPreset.colors.text,
                    textMuted: customPreset.colors.textMuted,
                    accent: customPreset.colors.accent,
                    accentHover: customPreset.colors.accentHover || customPreset.colors.accent,
                    success: customPreset.colors.success || "#3ddc84",
                };
            }
        }
    }

    function autofocus(node: HTMLInputElement) {
        if (!compact) {
            node.focus();
            node.select();
        }
    }

    function handleColorChange(key: string) {
        if (key === "accent" && themeColors.accent) {
            themeColors.accentHover = lightenHexColor(themeColors.accent, 12);
        }
    }

    function rememberEditStart(e: FocusEvent) {
        const input = e.currentTarget as HTMLInputElement;
        input.dataset.editStart = input.value;
    }

    function handleTextEditKeydown(
        e: KeyboardEvent,
        revert: (value: string) => void,
    ) {
        const input = e.currentTarget as HTMLInputElement;
        if (e.key === "Enter") {
            e.preventDefault();
            input.blur();
        } else if (e.key === "Escape") {
            e.preventDefault();
            revert(input.dataset.editStart ?? "");
            input.blur();
        }
    }

    const colorFields = $derived(
        compact
            ? [
                  { key: "background", label: "Background" },
                  { key: "surface", label: "Surface" },
                  { key: "surfaceAlt", label: "Surface Alt" },
                  { key: "border", label: "Border" },
                  { key: "borderHover", label: "Border Hover" },
                  { key: "text", label: "Text" },
                  { key: "textMuted", label: "Muted" },
                  { key: "accent", label: "Accent" },
                  { key: "accentHover", label: "Accent Hover" },
                  { key: "success", label: "Success" },
              ]
            : [
                  { key: "background", label: "Background" },
                  { key: "surface", label: "Surface Panel" },
                  { key: "surfaceAlt", label: "Surface Alt" },
                  { key: "border", label: "Border Color" },
                  { key: "borderHover", label: "Border Hover" },
                  { key: "text", label: "Text Color" },
                  { key: "textMuted", label: "Muted Text" },
                  { key: "accent", label: "Accent Color" },
                  { key: "accentHover", label: "Accent Hover" },
                  { key: "success", label: "Success Color" },
              ],
    );

    const presetOptions = $derived([
        { value: "", label: "Load Preset..." },
        ...Object.entries(THEMES).map(([key, value]) => ({ value: key, label: (value as any).name })),
        ...customThemes.filter((t) => t.id !== themeId && t.name.trim() !== "").map((t) => ({ value: t.id, label: `★ ${t.name}` }))
    ]);
</script>

<div
    class="custom-theme-builder"
    style={compact
        ? "display: flex; flex-direction: column; gap: 6px; margin-top: 4px; padding: 10px; background: var(--color-surface-alt); border-radius: 4px; border: 1px solid var(--color-border);"
        : "background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: 6px; padding: 14px; display: flex; flex-direction: column; gap: 10px;"}
>
    <div
        style="font-weight: bold; font-size: 13px; color: var(--color-accent); display: flex; justify-content: space-between; align-items: center;"
    >
        <span>Edit Custom Theme</span>
        <button
            class="btn btn-ghost"
            style="padding: 2px 6px; font-size: 11px; background: transparent; border: none; font-weight: bold; cursor: pointer; color: var(--color-accent); transition: opacity 0.15s;"
            onmouseenter={(e) => (e.currentTarget.style.opacity = "0.8")}
            onmouseleave={(e) => (e.currentTarget.style.opacity = "1")}
            onclick={onCollapse}
        >
            Collapse Editor ▴
        </button>
    </div>

    <div
        style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 2px 0;"
    >
        <p class="hint" style="margin: 0; font-size: 11.5px; flex: 1;">
            Enter hex codes directly or adjust pickers. Live preview shows draft
            changes on the right.
        </p>
        <div
            style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; position: relative; width: 220px;"
        >
            <CustomSelect
                options={presetOptions}
                value=""
                onChange={handlePresetChange}
                label=""
                compact={true}
            />

            <button
                type="button"
                style="background: transparent; border: 1px dashed var(--color-border); color: var(--color-text-muted); font-size: 11px; padding: 4px 8px; border-radius: 4px; cursor: pointer; transition: color 0.15s, border-color 0.15s;"
                onmouseenter={(e) => {
                    e.currentTarget.style.color = "var(--color-text)";
                    e.currentTarget.style.borderColor =
                        "var(--color-border-hover)";
                }}
                onmouseleave={(e) => {
                    e.currentTarget.style.color = "var(--color-text-muted)";
                    e.currentTarget.style.borderColor = "var(--color-border)";
                }}
                onclick={() => (importInputOpen = !importInputOpen)}
            >
                Import
            </button>
        </div>
    </div>

    {#if compact}
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
                style="width: 100%; padding: 4px 6px; font-size: 11px; border: 1px solid {triedSavingEmptyName &&
                !themeName.trim()
                    ? 'var(--color-error, #ff4444)'
                    : 'var(--color-border)'}"
                bind:value={themeName}
                placeholder="Theme Name"
                oninput={() => (triedSavingEmptyName = false)}
                onfocus={rememberEditStart}
                onkeydown={(e) =>
                    handleTextEditKeydown(e, (value) => {
                        themeName = value;
                        triedSavingEmptyName = false;
                    })}
            />
            {#if triedSavingEmptyName && !themeName.trim()}
                <span
                    style="color: var(--color-error, #ff4444); font-size: 10px; font-weight: bold;"
                    >Name is required.</span
                >
            {/if}
        </div>
    {:else}
        <div style="display: flex; flex-direction: column; gap: 4px;">
            <span
                style="font-size: 11px; font-weight: bold; color: var(--color-text-muted);"
                >Theme Name</span
            >
            <input
                use:autofocus
                type="text"
                class="input"
                maxlength="16"
                style="width: 100%; padding: 6px 8px; font-size: 12px; border: 1px solid {triedSavingEmptyName &&
                !themeName.trim()
                    ? 'var(--color-error, #ff4444)'
                    : 'var(--color-border)'}; box-shadow: {triedSavingEmptyName &&
                !themeName.trim()
                    ? '0 0 0 2px rgba(239, 68, 68, 0.2)'
                    : 'none'}"
                bind:value={themeName}
                placeholder="Type theme name here..."
                oninput={() => (triedSavingEmptyName = false)}
                onfocus={rememberEditStart}
                onkeydown={(e) =>
                    handleTextEditKeydown(e, (value) => {
                        themeName = value;
                        triedSavingEmptyName = false;
                    })}
            />
            {#if triedSavingEmptyName && !themeName.trim()}
                <span
                    style="color: var(--color-error, #ff4444); font-size: 11px; font-weight: bold;"
                    >Theme name is required. Please type a name.</span
                >
            {/if}
        </div>
    {/if}

    {#if importInputOpen}
        <div
            style="display: flex; gap: 6px; flex-direction: column; margin-bottom: 6px; padding: 8px; background: rgba(0,0,0,0.15); border-radius: 4px; border: 1px solid var(--color-border-hover);"
        >
            <span
                style="font-size: 10px; font-weight: bold; color: var(--color-text-muted);"
                >Paste Theme Code:</span
            >
            <div style="display: flex; gap: 4px;">
                <input
                    type="text"
                    class="input"
                    style="flex: 1; padding: 4px 6px; font-size: 11px;"
                    bind:value={importCode}
                    placeholder="Paste base64 theme code..."
                    onfocus={rememberEditStart}
                    onkeydown={(e) =>
                        handleTextEditKeydown(
                            e,
                            (value) => (importCode = value),
                        )}
                />
                <button
                    class="btn btn-amber btn-sm"
                    style="font-size: 10px; padding: 2px 6px;"
                    onclick={handleImport}
                >
                    Apply
                </button>
                <button
                    class="btn btn-ghost btn-sm"
                    style="font-size: 10px; padding: 2px 6px;"
                    onclick={() => {
                        importInputOpen = false;
                        importCode = "";
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    {/if}

    <div
        style={compact
            ? "display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px;"
            : "display: grid; grid-template-columns: 1fr 1fr; gap: 8px;"}
    >
        {#each colorFields as field}
            <div
                style={compact
                    ? "display: flex; align-items: center; justify-content: space-between; gap: 6px; background: rgba(0,0,0,0.15); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border);"
                    : "display: flex; align-items: center; justify-content: space-between; gap: 8px; background: rgba(0,0,0,0.1); padding: 6px 10px; border-radius: 4px; border: 1px solid var(--color-border);"}
            >
                <span
                    style={compact
                        ? "font-size: 10.5px; font-weight: bold; color: var(--color-text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 80px;"
                        : "font-size: 11px; font-weight: bold; color: var(--color-text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 95px;"}
                    >{field.label}</span
                >
                <div
                    style={compact
                        ? "display: flex; align-items: center; gap: 4px;"
                        : "display: flex; align-items: center; gap: 6px;"}
                >
                    <div
                        style={compact
                            ? "width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--color-border); background: " +
                              (themeColors?.[field.key] ||
                                  DEFAULT_CUSTOM_COLORS[field.key]) +
                              "; position: relative; flex-shrink: 0; cursor: pointer;"
                            : "width: 16px; height: 16px; border-radius: 3px; border: 1px solid var(--color-border); background: " +
                              (themeColors?.[field.key] ||
                                  DEFAULT_CUSTOM_COLORS[field.key]) +
                              "; cursor: pointer; position: relative;"}
                    >
                        <input
                            type="color"
                            bind:value={themeColors[field.key]}
                            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; padding: 0; border: none;"
                            oninput={() => handleColorChange(field.key)}
                        />
                    </div>
                    <input
                        type="text"
                        class="input"
                        style={compact
                            ? "width: 70px; padding: 2px 4px; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; text-align: center;"
                            : "width: 76px; padding: 4px 6px; font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; text-align: center;"}
                        bind:value={themeColors[field.key]}
                        oninput={() => handleColorChange(field.key)}
                        onfocus={rememberEditStart}
                        onkeydown={(e) =>
                            handleTextEditKeydown(e, (value) => {
                                themeColors[field.key] = value;
                                handleColorChange(field.key);
                            })}
                    />
                </div>
            </div>
        {/each}
    </div>

    <div
        style={compact
            ? "display: flex; gap: 4px; margin-top: 6px;"
            : "display: flex; gap: 6px; margin-top: 4px;"}
    >
        <button
            class="btn btn-amber"
            style={compact
                ? "flex: 1; font-size: 9.5px; padding: 4px 8px;"
                : "flex: 1; font-size: 11.5px; padding: 8px 12px;"}
            onclick={() => onSave(themeId)}
            disabled={!themeName?.trim()}
        >
            Save Theme
        </button>
        <button
            class="btn btn-ghost"
            style={compact
                ? "font-size: 9.5px; padding: 4px 8px;"
                : "font-size: 11px; padding: 6px 10px;"}
            onclick={() => onRevert(themeId)}
        >
            Revert
        </button>
        <button
            class="btn btn-ghost"
            style={compact
                ? "font-size: 9.5px; padding: 4px 8px;"
                : "font-size: 11px; padding: 6px 10px;"}
            onclick={handleExport}
        >
            {exportStatus}
        </button>
        <button
            class="btn btn-ghost"
            style={compact
                ? "font-size: 9.5px; padding: 4px 8px; color: var(--color-error); border-color: rgba(239, 68, 68, 0.2);"
                : "font-size: 11px; padding: 6px 10px; color: var(--color-error); border-color: rgba(239, 68, 68, 0.2);"}
            onclick={() => onDelete(themeId)}
        >
            Delete
        </button>
    </div>
</div>
