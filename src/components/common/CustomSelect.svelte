<script lang="ts">
    interface Option {
        value: string;
        label: string;
    }

    interface Props {
        options: Option[];
        value: string;
        onChange: (val: string) => void;
        onDelete?: (val: string) => void;
        deletableValues?: string[];
        label?: string;
        compact?: boolean;
    }

    let {
        options,
        value,
        onChange,
        onDelete,
        deletableValues = [],
        label,
        compact = false,
    }: Props = $props();
    let isOpen = $state(false);
    let activeOption = $derived(
        options.find((o) => o.value === value) || options[0],
    );

    function selectOption(val: string) {
        onChange(val);
        isOpen = false;
    }

    function isDeletable(val: string): boolean {
        return deletableValues.includes(val);
    }

    let container: HTMLDivElement;
    function handleWindowClick(e: MouseEvent) {
        if (container && !container.contains(e.target as Node)) {
            isOpen = false;
        }
    }
</script>

<svelte:window onclick={handleWindowClick} />

<div class="custom-select-container" class:compact bind:this={container}>
    {#if label}
        <span class="select-label">{label}</span>
    {/if}
    <div class="select-trigger-wrap">
        <button
            type="button"
            class="select-trigger"
            onclick={() => (isOpen = !isOpen)}
        >
            <span>{activeOption?.label || ""}</span>
            <svg class="chevron" class:open={isOpen} viewBox="0 0 12 8"
                ><polyline
                    points="1,1 6,7 11,1"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                /></svg
            >
        </button>

        {#if isOpen}
            <div class="select-dropdown">
                {#each options as opt}
                    {#if onDelete && isDeletable(opt.value)}
                        <div
                            class="select-option-row"
                            class:selected={opt.value === value}
                        >
                            <button
                                type="button"
                                class="select-option"
                                onclick={() => selectOption(opt.value)}
                            >
                                {opt.label}
                            </button>
                            <button
                                type="button"
                                class="select-delete"
                                title="Delete theme"
                                aria-label={`Delete ${opt.label}`}
                                onclick={(e) => {
                                    e.stopPropagation();
                                    isOpen = false;
                                    onDelete?.(opt.value);
                                }}
                            >
                                ×
                            </button>
                        </div>
                    {:else}
                        <button
                            type="button"
                            class="select-option"
                            class:selected={opt.value === value}
                            onclick={() => selectOption(opt.value)}
                        >
                            {opt.label}
                        </button>
                    {/if}
                {/each}
            </div>
        {/if}
    </div>
</div>

<style>
    .custom-select-container {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: 100%;
        position: relative;
    }
    .select-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }
    .select-trigger-wrap {
        position: relative;
        width: 100%;
    }
    .select-trigger {
        width: 100%;
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: 4px;
        color: var(--color-text);
        font-family: var(--font-mono);
        font-size: 13px;
        padding: 10px 12px;
        outline: none;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        text-align: left;
        transition:
            border-color 0.15s,
            background 0.15s;
    }
    .select-trigger:focus,
    .select-trigger:hover {
        border-color: var(--color-accent);
    }
    .chevron {
        width: 10px;
        height: 6px;
        transition: transform 0.2s;
        color: var(--color-text-muted);
    }
    .chevron.open {
        transform: rotate(180deg);
    }
    .select-dropdown {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        width: 100%;
        background: var(--color-surface);
        border: 1px solid var(--color-border-hover);
        border-radius: 4px;
        z-index: 100000; /* Floats above compact popover containers securely */
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.6);
        overflow: hidden;
    }
    .select-option-row {
        display: flex;
        align-items: center;
        width: 100%;
    }
    .select-option {
        background: none;
        border: none;
        color: var(--color-text);
        padding: 10px 12px;
        font-family: var(--font-mono);
        font-size: 13px;
        text-align: left;
        cursor: pointer;
        transition:
            background 0.15s,
            color 0.15s;
        width: 100%;
    }
    .select-option-row .select-option {
        flex: 1;
        min-width: 0;
        width: auto;
    }
    .select-option:hover {
        background: rgba(255, 255, 255, 0.05);
    }
    .select-option-row:hover {
        background: rgba(255, 255, 255, 0.05);
    }
    .select-option-row:hover .select-option {
        background: transparent;
    }
    .select-option:hover {
        color: var(--color-accent);
    }
    .select-option-row:hover .select-option {
        color: var(--color-accent);
    }
    .select-option.selected,
    .select-option-row.selected {
        background: color-mix(in srgb, var(--color-accent) 12%, transparent);
    }
    .select-option.selected,
    .select-option-row.selected .select-option {
        color: var(--color-accent);
        font-weight: bold;
    }
    .select-delete {
        width: 28px;
        min-height: 34px;
        align-self: stretch;
        background: transparent;
        border: none;
        color: var(--color-text-muted);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: bold;
        line-height: 1;
        transition: color 0.15s;
    }
    .select-delete:hover {
        color: var(--color-error, #ef4444);
    }

    /* --- COMPACT SWITCHER OVERRIDES (Popup Settings Dropdown List styling) --- */
    .custom-select-container.compact .select-trigger {
        padding: 4px 0 !important;
        font-size: 11px !important;
        border-radius: 0 !important;
        background: transparent !important;
        border: none !important;
        border-bottom: 1.5px solid transparent !important;
        box-shadow: none !important;
    }
    .custom-select-container.compact .select-trigger:hover,
    .custom-select-container.compact .select-trigger:focus {
        border-bottom-color: var(--color-accent) !important;
    }
    .custom-select-container.compact .select-option {
        padding: 6px 8px;
        font-size: 11px;
    }
    .custom-select-container.compact .select-label {
        font-size: 9px;
    }
</style>
