/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cross-component reveal handoff between the editor and the workspace
 * file tree.
 *
 * Why a window CustomEvent? The editor and the file tree live in
 * different parents (`EditorPanel` vs `Workspace/index.tsx`). React
 * context would couple them tightly and force an unmount/remount of one
 * when the other is not on screen. A DOM event decouples them: the
 * editor dispatches a `requestEditorRevealInTree(...)` and the tree
 * listens with `useEditorRevealInTree` (added in this Epic). Both ends
 * type-check on the shared `EditorRevealPathDetail` payload.
 *
 * Path normalization lives here so the listener can use the same key the
 * Arco tree uses (`relativePath`, POSIX-style, repo-relative).
 */

/** Event name dispatched on `window` when the editor wants to reveal a path in the tree. */
export const EDITOR_REVEAL_PATH_EVENT = 'editor.reveal.path';

export type EditorRevealPathDetail = {
  /** Absolute workspace root the tree is rooted at. */
  workspace: string;
  /** Absolute path of the file to reveal. */
  filePath: string;
  /** Optional pre-computed workspace-relative POSIX path. When omitted, the
   * listener derives it from `filePath` and `workspace`. */
  relativePath?: string;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const toPosix = (input: string): string => input.replace(/\\/g, '/');

/**
 * Strip the workspace prefix from `filePath` and POSIX-normalize the
 * result so it matches the keys the Arco tree produces from
 * `IDirOrFile.relativePath`. Falls back to the basename when the file is
 * not under the workspace, which the tree can then ignore.
 */
export const relativePathFromWorkspace = (workspace: string, filePath: string): string => {
  if (!isString(workspace) || !isString(filePath)) return '';
  const ws = toPosix(workspace).replace(/\/+$/, '');
  const fp = toPosix(filePath);
  // Case-insensitive prefix match is risky on case-sensitive filesystems
  // (Linux). Default to literal match, which is what the tree also does
  // (it stores relativePath as the backend returned it).
  if (fp === ws) return '';
  if (fp.startsWith(`${ws}/`)) return fp.slice(ws.length + 1);
  // Last-ditch: try basename. Tree will treat as missing if no match.
  const lastSlash = fp.lastIndexOf('/');
  return lastSlash >= 0 ? fp.slice(lastSlash + 1) : fp;
};

/**
 * Dispatch a `reveal` request to the file tree. The editor calls this
 * when the user activates a buffer (or on hydration of persisted tabs).
 * Returns true when the event was dispatched, false in SSR or when
 * `detail` is malformed.
 */
export const requestEditorRevealInTree = (detail: EditorRevealPathDetail): boolean => {
  if (typeof window === 'undefined') return false;
  if (!isString(detail?.workspace) || !isString(detail?.filePath)) return false;
  const payload: EditorRevealPathDetail = {
    workspace: detail.workspace,
    filePath: detail.filePath,
  };
  if (isString(detail.relativePath)) payload.relativePath = detail.relativePath;
  const event = new CustomEvent<EditorRevealPathDetail>(EDITOR_REVEAL_PATH_EVENT, { detail: payload });
  window.dispatchEvent(event);
  return true;
};

/** Type guard: narrows an arbitrary event to a reveal request. */
export const isEditorRevealPathEvent = (event: Event): event is CustomEvent<EditorRevealPathDetail> => {
  if (!(event instanceof CustomEvent)) return false;
  const detail = (event as CustomEvent).detail;
  return (
    isPlainObject(detail) &&
    isString((detail as Record<string, unknown>).workspace) &&
    isString((detail as Record<string, unknown>).filePath)
  );
};
