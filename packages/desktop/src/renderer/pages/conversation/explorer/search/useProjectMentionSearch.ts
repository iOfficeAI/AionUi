/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The `@`-mention side of project filename search: resolves the current
 * project's pe roots, and while the mention menu is open drives `fs/search` from
 * the live query (debounced; the backend supersedes the prior in-flight search),
 * exposing the ranked hits as send-box items carrying their `project` chat-ref.
 *
 * `active` is the DEFENSIVE gate the send box reads to choose its data source. It
 * is NOT "project vs no-project" — every conversation ends up project-bound, but
 * the roots are not guaranteed resolvable at the instant `@` is typed: (1) a
 * workspace conversation's `project_id` is lazily backfilled server-side (the
 * first GET can be null until a `conversation.listChanged` refetch populates it,
 * see pages/conversation/index.tsx §backfill); (2) even once set,
 * `useProjectSearchRoots` resolves roots via an async `project.get`. While roots
 * are unresolved `active` is false and the caller falls back to the legacy
 * workspace flat-list; once they arrive this hook drives fs/search. That window
 * is also why `list_workspace_files` can't be removed yet.
 */

import { useEffect, useMemo } from 'react';

import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

import { type PeNameMap, searchHitToMentionItem } from './searchModel';
import { MENTION_SEARCH_OWNER } from './searchStore';
import { useFileSearch } from './useFileSearch';
import { useProjectSearchRoots } from './useProjectSearchRoots';

export type ProjectMentionSearch = {
  /** True when the project's pe roots are resolved → `@` streams from fs/search.
   *  False during the loading window → the caller uses its legacy fallback. */
  active: boolean;
  /** Ranked hits mapped to send-box items (project chat-ref), capped to `limit`.
   *  Empty when inactive. */
  items: FileOrFolderItem[];
  /** True while the fs/search stream is in flight (drives the menu's loading UI). */
  loading: boolean;
  /** pe_id → folder name for the `PE · REL` secondary label (multi-folder). */
  peNames: PeNameMap;
};

export const useProjectMentionSearch = ({
  query,
  isOpen,
  limit,
}: {
  query: string;
  isOpen: boolean;
  limit: number;
}): ProjectMentionSearch => {
  const { roots, peNames } = useProjectSearchRoots();
  const active = roots.length > 0;
  const { view, runSearch, cancel } = useFileSearch(MENTION_SEARCH_OWNER, roots);
  // Render results only while this skin owns the shared stream — if the search
  // panel took over, our view is showing its results, so suppress them here.
  const owned = view.owner === MENTION_SEARCH_OWNER;

  // Drive the stream from the live query while the menu is open; cancel on close
  // so a stale search does not linger. When roots arrive mid-open (`active`
  // flips true), this re-fires and issues the first search.
  useEffect(() => {
    if (!active) return;
    if (isOpen) {
      runSearch(query);
    } else {
      cancel();
    }
  }, [active, isOpen, query, runSearch, cancel]);

  const items = useMemo<FileOrFolderItem[]>(
    () => (active && owned ? view.hits.slice(0, limit).map(searchHitToMentionItem) : []),
    [active, owned, limit, view.hits]
  );

  return { active, items, loading: active && owned && view.status === 'searching', peNames };
};
