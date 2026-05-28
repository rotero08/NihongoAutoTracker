<!-- ThemePreview.svelte -->
<script lang="ts">
    import { parseColorToRgb, rgbToHsl } from "@/lib/ui/themes";

    interface Props {
        themeColors: Record<string, string>;
        themeName: string;
        isUnsaved: boolean;
    }

    let { themeColors, themeName, isUnsaved }: Props = $props();

    // Calculate dynamic contrast values in real-time to render accurate previews
    const parsedBackground = $derived(
        parseColorToRgb(
            themeColors.background || themeColors.background || "#07070e",
        ),
    );
    const hslBackground = $derived(
        rgbToHsl(parsedBackground.r, parsedBackground.g, parsedBackground.b),
    );
    const isBackgroundDark = $derived(hslBackground.l < 50);

    const parsedAccent = $derived(
        parseColorToRgb(themeColors.accent || "#f0b429"),
    );
    const hslAccent = $derived(
        rgbToHsl(parsedAccent.r, parsedAccent.g, parsedAccent.b),
    );
    const isAccentDark = $derived(hslAccent.l < 60);

    const previewApiGreen = $derived(isBackgroundDark ? "#3ddc84" : "#166534");
    const previewAccentText = $derived(isAccentDark ? "#ffffff" : "#09090f");
    const previewLogoText = $derived(
        isBackgroundDark ? "#f4f4f3" : themeColors.text || "#2e3440",
    );
</script>

