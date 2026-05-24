<!--
  ── SearchDropdown.svelte ────────────────────────────────────────────────────
  AniList search dropdown for reading queue items.
  Shows search results when the user types in the title field.
-->
<script lang="ts">
  import { searchAniList, type AniListSearchResult } from "@/lib/api/anilist";
  import { escapeHtml } from "@/lib/utils/text-parsing";

  /** Whether the dropdown is open */
  let open = $state(false);
  /** Search results */
  let results: AniListSearchResult[] = $state([]);
  /** Loading state */
  let loading = $state(false);
  /** Error state */
  let error = $state(false);

  /** Callback when a result is selected */
  interface Props {
    onSelect: (result: AniListSearchResult) => void;
  }
  let { onSelect }: Props = $props();

  /** Execute a search query */
  export async function search(query: string) {
    if (query.length < 2) {
      open = false;
      return;
    }
    loading = true;
    error = false;
    open = true;
    try {
      results = await searchAniList(query, 5);
      loading = false;
      if (results.length === 0) results = [];
    } catch {
      error = true;
      loading = false;
    }
  }

  /** Close the dropdown */
  export function close() {
    open = false;
  }

  /** Show existing results */
  export function showIfHasResults() {
    if (results.length > 0) open = true;
  }

  function handleSelect(r: AniListSearchResult, e: MouseEvent) {
    e.preventDefault();
    onSelect(r);
    open = false;
  }
</script>

{#if open}
  <div class="dropdown">
    {#if loading}
      <div class="dropdown-msg">Searching...</div>
    {:else if error}
      <div class="dropdown-msg err">Failed</div>
    {:else if results.length === 0}
      <div class="dropdown-msg">No results</div>
    {:else}
      {#each results as r}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="search-item" onmousedown={(e) => handleSelect(r, e)}>
          {#if r.coverImage || r.contentImage}
            <img class="cover" src={r.coverImage || r.contentImage} alt="" />
          {:else}
            <div class="cover placeholder"></div>
          {/if}
          <div class="info">
            <div class="title">
              {r.title?.contentTitleNative || r.contentTitleNative || "Unknown"}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
{/if}

<style>
  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    width: 100%;
    background: var(--color-surface-alt, #13131f);
    border: 1px solid var(--color-border-hover, #242d42);
    border-radius: 4px;
    z-index: 100;
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.8);
  }
  .dropdown-msg {
    padding: 6px;
    text-align: center;
    font-size: 11px;
    color: var(--color-text-dimmed, #3a4a60);
  }
  .dropdown-msg.err {
    color: var(--color-error, #f0706a);
  }
  .search-item {
    display: flex;
    gap: 8px;
    padding: 6px;
    border-bottom: 1px solid var(--color-border, #1c2333);
    cursor: pointer;
    transition: background 0.15s;
  }
  .search-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .cover {
    width: 24px;
    height: 36px;
    object-fit: cover;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .cover.placeholder {
    background: var(--color-border-hover, #242d42);
  }
  .info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
  }
  .title {
    font-size: 11px;
    font-weight: bold;
    color: var(--color-text, #dde4f0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
