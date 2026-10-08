<!--
  ── SearchDropdown.svelte ────────────────────────────────────────────────────
  Catalogue search dropdown for queue items: AniList novels/manga for reading
  items, and anime, TV shows or movies for watched ones.
  Shows search results when the user types in the title field.
-->
<script lang="ts">
  import { searchAniList } from "@/lib/api/anilist";
  import { searchMedia, type MediaSearchResult } from "@/lib/api/nihongotracker";
  import type { WatchSearchType } from "@/lib/utils/media-type";

  type SearchType = "reading" | WatchSearchType;

  /** Whether the dropdown is open */
  let open = $state(false);
  /** Search results */
  let results: MediaSearchResult[] = $state([]);
  /** Loading state */
  let loading = $state(false);
  /** Error state */
  let error = $state(false);

  // Dynamic orientation bounds checker
  let dropdownEl = $state<HTMLDivElement | undefined>(undefined);
  let renderUpwards = $state(false);

  // Tracks the last query to prevent late-returning network requests
  let activeQueryToken = $state(0);

  /** Callback when a result is selected */
  interface Props {
    onSelect: (result: MediaSearchResult) => void;
    searchType?: SearchType;
    onMouseDown?: () => void;
  }
  let { onSelect, searchType = "reading", onMouseDown }: Props = $props();

  $effect(() => {
    if (open && dropdownEl) {
      const rect = dropdownEl.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      // Flip layout if search results clip beyond screen limits or viewport bottom
      if (rect.bottom > viewportHeight || (viewportHeight - rect.top < rect.height)) {
        renderUpwards = true;
      } else {
        renderUpwards = false;
      }
    }
  });

  /**
   * Execute a search query.
   *
   * @param type - Catalogue to search. Defaults to the `searchType` prop; pass it
   *   explicitly right after changing an item's type, before the prop has caught up.
   */
  export async function search(query: string, type: SearchType = searchType) {
    if (query.length < 2) {
      open = false;
      return;
    }

    // Generate a unique token for the current query
    const currentToken = ++activeQueryToken;

    loading = true;
    error = false;
    open = true;

    try {
      const searchResults =
        type !== "reading"
          ? await searchMedia({ search: query, type, perPage: 5 })
          : await searchAniList(query, 5);

      // Guard clause: Discard if a newer search query has already been executed
      if (currentToken !== activeQueryToken) return;

      results = searchResults;
      loading = false;
    } catch {
      // Shown to the user as "Failed" in the dropdown itself.
      if (currentToken !== activeQueryToken) return;
      error = true;
      loading = false;
    }
  }

  /** Close the dropdown and invalidate active requests */
  export function close() {
    open = false;
    activeQueryToken++; // Invalidate any running network callbacks
  }

  /** Show existing results */
  export function showIfHasResults() {
    if (results.length > 0) open = true;
  }

  function handleSelect(r: MediaSearchResult, e: MouseEvent) {
    e.preventDefault();
    onSelect(r);
    close();
  }

  /** Second line of a result: tells apart entries that share a native title. */
  function getSubtitle(r: MediaSearchResult): string {
    const primary = r.contentTitleNative;
    const alternate = [r.contentTitleEnglish, r.contentTitleRomaji].find((t) => t && t !== primary) ?? "";
    const episodes = r.episodes ? `${r.episodes} ep` : "";
    return [alternate, episodes].filter(Boolean).join(" \u2022 ");
  }
</script>

{#if open}
  <div class="dropdown" class:upwards={renderUpwards} bind:this={dropdownEl}>
    {#if loading}
      <div class="dropdown-msg">Searching...</div>
    {:else if error}
      <div class="dropdown-msg err">Failed</div>
    {:else if results.length === 0}
      <div class="dropdown-msg">No results</div>
    {:else}
      {#each results as r}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="search-item" onmousedown={(e) => {
          onMouseDown?.();
          handleSelect(r, e);
        }}>
          {#if r.coverImage || r.contentImage}
            <img class="cover" src={r.coverImage || r.contentImage} alt="" />
          {:else}
            <div class="cover placeholder"></div>
          {/if}
          <div class="info">
            <div class="title">
              {r.contentTitleNative || r.contentTitleEnglish || r.contentTitleRomaji || "Unknown"}
            </div>
            {#if getSubtitle(r)}
              <div class="subtitle">{getSubtitle(r)}</div>
            {/if}
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
  .dropdown.upwards {
    top: auto;
    bottom: calc(100% + 4px);
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.8);
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
  .subtitle {
    font-size: 10px;
    color: var(--color-text-muted, #7a8ca5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
