<!-- ThemePreview.svelte -->
<script lang="ts">
    interface Props {
        themeColors: Record<string, string>;
        themeName: string;
        isUnsaved: boolean;
    }

    let { themeColors, themeName, isUnsaved }: Props = $props();
</script>

<div
    class="preview-column"
    style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 20px; position: sticky; top: 16px; align-self: flex-start; margin-top: 36px;"
>
    <!-- Global Custom Theme Mock NAT Popup Preview -->
    <div
        style="display: flex; flex-direction: column; gap: 10px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; padding: 14px; width: 340px;"
    >
        <div
            style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: var(--color-text-muted); letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center; font-family: var(--font-sans);"
        >
            <span>NAT POPUP PREVIEW ({themeName || "Custom Theme"})</span>
            {#if isUnsaved}
                <span
                    style="font-size: 9px; color: var(--color-accent); font-family: var(--font-mono); font-weight: normal;"
                    >● UNSAVED</span
                >
            {/if}
        </div>

        <!-- Mini Mock Popup container styled with themeColors -->
        <div
            style="background: {themeColors.background}; border: 1px solid {themeColors.border}; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.4); text-align: left; font-family: var(--font-mono); line-height: 1.35; overflow: hidden; width: 100%;"
        >
            <!-- Header mockup -->
            <div
                style="display: flex; justify-content: space-between; align-items: center; color: {themeColors.textMuted};"
            >
                <div style="display: flex; align-items: center; gap: 6px;">
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={themeColors.accent}
                        stroke-width="2.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        style="display: block;"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <path
                            d="M12 18a6 6 0 1 0 0-12v12z"
                            fill={themeColors.accent}
                        />
                    </svg>
                    <span
                        style="font-size: 9.5px; font-weight: bold; color: {themeColors.text};"
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
                style="height: 1px; background: {themeColors.border}; margin: 2px 0;"
            ></div>

            <!-- Queue Control Row mockup -->
            <div
                style="display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; font-weight: bold;"
            >
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span
                        style="color: {themeColors.textMuted}; letter-spacing: 0.05em;"
                        >QUEUE</span
                    >
                    <span
                        style="background: color-mix(in srgb, {themeColors.accent} 10%, transparent); color: {themeColors.accent}; border: 1px solid color-mix(in srgb, {themeColors.accent} 22%, transparent); border-radius: 6px; padding: 0.5px 3.5px;"
                        >5</span
                    >
                </div>
                <div style="display: flex; gap: 4px;">
                    <button
                        style="background: {themeColors.accent}; color: {themeColors.background}; border: none; font-size: 7.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2px; cursor: default;"
                        >Send All</button
                    >
                    <button
                        style="background: transparent; color: {themeColors.textMuted}; border: 1px solid {themeColors.border}; font-size: 7.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2px; cursor: default;"
                        >Clear</button
                    >
                </div>
            </div>

            <!-- Tabs mockup -->
            <div style="display: flex; gap: 4px;">
                <span
                    style="font-size: 8.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2.5px; background: color-mix(in srgb, {themeColors.accent} 10%, transparent); color: {themeColors.accent}; border: 1px solid color-mix(in srgb, {themeColors.accent} 30%, transparent);"
                    >All</span
                >
                <span
                    style="font-size: 8.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2.5px; border: 1px solid {themeColors.border}; color: {themeColors.textMuted};"
                    >Video</span
                >
                <span
                    style="font-size: 8.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2.5px; border: 1px solid {themeColors.border}; color: {themeColors.textMuted};"
                    >Reading</span
                >
            </div>

            <!-- Queue Book Item mockup -->
            <div
                style="background: {themeColors.surface}; border: 1px solid {themeColors.border}; border-radius: 4px; padding: 8px; display: flex; flex-direction: column; gap: 4px;"
            >
                <div
                    style="display: flex; justify-content: space-between; align-items: center;"
                >
                    <span
                        style="font-size: 10px; font-weight: bold; color: {themeColors.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 140px;"
                        >転生したらスライムだった件</span
                    >
                    <div
                        style="display: flex; gap: 4px; font-size: 9px; color: {themeColors.textMuted};"
                    >
                        <span style="color: #3ddc84; font-weight: bold;">✓</span
                        >
                        <span>×</span>
                    </div>
                </div>
                <div style="font-size: 8.5px; color: {themeColors.textMuted};">
                    <strong style="color: {themeColors.accent};">18500</strong>
                    chars •
                    <strong style="color: {themeColors.text};">90</strong> min •
                    <strong style="color: {themeColors.accent};">3</strong> vol •
                    TTU Reader
                </div>
                <div
                    style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;"
                >
                    <span
                        style="font-size: 8px; color: {themeColors.textMuted}; display: flex; align-items: center; gap: 3px;"
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
                            /><line x1="16" y1="2" x2="16" y2="6" /><line
                                x1="8"
                                y1="2"
                                x2="8"
                                y2="6"
                            /><line x1="3" y1="10" x2="21" y2="10" /></svg
                        >
                    </span>
                    <button
                        style="background: color-mix(in srgb, {themeColors.accent} 10%, transparent); color: {themeColors.accent}; border: 1px solid color-mix(in srgb, {themeColors.accent} 22%, transparent); font-size: 7.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2px; cursor: default;"
                        >Send</button
                    >
                </div>

                <!-- Sessions list replica -->
                <div
                    style="border-top: 1px solid {themeColors.border}; margin-top: 4px; padding-top: 4px;"
                >
                    <div
                        style="font-size: 8.5px; font-weight: bold; color: {themeColors.textMuted}; margin-bottom: 2px;"
                    >
                        ▼ Sessions (3)
                    </div>
                    <div
                        style="display: flex; flex-direction: column; gap: 2px; font-size: 8px; color: {themeColors.textMuted};"
                    >
                        <div
                            style="display: flex; justify-content: space-between;"
                        >
                            <span
                                >• <span
                                    style="color: color-mix(in srgb, {themeColors.accent} 60%, transparent); font-weight: bold;"
                                    >S1</span
                                >
                                <strong style="color: {themeColors.accent};"
                                    >8200</strong
                                >
                                chars •
                                <strong style="color: {themeColors.text};"
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
                                    /><line x1="8" y1="2" x2="8" y2="6" /><line
                                        x1="3"
                                        y1="10"
                                        x2="21"
                                        y2="10"
                                    /></svg
                                >
                                <span style="color: var(--color-error);">×</span
                                >
                            </span>
                        </div>
                        <div
                            style="display: flex; justify-content: space-between;"
                        >
                            <span
                                >• <span
                                    style="color: color-mix(in srgb, {themeColors.accent} 60%, transparent); font-weight: bold;"
                                    >S2</span
                                >
                                <strong style="color: {themeColors.accent};"
                                    >4100</strong
                                >
                                chars •
                                <strong style="color: {themeColors.text};"
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
                                    /><line x1="8" y1="2" x2="8" y2="6" /><line
                                        x1="3"
                                        y1="10"
                                        x2="21"
                                        y2="10"
                                    /></svg
                                >
                                <span style="color: var(--color-error);">×</span
                                >
                            </span>
                        </div>
                        <div
                            style="display: flex; justify-content: space-between;"
                        >
                            <span
                                >• <span
                                    style="color: color-mix(in srgb, {themeColors.accent} 60%, transparent); font-weight: bold;"
                                    >S3</span
                                >
                                <strong style="color: {themeColors.accent};"
                                    >6200</strong
                                >
                                chars •
                                <strong style="color: {themeColors.text};"
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
                                    /><line x1="8" y1="2" x2="8" y2="6" /><line
                                        x1="3"
                                        y1="10"
                                        x2="21"
                                        y2="10"
                                    /></svg
                                >
                                <span style="color: var(--color-error);">×</span
                                >
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Bottom Settings action -->
            <button
                style="width: 100%; background: none; color: {themeColors.textMuted}; border: 1px solid {themeColors.border}; border-radius: 4px; padding: 4px; font-size: 8.5px; font-weight: bold; cursor: default;"
                >Open Settings</button
            >
        </div>
    </div>

    <!-- Custom Override Overlay Preview -->
    <div
        style="display: flex; flex-direction: column; gap: 10px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; padding: 14px; width: 340px;"
    >
        <div
            style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: var(--color-text-muted); letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center; font-family: var(--font-sans);"
        >
            <span>READER OVERLAY PREVIEW ({themeName || "Custom Theme"})</span>
            {#if isUnsaved}
                <span
                    style="font-size: 9px; color: var(--color-accent); font-family: var(--font-mono); font-weight: normal;"
                    >● UNSAVED</span
                >
            {/if}
        </div>

        <!-- Mini Mock Reader Page + Floating status bar mockup styled with themeColors -->
        <!-- Calculated theme dark background: 65% themeColors.background mixed with deep dark #05050a to fit better and avoid being too dark -->
        <div
            style="background: color-mix(in srgb, {themeColors.background} 65%, #05050a); border-radius: 6px; padding: 16px 12px; text-align: center; border: 1px solid var(--color-border); position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; width: 100%; font-family: var(--font-sans);"
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
                style="background: {themeColors.surface}; border: 1px solid {themeColors.border}; border-radius: 4px; padding: 3px 6px; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); font-family: var(--font-mono); line-height: 1; z-index: 2; align-self: center;"
            >
                <span
                    style="color: {themeColors.textMuted}; font-size: 9px; cursor: default;"
                    >⠿</span
                >
                <span
                    style="color: {themeColors.accent}; font-size: 10px; font-weight: bold; font-variant-numeric: tabular-nums;"
                    >15:32</span
                >
                <span
                    style="color: {themeColors.textMuted}; font-size: 10px; cursor: default;"
                    >⏸</span
                >
                <span
                    style="color: {themeColors.textMuted}; font-size: 10px; cursor: default; display: flex; align-items: center; justify-content: center; width: 10px; height: 10px;"
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
                    style="color: {themeColors.textMuted}; font-size: 10px; cursor: default;"
                    >×</span
                >
            </div>

            <!-- Progress Dashboard mockup inside reader view -->
            <div
                style="background: {themeColors.background}; border: 1px solid {themeColors.border}; border-radius: 5px; padding: 10px; display: flex; flex-direction: column; gap: 8px; width: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.4); text-align: center;"
            >
                <div>
                    <div
                        style="font-size: 8px; font-weight: bold; color: {themeColors.textMuted}; letter-spacing: 0.05em; text-transform: uppercase;"
                    >
                        Current Session
                    </div>
                    <div
                        style="display: flex; justify-content: space-around; margin-top: 4px; font-size: 8.5px; color: {themeColors.textMuted};"
                    >
                        <div>
                            Time
                            <div
                                style="font-size: 12px; font-weight: bold; color: {themeColors.text}; margin-top: 1px; font-family: var(--font-mono);"
                            >
                                0:00
                            </div>
                        </div>
                        <div>
                            Chars
                            <div
                                style="font-size: 12px; font-weight: bold; color: {themeColors.text}; margin-top: 1px; font-family: var(--font-mono);"
                            >
                                0
                            </div>
                        </div>
                        <div>
                            Speed
                            <div
                                style="font-size: 12px; font-weight: bold; color: {themeColors.text}; margin-top: 1px; font-family: var(--font-mono);"
                            >
                                0/h
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    style="display: flex; justify-content: center; gap: 14px; font-size: 11px; color: {themeColors.textMuted};"
                >
                    <span
                        style="color: {themeColors.textMuted}; cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                    >
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="currentColor"><path d="M8 5v14l11-7z" /></svg
                        >
                    </span>
                    <span
                        style="color: {themeColors.textMuted}; cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
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
                        style="color: {themeColors.accent}; cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
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
                        style="color: {themeColors.accent}; cursor: default; display: flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
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
                    style="background: color-mix(in srgb, {themeColors.success} 5%, {themeColors.surface}); border: 1px solid color-mix(in srgb, {themeColors.success} 25%, transparent); border-radius: 4px; padding: 6px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; text-align: left; width: 100%;"
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
                            style="color: {themeColors.success}; flex-shrink: 0;"
                        >
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span
                            style="color: {themeColors.success}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; font-weight: bold;"
                            >無職転生 ~異世界行ったら...</span
                        >
                    </div>
                    <span
                        style="color: {themeColors.accent}; font-weight: bold; white-space: nowrap;"
                        >Vol 1 <span
                            style="color: #f0706a; margin-left: 4px; font-weight: bold; cursor: default;"
                            >×</span
                        ></span
                    >
                </div>

                <div
                    style="border-top: 1px dashed {themeColors.border}; padding-top: 6px;"
                >
                    <div
                        style="font-size: 8px; font-weight: bold; color: {themeColors.textMuted}; letter-spacing: 0.05em; text-transform: uppercase;"
                    >
                        Total Book Progress
                    </div>
                    <div
                        style="display: flex; justify-content: space-around; margin-top: 4px; font-size: 8.5px; color: {themeColors.textMuted};"
                    >
                        <div>
                            Total Time
                            <div
                                style="font-size: 10px; font-weight: bold; color: {themeColors.accent}; margin-top: 1px;"
                            >
                                12m
                            </div>
                        </div>
                        <div>
                            Total Chars
                            <div
                                style="font-size: 10px; font-weight: bold; color: {themeColors.accent}; margin-top: 1px;"
                            >
                                0
                            </div>
                        </div>
                        <div>
                            Avg Speed
                            <div
                                style="font-size: 10px; font-weight: bold; color: {themeColors.accent}; margin-top: 1px;"
                            >
                                0/h
                            </div>
                        </div>
                    </div>
                </div>

                <!-- past sessions history details mockup -->
                <div
                    style="border-top: 1px solid {themeColors.border}; margin-top: 6px; padding-top: 6px; text-align: left;"
                >
                    <details open style="cursor: pointer; user-select: none;">
                        <summary
                            style="font-size: 11px; font-weight: bold; color: {themeColors.textMuted}; display: flex; align-items: center; gap: 4px; outline: none; list-style: none; white-space: nowrap !important;"
                        >
                            <span
                                style="font-size: 9px; color: {themeColors.textMuted}; flex-shrink: 0;"
                                >▼</span
                            > Past Sessions History
                        </summary>
                        <div
                            style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;"
                        >
                            <div
                                style="display: flex; align-items: center; justify-content: space-between; background: {themeColors.surfaceAlt ||
                                    themeColors.surface}; padding: 6px 8px; border-radius: 4px; font-size: 11px; color: {themeColors.text}; white-space: nowrap !important;"
                            >
                                <span style="color: {themeColors.textMuted};"
                                    >24 May</span
                                >
                                <span
                                    style="font-weight: bold; color: {themeColors.accent}; margin: 0 4px;"
                                    >12m</span
                                >
                                <span
                                    style="color: {themeColors.textMuted}; font-family: var(--font-mono); flex: 1; text-align: right; margin-right: 6px;"
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
                    style="color: {themeColors.accent}; font-size: 14px; cursor: default;"
                    >▶</span
                >
            </div>
        </div>
    </div>
</div>
