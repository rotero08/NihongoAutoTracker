<!--
  ── SearchDropdown.svelte ────────────────────────────────────────────────────
  AniList search dropdown for reading queue items.
  Shows search results when the user types in the title field.
-->
<script lang="ts">
  import { searchAniList, type AniListSearchResult } from "@/lib/api/anilist";
  import { searchMedia } from "@/lib/api/nihongotracker";

  /** Whether the dropdown is open */
  let open = $state(false);
  /** Search results */
  let results: AniListSearchResult[] = $state([]);
  /** Loading state */
  let loading = $state(false);
  /** Error state */
  let error = $state(false);

  // Tracks the last query to prevent late-returning network requests
  let activeQueryToken = $state(0);

  /** Callback when a result is selected */
  interface Props {
    onSelect: (result: AniListSearchResult) => void;
    searchType?: "reading" | "anime" | "movie" | "tv_show";
    onMouseDown?: () => void;
  }
  let { onSelect, searchType = "reading", onMouseDown }: Props = $props();

  /** Execute a search query */
  export async function search(query: string) {
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
        searchType !== "reading"
          ? normalizeMediaResults(await searchMedia({ search: query, type: searchType, perPage: 5 }))
          : await searchAniList(query, 5);

      // Guard clause: Discard if a newer search query has already been executed
      if (currentToken !== activeQueryToken) return;

      results = searchResults;
      loading = false;
      if (results.length === 0) results = [];
    } catch {
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

  function handleSelect(r: AniListSearchResult, e: MouseEvent) {
    e.preventDefault();
    onSelect(r);
    close();
  }

  function normalizeMediaResults(results: any[]): AniListSearchResult[] {
    return results.map((media) => ({
      contentId: media.contentId ?? media.id ?? media._id,
      title: {
        contentTitleNative: media.title?.contentTitleNative ?? media.contentTitleNative,
        contentTitleEnglish:
          media.title?.contentTitleEnglish ??
          media.contentTitleEnglish ??
          (typeof media.title === "string" ? media.title : undefined),
        contentTitleRomaji:
          media.title?.contentTitleRomaji ??
          media.contentTitleRomaji ??
          (typeof media.title === "string" ? media.title : undefined),
      },
      contentTitleNative: media.title?.contentTitleNative ?? media.contentTitleNative,
      contentTitleEnglish:
        media.title?.contentTitleEnglish ??
        media.contentTitleEnglish ??
        (typeof media.title === "string" ? media.title : undefined),
      contentTitleRomaji:
        media.title?.contentTitleRomaji ??
        media.contentTitleRomaji ??
        (typeof media.title === "string" ? media.title : undefined),
      coverImage: media.coverImage ?? media.contentImage ?? media.poster,
      contentImage: media.contentImage ?? media.coverImage ?? media.poster,
      chapters: media.chapters,
      volumes: media.volumes,
    }));
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
