/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure model for project filename search (see `formal/runtime/search.md`). No
 * I/O, no WS, no React — the hit shape plus the front-end ranking that orders
 * the backend-bounded hit set. Everything here is a pure function so it can be
 * unit-tested in isolation; the store wires it to the MonitorClient stream.
 *
 * Engine split (search.md §引擎): the backend filters while walking the tree and
 * only pushes hits on the wire (traffic bounded by hit count, not tree size);
 * the front-end does only the final fuzzy ranking over that already-bounded set.
 */

import { projectFileRef } from '@/common/types/chatFile';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

/**
 * One filename-search hit as delivered by `fs/searchMatch` (protocol.md). It is
 * exactly the chat-ref `project` identity — a hit can go straight into a chat
 * message's `files` via `projectFileRef(pe_id, relative_path)` with no
 * conversion (search.md §身份与 chat-ref 相通).
 */
export type SearchHit = {
  pe_id: string;
  relative_path: string;
  name: string;
};

/**
 * Adapt a search hit to a send-box selection item carrying its `project`
 * chat-ref. This is the search→add-to-chat "zero conversion" bridge: the item's
 * `chatRef` is sent verbatim and the backend resolves `{pe_id, relative_path}`
 * at the edge — the front-end builds no absolute path (search.md §身份与
 * chat-ref 相通; see `messageFiles.collectChatFileRefs`). Pure — no absolute
 * path is known front-end side, so `path`/`relativePath` carry the relative path.
 */
export const searchHitToMentionItem = (hit: SearchHit): FileOrFolderItem => ({
  path: hit.relative_path,
  name: hit.name,
  isFile: true,
  relativePath: hit.relative_path,
  chatRef: projectFileRef(hit.pe_id, hit.relative_path),
});

/** Stable identity of a hit across pe roots: `pe_id` + NUL + `relative_path`. */
export const searchHitKey = (hit: SearchHit): string => `${hit.pe_id}\0${hit.relative_path}`;

/** pe_id → human folder name (from the project's roots / explorer metadata). */
export type PeNameMap = Record<string, string>;

/**
 * Secondary label for a hit, VS Code-style: `PE_NAME · REL_PATH` when the pe's
 * folder name is known (multi-folder disambiguation), else just `REL_PATH`. Pure
 * — the pe→name map comes from the project roots (no protocol change).
 */
export const peLabeledPath = (peId: string | undefined, relativePath: string, peNames: PeNameMap): string => {
  const name = peId ? peNames[peId] : undefined;
  return name ? `${name} · ${relativePath}` : relativePath;
};

const normalize = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

/**
 * Rank a hit against the query. Higher is better; `-1` means no match (the
 * backend already filtered, so this only orders — a bad score never hides a hit
 * the backend chose to push, callers keep the whole set). Tiers mirror the
 * legacy `@`-mention ranking so the two skins order identically:
 * exact name → exact stem → name prefix → name substring → path prefix → path substring.
 */
export const scoreSearchHit = (hit: SearchHit, query: string): number => {
  const q = normalize(query);
  if (!q) return 0;

  const name = normalize(hit.name || hit.relative_path);
  const path = normalize(hit.relative_path || hit.name);
  if (!name && !path) return -1;

  const stem = name.replace(/\.[^.]+$/, '');

  if (name === q) return 400;
  if (stem === q) return 350;
  if (name.startsWith(q)) return 300;
  if (name.includes(q)) return 200;
  if (path.startsWith(q)) return 100;
  if (path.includes(q)) return 50;
  return -1;
};

/**
 * Order the backend-bounded hit set for display: rank by {@link scoreSearchHit}
 * desc, ties broken by relative_path for stability (arrival order is not
 * guaranteed — multi-root hits merge into one unordered stream, search.md §多根).
 * An empty query = browse mode → keep arrival-stable order, path-sorted.
 */
export const rankSearchHits = (hits: SearchHit[], query: string): SearchHit[] => {
  const q = normalize(query);
  const scored = hits.map((hit) => ({ hit, score: q ? scoreSearchHit(hit, q) : 0 }));
  return scored
    .filter((entry) => (q ? entry.score >= 0 : true))
    .toSorted((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return (left.hit.relative_path || left.hit.name).localeCompare(right.hit.relative_path || right.hit.name);
    })
    .map((entry) => entry.hit);
};
