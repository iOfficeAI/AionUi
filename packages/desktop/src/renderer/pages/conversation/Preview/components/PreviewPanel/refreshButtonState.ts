/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatFileRef } from '@/common/types/chatFile';
import type { PreviewContentType } from '@/common/types/office/preview';

/**
 * What the refresh control should look like and whether it does anything.
 *
 * The user-visible promise is narrow: when a file changes underneath an open tab,
 * the refresh icon turns amber; clicking it reloads. Everything here exists to make
 * that promise honest — in particular, to avoid offering a button that cannot
 * deliver, which is the failure mode this whole feature was reviewed against.
 */
export type RefreshButtonState =
  /** Not rendered. Reloading cannot change the outcome, so a button would be a lie. */
  | { kind: 'hidden' }
  /** Rendered, greyed, inert: there is no addressable file to reload. */
  | { kind: 'disabled'; reason: 'no-identity' }
  /**
   * Rendered, greyed, clickable. Nothing is known to have changed.
   *
   * `reason: 'no-signal-source'` marks a file that will never turn amber on its own
   * — only project files are watched — so the tooltip can say so. It behaves
   * identically otherwise: a manual reload works either way.
   */
  | { kind: 'idle'; reason?: 'no-signal-source' }
  /** Rendered, amber. A change was reported and has not been consumed yet. */
  | { kind: 'updated' };

/** The slice of a preview tab this decision reads. */
export type RefreshableTab = {
  content_type: PreviewContentType;
  metadata?: { fileRef?: ChatFileRef; oversized?: boolean };
};

/**
 * Derive the refresh control's state for a tab.
 *
 * Must be recomputed, never captured once when the tab opens. A file opened from a
 * chat link begins as a `local` ref and becomes a `project` ref after an async
 * resolve, which moves it from "no automatic notice" to "will be told about
 * changes". A snapshot taken at open time would leave it permanently describing the
 * wrong thing — the same reason subscriptions derive from tab state rather than from
 * an open event.
 *
 * @param tab       The tab in question.
 * @param hasUpdate Whether an unconsumed change has been reported for this file.
 */
export const refreshButtonState = (tab: RefreshableTab, hasUpdate: boolean): RefreshButtonState => {
  // Nothing to re-read, and re-reading would reach the same verdict: an oversized
  // file is still oversized, and an unsupported format is still unsupported. The
  // button would visibly do nothing.
  //
  // Note this state hides refresh while "open in system" and "download" stay
  // visible — those are the user's only remaining routes to the file, so the three
  // controls behave differently on purpose here. Do not make them consistent.
  if (tab.metadata?.oversized === true || tab.content_type === 'unsupported') {
    return { kind: 'hidden' };
  }

  // No ref means no way to address the file for a re-read. Shown but inert, so the
  // toolbar does not shift when a tab that does have one is selected.
  if (!tab.metadata?.fileRef) {
    return { kind: 'disabled', reason: 'no-identity' };
  }

  if (hasUpdate) return { kind: 'updated' };

  // Only files inside a project can be watched, so anything else will never turn
  // amber by itself. Still clickable: a manual reload works regardless of whether
  // anyone told us to.
  if (tab.metadata.fileRef.kind !== 'project') {
    return { kind: 'idle', reason: 'no-signal-source' };
  }

  return { kind: 'idle' };
};

/** Whether this state renders a button at all. */
export const isRefreshVisible = (state: RefreshButtonState): boolean => state.kind !== 'hidden';

/** Whether clicking does anything. */
export const isRefreshActionable = (state: RefreshButtonState): boolean =>
  state.kind === 'idle' || state.kind === 'updated';

/**
 * Stable value for a `data-*` hook, so tests can assert the state the user sees
 * without depending on which colour class expresses it.
 */
export const refreshStateToken = (state: RefreshButtonState): string =>
  state.kind === 'idle' && state.reason === 'no-signal-source' ? 'idle-no-signal' : state.kind;
