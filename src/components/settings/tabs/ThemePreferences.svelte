<!-- ThemePreferences.svelte -->
<script lang="ts">
    interface Props {
        useStaticToolbarIcon: boolean;
        useStaticInPageLogo: boolean;
        onToolbarIconChange: (val: boolean) => void;
        onInPageLogoChange: (val: boolean) => void;
    }

    let {
        useStaticToolbarIcon = $bindable(),
        useStaticInPageLogo = $bindable(),
        onToolbarIconChange,
        onInPageLogoChange,
    }: Props = $props();
</script>

<div
    style="display: flex; flex-direction: column; gap: 8px; background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: 6px; padding: 12px; margin-bottom: 0px;"
>
    <div
        style="display: flex; justify-content: space-between; align-items: center;"
    >
        <div style="display: flex; align-items: center; gap: 6px;">
            <span
                style="font-weight: bold; font-size: 11.5px; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.05em;"
                >Branding Style</span
            >
            <div
                class="tooltip-wrap"
                style="cursor: help; display: inline-flex;"
            >
                <span
                    style="display: inline-flex; align-items: center; justify-content: center; background: var(--color-surface); color: var(--color-accent); border: 1px solid var(--color-border); border-radius: 50%; width: 16px; height: 16px; font-size: 10px; font-weight: bold; font-family: var(--font-mono);"
                    >i</span
                >
                <span
                    class="tooltip"
                    style="width: 280px; white-space: normal; line-height: 1.4; background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); border-radius: 6px; padding: 10px; font-weight: normal; font-size: 11px; text-transform: none; letter-spacing: normal;"
                >
                    <strong
                        style="color: var(--color-accent); display: block; margin-bottom: 4px;"
                        >Adaptive vs Classic Style</strong
                    >
                    Choose <strong>Adaptive</strong> to dynamically align the
                    extension logo and toolbar icons with your active color
                    palette, or <strong>Classic</strong> to preserve the original
                    static brand style.
                </span>
            </div>
        </div>
        <span style="font-size: 10px; color: var(--color-text-muted);"
            >Configure logo & icon appearance</span
        >
    </div>
    <div
        style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; border-top: 1px solid var(--color-border); padding-top: 8px;"
    >
        <!-- Toolbar Browser Icon -->
        <div
            style="display: flex; justify-content: space-between; align-items: center; gap: 8px;"
        >
            <span
                style="font-size: 11px; color: var(--color-text-muted); font-weight: bold;"
                >Browser Icon</span
            >
            <div
                style="display: flex; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 4px; padding: 2px; width: 120px; height: 24px; align-items: center;"
            >
                <button
                    type="button"
                    style="flex: 1; border: none; border-radius: 3px; height: 100%; font-size: 10px; font-weight: bold; cursor: pointer; transition: all 0.1s; background: {!useStaticToolbarIcon
                        ? 'var(--color-accent)'
                        : 'transparent'}; color: {!useStaticToolbarIcon
                        ? 'var(--color-accent-text)'
                        : 'var(--color-text-muted)'}; padding: 0;"
                    onclick={() => onToolbarIconChange(false)}>Adaptive</button
                >
                <button
                    type="button"
                    style="flex: 1; border: none; border-radius: 3px; height: 100%; font-size: 10px; font-weight: bold; cursor: pointer; transition: all 0.1s; background: {useStaticToolbarIcon
                        ? 'var(--color-accent)'
                        : 'transparent'}; color: {useStaticToolbarIcon
                        ? 'var(--color-accent-text)'
                        : 'var(--color-text-muted)'}; padding: 0;"
                    onclick={() => onToolbarIconChange(true)}>Classic</button
                >
            </div>
        </div>
        <!-- In-Page Logo Branding -->
        <div
            style="display: flex; justify-content: space-between; align-items: center; gap: 8px;"
        >
            <span
                style="font-size: 11px; color: var(--color-text-muted); font-weight: bold;"
                >App Logos</span
            >
            <div
                style="display: flex; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 4px; padding: 2px; width: 120px; height: 24px; align-items: center;"
            >
                <button
                    type="button"
                    style="flex: 1; border: none; border-radius: 3px; height: 100%; font-size: 10px; font-weight: bold; cursor: pointer; transition: all 0.1s; background: {!useStaticInPageLogo
                        ? 'var(--color-accent)'
                        : 'transparent'}; color: {!useStaticInPageLogo
                        ? 'var(--color-accent-text)'
                        : 'var(--color-text-muted)'}; padding: 0;"
                    onclick={() => onInPageLogoChange(false)}>Adaptive</button
                >
                <button
                    type="button"
                    style="flex: 1; border: none; border-radius: 4px; height: 100%; font-size: 10px; font-weight: bold; cursor: pointer; transition: all 0.1s; background: {useStaticInPageLogo
                        ? 'var(--color-accent)'
                        : 'transparent'}; color: {useStaticInPageLogo
                        ? 'var(--color-accent-text)'
                        : 'var(--color-text-muted)'}; padding: 0;"
                    onclick={() => onInPageLogoChange(true)}>Classic</button
                >
            </div>
        </div>
    </div>
</div>
