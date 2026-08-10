/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PreviewMetadata } from './PreviewContext';
import type { PreviewContentType } from '@/common/types/office/preview';

/**
 * Identity for preview tabs that have no `ChatFileRef`.
 *
 * A tab's identity answers "is this the same tab?" for dedup. Most tabs answer it
 * with a ChatFileRef, but a few entry points have no file behind them at all
 * (a mermaid diagram, a diff that exists only in a message), and those still need
 * an answer — without one, clicking the same diagram twice opens two tabs.
 *
 * Each supported case gets an explicit, namespaced key. Everything else returns
 * `null`, meaning "do not dedup, always open a new tab". That default is
 * deliberate: merging two tabs that are not the same file makes them overwrite each
 * other's content, while failing to merge merely leaves an extra tab open.
 */

/**
 * A stable 32-bit hash of a string (FNV-1a), rendered as hex.
 *
 * The design called for a SHA, but this runs inside the synchronous tab-matching
 * path and `crypto.subtle.digest` is async. FNV-1a is the right trade here: the
 * hash only has to distinguish one open tab's content from another's within a
 * single panel — a handful of items, no adversary, and a collision costs one
 * wrongly-reused tab rather than anything durable. Using the full text as the key
 * instead would work too but would keep whole documents alive in tab metadata.
 */
const hashText = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // 16777619, via shifts to stay in 32-bit integer math.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

/** `\0` separates fields, matching `chatFileRefKey`'s convention. */
const SEP = '\0';

/**
 * Build the dedup key for a ref-less tab, or `null` when it should not dedup.
 *
 * @param type    Tab content type.
 * @param content Tab content (the identity itself for content-only tabs).
 * @param meta    Tab metadata, for the file name a diff carries.
 */
export const reflessTabKey = (type: PreviewContentType, content?: string, meta?: PreviewMetadata): string | null => {
  // A mermaid diagram is its code. Keying on the rendered title instead is what let
  // two different diagrams sharing a first line overwrite each other.
  if (type === 'markdown' && content?.startsWith('```mermaid')) {
    return `mermaid${SEP}${hashText(content)}`;
  }

  // A diff needs both parts: the file name alone merged same-named files from
  // different directories, and the diff text alone would split a file's own diff
  // across re-renders that reformat it.
  if (type === 'diff') {
    if (content === undefined) return null;
    const fileName = meta?.file_name?.trim() ?? '';
    return `diff${SEP}${fileName}${SEP}${hashText(content)}`;
  }

  return null;
};
