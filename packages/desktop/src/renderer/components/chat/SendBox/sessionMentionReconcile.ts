/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SessionRef } from '@/common/adapter/ipcBridge';
import { getAllAtSessionQueries } from '@/renderer/utils/chat/atSessionQuery';

/**
 * Drop selected session references whose `@@` token the user has deleted from
 * the text.
 *
 * Mirrors the file-mention reconciliation in `SendBox/index.tsx`: the visible
 * token is only a label, the ref list is authoritative, and deleting the token
 * must retract the reference — otherwise the agent receives a handle to a
 * conversation the user thought they had removed.
 *
 * Matching is by NAME, because that is all the token carries. Duplicate names
 * are harmless: the wire carries ids, so two conversations sharing a name each
 * keep their own ref as long as there are enough tokens for them.
 */
export function reconcileSessionRefs(
  value: string,
  selected: SessionRef[],
  nameById: Record<string, string>
): SessionRef[] {
  if (selected.length === 0) return selected;

  // A multiset, not a Set: with two `@@same` tokens and two refs both named
  // "same", a Set would keep both refs even after the user deletes one token.
  const remaining = new Map<string, number>();
  for (const token of getAllAtSessionQueries(value)) {
    remaining.set(token.query, (remaining.get(token.query) ?? 0) + 1);
  }

  return selected.filter((ref) => {
    const name = nameById[ref.id];
    if (name === undefined) {
      // Name unknown (e.g. the picker's cache was dropped). Keep the ref rather
      // than silently discarding a reference the user did make.
      return true;
    }
    const left = remaining.get(name) ?? 0;
    if (left <= 0) return false;
    remaining.set(name, left - 1);
    return true;
  });
}
