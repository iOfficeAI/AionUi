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

/** Minimal tab shape the close-batch helpers need. */
type ClosableTab = { id: string; isDirty?: boolean };

/**
 * Which tabs in a to-be-closed batch still hold unsaved edits.
 *
 * Closing a single dirty tab has always asked for confirmation, while closing
 * several at once (left / right / others / all, or collapsing the panel) went
 * straight through and discarded the edits with no prompt — the same "close"
 * gesture with two different safety levels, and the unsafe one is the one that
 * takes a right-click to reach.
 */
export const dirtyTabsInBatch = <T extends ClosableTab>(batch: readonly T[]): T[] =>
  batch.filter((tab) => tab.isDirty === true);

/**
 * Whether closing this batch needs confirmation first.
 *
 * Clean batches close immediately: a prompt with nothing at stake only teaches
 * the user to dismiss prompts without reading them.
 */
export const batchNeedsCloseConfirm = (batch: readonly ClosableTab[]): boolean => dirtyTabsInBatch(batch).length > 0;

/** What the UI should tell the user after attempting a save. */
export type SaveOutcome =
  /** Written to disk. Nothing to report. */
  | { kind: 'saved' }
  /** The file changed on disk since this tab read it; the write was refused. */
  | { kind: 'conflict' }
  /** Anything else — carries a message to append. */
  | { kind: 'failed'; detail?: string };

/**
 * Classify the result of a save attempt.
 *
 * Exists so the outcome is decided in one testable place instead of inside a
 * component callback. The failure this guards against is a save that reports
 * success it did not have: the previous Ctrl+S path discarded `saveContent`'s
 * promise entirely, so a refused write produced no message at all and the tab kept
 * looking exactly as it does after a successful save.
 *
 * @param result Resolved value of the save, or `undefined` when it threw.
 * @param error  Thrown value, if any.
 */
export const classifySaveOutcome = (result: boolean | undefined, error?: unknown): SaveOutcome => {
  if (error !== undefined && error !== null) {
    // A 409 is the interesting one: it means conflict detection worked and the
    // file moved under us, which needs different wording than a generic failure.
    const status = (error as { status?: unknown }).status;
    if (status === 409) return { kind: 'conflict' };
    return { kind: 'failed', detail: error instanceof Error ? error.message : undefined };
  }
  // `false` is a refusal too, not a success — it must never fall through to 'saved'.
  if (result !== true) return { kind: 'failed' };
  return { kind: 'saved' };
};
