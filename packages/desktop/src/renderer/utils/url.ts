/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parse a piece of selected text as a single http/https URL.
 *
 * Returns the normalized URL string when the trimmed text is exactly one
 * http(s) URL, otherwise null. Text containing internal whitespace is
 * rejected so ordinary prose is never mistaken for a link.
 *
 * @param text - Raw selected text
 * @returns Normalized URL, or null when the text is not a single http(s) URL
 */
export function parseHttpUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    // not a valid URL
  }
  return null;
}

/** Nearest ancestor <a> of a DOM node, or null. */
function closestAnchor(node: Node | null): HTMLAnchorElement | null {
  if (!node) return null;
  const el = node instanceof Element ? node : node.parentElement;
  return el?.closest?.('a') ?? null;
}

/**
 * Resolve the http(s) URL a text selection points at.
 *
 * Priority:
 * 1. The selected text is itself a single http(s) URL (handles raw/auto-linked
 *    URLs and the "stuck-together links" case where the user hand-picks one).
 * 2. Otherwise, both ends of the selection sit inside the same <a> whose
 *    resolved href is http(s) — covers rich-text links whose display text is
 *    not the URL. Requiring one shared anchor avoids matching a selection that
 *    spans across separate links.
 *
 * @returns Normalized URL, or null when the selection is not a single link
 */
export function resolveSelectionHttpUrl(text: string, anchorNode: Node | null, focusNode: Node | null): string | null {
  const direct = parseHttpUrl(text);
  if (direct) return direct;

  const anchor = closestAnchor(anchorNode);
  if (anchor && anchor === closestAnchor(focusNode)) {
    return parseHttpUrl(anchor.href);
  }
  return null;
}
