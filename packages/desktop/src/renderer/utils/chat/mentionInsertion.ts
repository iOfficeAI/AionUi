/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared by the `@` file lane and the `@@` session lane, which insert their
 * tokens through the same splice and want the same trailing-space rule. Kept out
 * of both query modules because neither owns it, and `atFileQuery` already
 * imports `atSessionQuery` — adding a second edge between them would only make
 * the direction harder to reason about.
 */

/**
 * Whether a completed mention should be followed by a space.
 *
 * Two reasons the space matters, beyond matching the slash-command menu (which
 * inserts `/name ` because it replaces the whole input rather than splicing):
 *
 * 1. Without it, a SECOND mention cannot be typed. Both lanes require the
 *    candidate `@` to be preceded by a boundary character or the start of the
 *    string, so with the caret left flush against `@src/a.rs` the next `@` is
 *    skipped and the scan falls back to the FIRST one — searching for a path
 *    that ends in `@`. The user has to type the separator by hand for the
 *    picker to work at all.
 * 2. It closes the picker honestly. The caret landing past a boundary character
 *    makes `getActive…Query` return null on its own, instead of relying on the
 *    `start:rawQuery` dismissal key, which collides when the same mention is
 *    deleted and retyped at the same offset.
 *
 * The condition is a single comparison because `tokenEndFrom` returns either
 * `value.length` or the index of the first unescaped boundary character — so
 * "there is already a separator here" and "the token runs to the end" are
 * mutually exclusive. Anything already following the token (` more text`,
 * `, and…`) is left untouched: inserting there would double a space or push the
 * user's punctuation away from the word it belongs to.
 */
export function shouldAppendSpaceAfterMention(value: string, tokenEnd: number): boolean {
  return tokenEnd >= value.length;
}

export type MentionInsertion = {
  /** The full new input value. */
  value: string;
  /** Where the caret belongs afterwards — past the trailing space, when one was added. */
  caret: number;
};

/**
 * Replace the token spanning `[start, end)` with `insertion`, appending a space
 * per [`shouldAppendSpaceAfterMention`].
 *
 * Pure, and shared by both lanes, because the caret arithmetic is the part that
 * silently rots: forgetting to advance it past an appended space leaves the
 * caret inside the completed mention, which reopens the picker and looks like a
 * flickering dropdown rather than an off-by-one.
 */
export function applyMentionInsertion(value: string, start: number, end: number, insertion: string): MentionInsertion {
  const suffix = shouldAppendSpaceAfterMention(value, end) ? ' ' : '';
  return {
    value: value.slice(0, start) + insertion + suffix + value.slice(end),
    caret: start + insertion.length + suffix.length,
  };
}
