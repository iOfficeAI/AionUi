/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Selection helpers for the voice-read feature.
 *
 * NOTE: the logic below is copied from
 * pages/conversation/Messages/components/SelectionReplyButton.tsx
 * (getEffectiveSelection / findMessageElement). The original file is NOT
 * modified — per the integration plan, the helpers are not exported there,
 * so they are duplicated here to reuse the same Shadow-DOM-aware selection
 * capability for "read selected text".
 */

/**
 * Get the current selection, checking Shadow DOM roots if needed.
 * MarkdownView renders inside Shadow DOM, so document.getSelection() may
 * return a collapsed/empty selection while the real selection lives inside
 * a shadowRoot.
 */
export function getEffectiveSelection(target: EventTarget | null): Selection | null {
  // First try the standard selection
  const docSel = document.getSelection();
  if (docSel && !docSel.isCollapsed && docSel.toString().trim()) {
    return docSel;
  }

  // If standard selection is empty, search for selection inside Shadow DOM
  // Walk up from the mouseup target to find a shadow host
  let el = target instanceof Node ? target : null;
  while (el) {
    if (el instanceof Element && el.shadowRoot) {
      const shadowSel = (el.shadowRoot as unknown as { getSelection?: () => Selection | null }).getSelection?.();
      if (shadowSel && !shadowSel.isCollapsed && shadowSel.toString().trim()) {
        return shadowSel;
      }
    }
    el = el.parentNode;
  }

  return docSel;
}

/**
 * Find the closest message container from a selection's anchor node.
 * Handles both regular DOM and Shadow DOM cases.
 */
export function findMessageElement(sel: Selection): Element | null {
  const node: Node | null = sel.anchorNode;
  if (!node) return null;

  // In Shadow DOM, anchorNode is inside the shadow tree.
  // We need to walk up through shadow boundaries to find the message container.
  let el: Element | null = node instanceof Element ? node : node.parentElement;

  // Try finding within current DOM tree first
  const msgEl = el?.closest?.('[id^="message-"]');
  if (msgEl) return msgEl;

  // If not found, walk up through shadow host boundaries
  while (el) {
    const root = el.getRootNode();
    if (root instanceof ShadowRoot) {
      el = root.host;
      const hostMsgEl = el.closest('[id^="message-"]');
      if (hostMsgEl) return hostMsgEl;
    } else {
      break;
    }
  }

  return null;
}
