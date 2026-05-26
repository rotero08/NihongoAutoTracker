<script lang="ts">
    interface Option {
        value: string;
        label: string;
    }

    interface Props {
        options: Option[];
        value: string;
        onChange: (val: string) => void;
        label?: string;
        compact?: boolean;
    }

    let { options, value, onChange, label, compact = false }: Props = $props();
    let isOpen = $state(false);
    let activeOption = $derived(
        options.find((o) => o.value === value) || options[0],
    );

    function selectOption(val: string) {
        onChange(val);
        isOpen = false;
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
                    <button
                        type="button"
                        class="select-option"
                        class:selected={opt.value === value}
                        onclick={() => selectOption(opt.value)}
                    >
                        {opt.label}
                    </button>
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
    .select-option:hover {
        background: rgba(255, 255, 255, 0.05);
        color: var(--color-accent);
    }
    .select-option.selected {
        /* Mapped selection background dynamically to your active theme accent color */
        background: color-mix(in srgb, var(--color-accent) 12%, transparent);
        color: var(--color-accent);
        font-weight: bold;
    }

    /* --- COMPACT SWITCHER OVERRIDES (Popup) --- */
    .custom-select-container.compact .select-trigger {
        padding: 5px 8px;
        font-size: 11px;
        border-radius: 3px;
    }
    .custom-select-container.compact .select-option {
        padding: 6px 8px;
        font-size: 11px;
    }
    .custom-select-container.compact .select-label {
        font-size: 9px;
    }
</style>