<div
    class="preview-column"
    style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 20px; position: sticky; top: 16px; align-self: flex-start; margin-top: 36px; pointer-events: none !important; user-select: none !important; -webkit-user-select: none !important; -moz-user-select: none !important; -ms-user-select: none !important;"
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
                    <!-- Brand logo mock reflecting the calculated dynamic contrast colors -->
                    <div
                        style="width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;"
                    >
                        <svg
                            version="1.1"
                            xmlns="http://www.w3.org/2000/svg"
                            style="display: block; width: 100%; height: 100%;"
                            viewBox="0 0 1996 2000"
                            preserveAspectRatio="xMidYMid meet"
                        >
                            <defs>
                                <linearGradient
                                    id="BrandPreviewLogoGrad"
                                    gradientUnits="userSpaceOnUse"
                                    x1="886.829"
                                    y1="2067.63"
                                    x2="1050"
                                    y2="63.3125"
                                >
                                    <stop
                                        offset="0"
                                        stop-color={themeColors.accent ||
                                            "#f0b429"}
                                    />
                                    <stop
                                        offset="1"
                                        stop-color={themeColors.accentHover ||
                                            "#ffd060"}
                                    />
                                </linearGradient>
                            </defs>
                            <path
                                transform="translate(0,0)"
                                fill="url(#BrandPreviewLogoGrad)"
                                d="M 5.15169 4.91116 L 227.002 5.1235 L 303.231 4.89851 C 316.879 4.84169 330.966 4.60148 344.588 4.9931 C 349.275 5.12786 353.263 5.28615 356.291 8.67041 C 373.67 28.0987 390.237 49.7645 406.799 70.0154 L 518.649 207.361 L 864.445 633.27 C 1099.11 924.792 1331.77 1217.93 1562.38 1512.67 L 1822.26 1841.82 C 1862.82 1893.49 1907.26 1947.27 1945.73 2000 L 1386.04 2000 C 1370.28 1986.81 1338.29 1943.64 1324.29 1926.51 L 1183.25 1754.74 L 642.856 1098.9 L 479.588 899.661 L 433.947 843.861 C 420.372 827.106 408.23 811.388 393.231 795.828 C 394.003 811.198 393.317 829.088 393.277 844.767 L 393.166 932.786 L 393.036 1207.88 L 392.742 2000 L 5.7664 2000 C 3.98011 1976.53 5.21222 1942.73 5.1816 1918.26 L 5.24603 1751.57 L 5.11573 1234.05 L 5.07001 413.888 L 5.10066 140.547 C 5.11251 96.5711 3.97624 48.2916 5.15169 4.91116 z"
                            />
                            <path
                                transform="translate(1,0)"
                                fill={previewLogoText}
                                d="M 545.48 3.41642 C 618.477 4.27753 691.48 4.51709 764.481 4.13506 L 1150.38 4.14877 L 1996 3.90803 L 1996 396.493 C 1981.8 395.339 1956.31 396.056 1941.29 396.056 L 1839.74 396.112 L 1730.32 396.087 C 1710.26 396.087 1683.22 395.48 1663.63 396.889 C 1665.89 410.024 1664.9 465.901 1664.88 481.692 L 1664.76 660.017 L 1664.61 1333.11 L 1664.93 1482.65 C 1664.94 1488.35 1666.25 1509.62 1664.1 1512.99 C 1661.21 1512.36 1659.54 1510.64 1657.58 1508.56 C 1642.87 1492.9 1630.67 1473.93 1617.23 1457.12 C 1545.12 1366.97 1472.33 1276.85 1403.18 1184.44 C 1394.11 1172.31 1378.4 1158.98 1373.14 1144.8 C 1368.57 1132.48 1371.02 1021.47 1371.03 1001.99 L 1371.06 786.466 L 1371.05 540.762 C 1371.04 493.827 1370.01 443.005 1371.85 396.579 C 1324.33 395.232 1273.73 396.044 1225.87 396.05 L 975.872 396.147 C 937.262 396.177 896.37 396.925 857.95 395.899 C 846.987 387.483 840.284 376.716 831.698 365.964 C 820.535 352.246 809.511 338.415 798.627 324.474 L 689.982 187.802 C 658.188 148.24 626.619 108.499 595.277 68.5783 C 582.305 52.2313 555.273 19.8823 545.48 3.41642 z"
                            />
                            <path
                                transform="translate(-53,0)"
                                fill="url(#BrandPreviewLogoGrad)"
                                d="M 628.973 2000 C 627.156 1987.04 627.585 1963.01 627.53 1949.37 L 627.598 1861.6 L 627.485 1597.21 L 627.476 1381.39 L 627.424 1331.3 C 627.408 1325.08 626.798 1308.51 628.005 1303.25 L 629.704 1302.29 C 633.93 1303.88 651.087 1326.95 655.625 1332.53 L 717.503 1407.2 L 1209.02 2000 L 628.973 2000 z"
                            />
                        </svg>
                    </div>
                    <span
                        style="font-size: 9.5px; font-weight: bold; color: {themeColors.text};"
                        >NihongoAutoTracker</span
                    >
                    <span
                        style="font-size: 7.5px; font-weight: bold; color: {previewApiGreen} !important; border: 1px solid color-mix(in srgb, {previewApiGreen} 25%, transparent) !important; background: color-mix(in srgb, {previewApiGreen} 7%, transparent) !important; padding: 0.5px 3px; border-radius: 3px; text-transform: uppercase;"
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
                    <!-- Settings filled cog icon replica loaded inside mock popup header -->
                    <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        style="width: 12px; height: 12px; display: block; color: {themeColors.textMuted};"
                        ><path
                            d="M19.14 12.94c.04-.3.06-.61.06-.94c0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.56C14.36 2.58 14.17 2.4 13.93 2.4h-3.87c-.24 0-.43.18-.47.41L9.21 5.37c-.59.24-1.12.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.69 8.89c-.12.22-.07.47.11.61l2.03 1.58c-.05.3-.07.63-.07.94c0 .31.02.62.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.56c.04.24.24.41.47.41h3.87c.24 0 .43-.18.47-.41l.36-2.56c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.11-.61l-2.03-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6c0-1.98 1.62-3.6 3.6-3.6s3.6 1.62 3.6 3.6c0 1.98-1.62 3.6-3.6 3.6z"
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
                        style="background: {themeColors.accent}; color: {previewAccentText} !important; border: none; font-size: 7.5px; font-weight: bold; padding: 1.5px 5px; border-radius: 2px; cursor: default;"
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
                        <span
                            style="color: {previewApiGreen} !important; font-weight: bold;"
                            >✓</span
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
                    <span
                        style="color: {themeColors.textMuted}; cursor: default; display: inline-flex; align-items: center; justify-content: center; width: 12px; height: 12px;"
                    >
                        <!-- Standard filled gear Settings cog icon replica -->
                        <svg
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            style="width: 12px; height: 12px;"
                            ><path
                                d="M19.14 12.94c.04-.3.06-.61.06-.94c0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.56C14.36 2.58 14.17 2.4 13.93 2.4h-3.87c-.24 0-.43.18-.47.41L9.21 5.37c-.59.24-1.12.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.69 8.89c-.12.22-.07.47.11.61l2.03 1.58c-.05.3-.07.63-.07.94c0 .31.02.62.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.56c.04.24.24.41.47.41h3.87c.24 0 .43-.18.47-.41l.36-2.56c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.11-.61l-2.03-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6c0-1.98 1.62-3.6 3.6-3.6s3.6 1.62 3.6 3.6c0 1.98-1.62 3.6-3.6 3.6z"
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
