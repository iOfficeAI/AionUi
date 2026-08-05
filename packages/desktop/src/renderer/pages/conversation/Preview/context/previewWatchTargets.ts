/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatFileRef } from '@/common/types/chatFile';
import { peKey, type PeKey } from '@/renderer/pages/conversation/explorer/explorerModel';

/**
 * Which directories the preview panel needs watched, derived from its open tabs.
 *
 * The panel cannot ride on the explorer's subscriptions: those track the
 * directories currently expanded on screen and drop as soon as one is collapsed,
 * while a preview tab stays open regardless. So it subscribes for itself.
 *
 * **Derived from tab state, never from an "a tab was opened" event.** A file opened
 * from a chat link starts life as a `local` ref and only becomes a `project` ref
 * after an async upgrade round trip. Deciding at open time would file it under
 * "no signal" and never revisit that, so the one case this whole mechanism exists
 * to serve — a project file reached from a message — would silently never receive
 * updates. Recomputing from whatever the tabs currently hold means the upgrade's
 * write-back is picked up on the next pass with no special casing.
 */

/** The subset of a tab this derivation reads. */
export type SubscribableTab = { metadata?: { fileRef?: ChatFileRef } };

/**
 * Directory of the file a `project` ref points at, as a subscription key.
 *
 * Returns `null` for refs that cannot receive automatic signals — `local` (the file
 * may sit anywhere on the host), `upload` (a managed directory belonging to no
 * project root), and tabs with no ref at all (mermaid, a diff with no file behind
 * it). Those keep a manually-triggerable refresh; they just have nothing to watch.
 */
const watchTargetForRef = (fileRef?: ChatFileRef): PeKey | null => {
  if (!fileRef || fileRef.kind !== 'project') return null;

  // Subscription is per directory: the backend mounts a target by listing it, so
  // handing it a file path fails outright. Take the parent.
  //
  // A file directly under a root yields `''`, which is the root directory itself and
  // a perfectly good target — the explorer subscribes with exactly that. (Note this
  // is the opposite of the check on "open in system", where an empty relative_path
  // means "this is a directory, refuse to open it as a file". Both are right; do not
  // unify them.)
  const lastSlash = fileRef.relative_path.lastIndexOf('/');
  const dir = lastSlash < 0 ? '' : fileRef.relative_path.slice(0, lastSlash);
  return peKey(fileRef.pe_id, dir);
};

/**
 * The set of directories these tabs want watched.
 *
 * A set, so two tabs in one directory produce one entry — which is also the
 * reference counting the design asks for: closing one of them leaves the directory
 * in the set, and only closing the last removes it. Comparing this against the
 * currently-subscribed set is what makes reconciliation idempotent, so running it
 * repeatedly (React StrictMode double-invokes, or any unrelated code touching tab
 * metadata) cannot accumulate subscriptions.
 */
export const deriveWatchTargets = (tabs: readonly SubscribableTab[]): Set<PeKey> => {
  const want = new Set<PeKey>();
  for (const tab of tabs) {
    const key = watchTargetForRef(tab.metadata?.fileRef);
    if (key !== null) want.add(key);
  }
  return want;
};
