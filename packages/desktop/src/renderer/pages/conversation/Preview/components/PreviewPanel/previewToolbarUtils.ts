/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatFileRef } from '@/common/types/chatFile';

/**
 * Decide whether to show the download button in the preview toolbar.
 *
 * For files already on disk (hasFilePath), downloading a copy is redundant.
 * This applies to both code and markdown previews; synthetic content
 * (e.g. a mermaid diagram opened in the panel, with no file_path) still
 * offers download.
 *
 * @param contentType - The preview tab content type
 * @param hasFilePath - Whether the tab is backed by a file on disk
 */
export const shouldShowDownload = (contentType: string, hasFilePath: boolean): boolean => {
  if ((contentType === 'code' || contentType === 'markdown') && hasFilePath) {
    return false;
  }
  return true;
};

/**
 * Whether a ChatFileRef actually addresses a file that can be opened.
 *
 * A project ref with an empty `relative_path` denotes the pe root itself — a
 * directory. Handing it to "open in system" would ask the backend to shell-open a
 * folder, which is not what the button claims to do. Such a tab should never
 * exist, so this is a guard rather than a normal path, but the button's condition
 * was widened to accept any ref and an unopenable ref must not slip through it.
 */
export const isOpenableFileRef = (fileRef?: ChatFileRef): boolean => {
  if (!fileRef) return false;
  // Backend contract: relative_path is pe-root-relative with `/` separators, and
  // '' means the root directory.
  if (fileRef.kind === 'project') return fileRef.relative_path.trim() !== '';
  return fileRef.path.trim() !== '';
};

/**
 * Whether "open in system" can act on this tab.
 *
 * A `fileRef` is enough: the backend resolves it and shells out, so no absolute
 * path is needed on this side. That matters because explorer-opened tabs
 * deliberately carry no `file_path` — requiring one left every oversized or
 * unsupported file opened from the tree with no actionable button at all, which is
 * the one state where this button is the user's only way to reach the file.
 *
 * @param hasFilePath - Tab carries an absolute path (legacy entry points)
 * @param fileRef     - Tab's ChatFileRef identity, if any
 */
export const canOpenInSystem = (hasFilePath: boolean, fileRef?: ChatFileRef): boolean =>
  hasFilePath || isOpenableFileRef(fileRef);

/**
 * Whether downloading this tab would produce an empty file.
 *
 * An oversized tab never read its content, so its in-memory content is `''`. With
 * no `file_path` to copy from disk, the text download path would happily write
 * that empty string out: the browser reports a successful download and the user
 * receives a 0-byte file. Refusing is the honest outcome — the real file is still
 * reachable through "open in system".
 *
 * @param isOversized - Tab is in the oversized state (content was never read)
 * @param hasFilePath - A disk path exists, so the download can copy the real file
 */
export const wouldDownloadEmptyFile = (isOversized: boolean, hasFilePath: boolean): boolean =>
  isOversized && !hasFilePath;
