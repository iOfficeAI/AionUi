/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Which mention tokens the send box should paint.
 *
 * The rule is "coloured ⇔ a reference is actually attached", and it is a
 * correction rather than a new feature. The overlay used to paint every match of
 * the `@…` text pattern, so typing `@config.json` by hand looked exactly like
 * picking it from the dropdown — while only the pick attaches a `ChatFileRef`.
 * A real user read the colour as confirmation, sent the message, and the agent
 * received no `[[AION_FILES]]` block at all. The colour was the only signal, and
 * it was not telling the truth.
 *
 * Kept as a pure function, separate from the 1900-line send box, because the
 * matching rules differ per lane and are easy to get subtly wrong.
 */

export type MentionToken = {
  start: number;
  end: number;
  query: string;
};

export type MentionRange = {
  start: number;
  end: number;
};

export type AttachedMentionRangesParams = {
  /** `@` tokens found in the text. */
  fileTokens: MentionToken[];
  /**
   * Every key a selected file can be matched by, mirroring the reconciliation's
   * own `getSelectedItemMatchKeys` set. A set, not a multiset, because the file
   * reconciliation matches that way too — the two must agree or the colour and
   * the chip row would tell different stories.
   */
  attachedFileKeys: Set<string>;
  /** `@@` tokens found in the text. Empty when the feature is unavailable. */
  sessionTokens: MentionToken[];
  /**
   * One name per attached conversation reference. A LIST, not a set, mirroring
   * `reconcileSessionRefs`: with two `@@same` tokens and one reference, exactly
   * one of them is live, so exactly one may be painted.
   */
  attachedSessionNames: string[];
};

/**
 * Ranges to paint, in ascending `start` order.
 *
 * The two lanes cannot overlap: `getAllAtFileQueries` skips both halves of a
 * `@@` pair, so no offset is claimed twice. Sorting is still required — the
 * overlay walks the ranges in order and slices the text between them, so an
 * out-of-order range would produce a negative slice and drop text.
 */
export function buildAttachedMentionRanges(params: AttachedMentionRangesParams): MentionRange[] {
  const { fileTokens, attachedFileKeys, sessionTokens, attachedSessionNames } = params;

  const ranges: MentionRange[] = [];

  for (const token of fileTokens) {
    if (attachedFileKeys.has(token.query)) {
      ranges.push({ start: token.start, end: token.end });
    }
  }

  // Consume one name per painted token so a repeated token cannot claim the
  // same reference twice.
  const remainingNames = new Map<string, number>();
  for (const name of attachedSessionNames) {
    remainingNames.set(name, (remainingNames.get(name) ?? 0) + 1);
  }
  for (const token of sessionTokens) {
    const left = remainingNames.get(token.query) ?? 0;
    if (left <= 0) {
      continue;
    }
    remainingNames.set(token.query, left - 1);
    ranges.push({ start: token.start, end: token.end });
  }

  return ranges.sort((left, right) => left.start - right.start);
}
