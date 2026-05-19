/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PickedElement } from './types';

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://' + trimmed;
}

export function nextId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function estimatePayloadBytes(items: PickedElement[]): number {
  let n = 0;
  for (const el of items) {
    n += el.outerHTML.length + el.textContent.length + el.selector.length + 64;
  }
  return n;
}

export function formatForChat(items: PickedElement[]): string {
  const lines: string[] = [`<picked_elements count="${items.length}">`];
  for (const el of items) {
    lines.push(
      `  <element url="${el.url}" selector="${el.selector}">`,
      `    <tag>${el.tagName}</tag>`,
      `    <text>${el.textContent}</text>`,
      `    <html><![CDATA[${el.outerHTML}]]></html>`,
      `    <attrs>${JSON.stringify(el.attrs)}</attrs>`,
      `  </element>`
    );
  }
  lines.push(`</picked_elements>`);
  return lines.join('\n');
}

export type MergePickedResult =
  | { kind: 'added'; items: PickedElement[]; newId: string }
  | { kind: 'replaced'; items: PickedElement[]; replacedId: string }
  | { kind: 'rejected'; reason: 'full'; items: PickedElement[] };

/**
 * Pure dedupe + cap logic for the picker basket.
 * - If an item with the same url+selector exists, replace it in place (refresh pickedAt).
 * - Else, if under maxItems, append it.
 * - Else, reject with reason='full'.
 */
export function mergePicked(
  prev: PickedElement[],
  payload: Omit<PickedElement, 'id' | 'pickedAt'>,
  maxItems: number,
  now: number,
  idFactory: () => string
): MergePickedResult {
  const existing = prev.find((e) => e.url === payload.url && e.selector === payload.selector);
  if (existing) {
    return {
      kind: 'replaced',
      replacedId: existing.id,
      items: prev.map((e) => (e.id === existing.id ? { ...payload, id: existing.id, pickedAt: now } : e)),
    };
  }
  if (prev.length >= maxItems) {
    return { kind: 'rejected', reason: 'full', items: prev };
  }
  const id = idFactory();
  return { kind: 'added', newId: id, items: [...prev, { ...payload, id, pickedAt: now }] };
}
