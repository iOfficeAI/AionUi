/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type PickedElement = {
  id: string;
  url: string;
  title: string;
  selector: string;
  tagName: string;
  textContent: string;
  outerHTML: string;
  attrs: Record<string, string>;
  rect: { x: number; y: number; w: number; h: number };
  pickedAt: number;
};

export const MAX_OUTER_HTML = 2048;
export const MAX_TEXT = 500;
export const MAX_BASKET_ITEMS = 20;
export const MAX_PAYLOAD_BYTES = 32 * 1024;
