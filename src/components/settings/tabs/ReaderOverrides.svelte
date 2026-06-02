<!-- ReaderOverrides.svelte -->
<script lang="ts">
    import CustomSelect from "@/components/common/CustomSelect.svelte";
    import ThemeEditor from "./ThemeEditor.svelte";

    interface Props {
        readerThemeOptionsDerived: Array<{ value: string; label: string }>;
        ttuThemeOverride: string;
        yatsuThemeOverride: string;
        yomiyasuThemeOverride: string;
        ttuThemeOverrideToShow: string;
        yatsuThemeOverrideToShow: string;
        yomiyasuThemeOverrideToShow: string;
        isCollapsed: Record<string, boolean>;
        themeDraftColors: Record<string, Record<string, string>>;
        themeDraftNames: Record<string, string>;
        triedSavingEmptyName: Record<string, boolean>;
        customThemes: Array<{
            id: string;
            name: string;
            colors: Record<string, string>;
        }>;
        deletableValues?: string[];
        onSaveOverride: (reader: string, themeName: string) => void;
        onSaveCustomThemeChanges: (themeId: string) => void;
        confirmRevertThemeDraft: (themeId: string) => void;
        confirmDeleteTheme: (themeId: string) => void;
        handleCollapse: (context: string) => void;
        handleUncollapse: (context: string) => void;
    }

    let {
        readerThemeOptionsDerived,
        ttuThemeOverride = $bindable(),
        yatsuThemeOverride = $bindable(),
        yomiyasuThemeOverride = $bindable(),
        ttuThemeOverrideToShow,
        yatsuThemeOverrideToShow,
        yomiyasuThemeOverrideToShow,
        isCollapsed = $bindable(),
        themeDraftColors = $bindable(),
        themeDraftNames = $bindable(),
        triedSavingEmptyName = $bindable(),
        customThemes,
        deletableValues = [],
        onSaveOverride,
        onSaveCustomThemeChanges,
        confirmRevertThemeDraft,
        confirmDeleteTheme,
        handleCollapse,
        handleUncollapse,
    }: Props = $props();

    function isCustomThemeId(id: string): boolean {
        return id === "custom" || id.startsWith("custom_");
    }
</script>

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
                    onChange={(v) => onSaveOverride("ttu", v)}
                    onDelete={confirmDeleteTheme}
                    {deletableValues}
                    label="Override Theme"
                    compact={false}
                />
            </div>
        </div>
        {#if isCustomThemeId(ttuThemeOverride)}
            {@const themeId = ttuThemeOverride}
            {#if isCollapsed["ttu"]}
                <button
                    class="btn btn-ghost"
                    style="width: 100%; padding: 4px 10px; font-size: 10.5px; display: flex; align-items: center; justify-content: space-between; margin-top: 4px; background: rgba(0,0,0,0.1); border: 1px dashed var(--color-border);"
                    onclick={() => handleUncollapse("ttu")}
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
                    <span style="color: var(--color-accent);"
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
                    compact={true}
                    onSave={onSaveCustomThemeChanges}
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
            <div style="width: 200px;" class="dropup-select">
                <CustomSelect
                    options={readerThemeOptionsDerived}
                    value={yatsuThemeOverrideToShow}
                    onChange={(v) => onSaveOverride("yatsu", v)}
                    onDelete={confirmDeleteTheme}
                    {deletableValues}
                    label="Override Theme"
                    compact={false}
                />
            </div>
        </div>
        {#if isCustomThemeId(yatsuThemeOverride)}
            {@const themeId = yatsuThemeOverride}
            {#if isCollapsed["yatsu"]}
                <button
                    class="btn btn-ghost"
                    style="width: 100%; padding: 4px 10px; font-size: 10.5px; display: flex; align-items: center; justify-content: space-between; margin-top: 4px; background: rgba(0,0,0,0.1); border: 1px dashed var(--color-border);"
                    onclick={() => handleUncollapse("yatsu")}
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
                    <span style="color: var(--color-accent);"
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
                    compact={true}
                    onSave={onSaveCustomThemeChanges}
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
            <div style="width: 200px;" class="dropup-select">
                <CustomSelect
                    options={readerThemeOptionsDerived}
                    value={yomiyasuThemeOverrideToShow}
                    onChange={(v) => onSaveOverride("yomiyasu", v)}
                    onDelete={confirmDeleteTheme}
                    {deletableValues}
                    label="Override Theme"
                    compact={false}
                />
            </div>
        </div>
        {#if isCustomThemeId(yomiyasuThemeOverride)}
            {@const themeId = yomiyasuThemeOverride}
            {#if isCollapsed["yomiyasu"]}
                <button
                    class="btn btn-ghost"
                    style="width: 100%; padding: 4px 10px; font-size: 10.5px; display: flex; align-items: center; justify-content: space-between; margin-top: 4px; background: rgba(0,0,0,0.1); border: 1px dashed var(--color-border);"
                    onclick={() => handleUncollapse("yomiyasu")}
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
                    <span style="color: var(--color-accent);"
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
                    compact={true}
                    onSave={onSaveCustomThemeChanges}
                    onRevert={confirmRevertThemeDraft}
                    onDelete={confirmDeleteTheme}
                    onCollapse={() => handleCollapse("yomiyasu")}
                />
            {/if}
        {/if}
    </div>
</div>
