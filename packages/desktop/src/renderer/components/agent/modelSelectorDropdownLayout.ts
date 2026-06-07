/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Vertical space taken by the search field + bottom padding inside the panel. */
export const MODEL_SELECTOR_SEARCH_CHROME_PX = 42;
/** Top + bottom padding inside the panel shell. */
export const MODEL_SELECTOR_PANEL_PADDING_PX = 20;
/** Footer row + divider when present. */
export const MODEL_SELECTOR_FOOTER_CHROME_PX = 44;

export function computeModelListHeight(panelMaxHeight: number, hasFooter: boolean): number {
  const chrome =
    MODEL_SELECTOR_SEARCH_CHROME_PX +
    MODEL_SELECTOR_PANEL_PADDING_PX +
    (hasFooter ? MODEL_SELECTOR_FOOTER_CHROME_PX : 0);
  return Math.max(120, panelMaxHeight - chrome);
}
