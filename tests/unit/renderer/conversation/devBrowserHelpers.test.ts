/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  estimatePayloadBytes,
  formatForChat,
  mergePicked,
  normalizeUrl,
} from '@/renderer/pages/conversation/DevBrowser/helpers';
import type { PickedElement } from '@/renderer/pages/conversation/DevBrowser/types';

function makePicked(overrides: Partial<PickedElement> = {}): PickedElement {
  return {
    id: 'id-x',
    url: 'https://example.com/page',
    title: 'Example',
    selector: 'div.foo',
    tagName: 'div',
    textContent: 'hello',
    outerHTML: '<div class="foo">hello</div>',
    attrs: { class: 'foo' },
    rect: { x: 0, y: 0, w: 10, h: 10 },
    pickedAt: 1000,
    ...overrides,
  };
}

describe('normalizeUrl', () => {
  it('returns empty for blank input', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('   ')).toBe('');
  });

  it('keeps http(s) URLs unchanged', () => {
    expect(normalizeUrl('https://x.com')).toBe('https://x.com');
    expect(normalizeUrl('http://x.com/y')).toBe('http://x.com/y');
  });

  it('prefixes https:// for bare hosts', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('  example.com/path  ')).toBe('https://example.com/path');
  });
});

describe('estimatePayloadBytes', () => {
  it('returns 0 for empty list', () => {
    expect(estimatePayloadBytes([])).toBe(0);
  });

  it('grows roughly linearly with outerHTML/text/selector size', () => {
    const small = makePicked({ outerHTML: 'a', textContent: 'b', selector: 'c' });
    const big = makePicked({ outerHTML: 'a'.repeat(1000), textContent: 'b', selector: 'c' });
    expect(estimatePayloadBytes([big])).toBeGreaterThan(estimatePayloadBytes([small]) + 900);
  });
});

describe('formatForChat', () => {
  it('emits a count attribute matching the items length', () => {
    const out = formatForChat([makePicked(), makePicked({ selector: 'span' })]);
    expect(out).toContain('<picked_elements count="2">');
    expect(out.endsWith('</picked_elements>')).toBe(true);
  });

  it('includes selector, tag, text, html and attrs JSON for each item', () => {
    const out = formatForChat([
      makePicked({
        url: 'https://a.test/p',
        selector: 'button.primary',
        tagName: 'button',
        textContent: 'Click me',
        outerHTML: '<button class="primary">Click me</button>',
        attrs: { class: 'primary', role: 'button' },
      }),
    ]);
    expect(out).toContain('url="https://a.test/p"');
    expect(out).toContain('selector="button.primary"');
    expect(out).toContain('<tag>button</tag>');
    expect(out).toContain('<text>Click me</text>');
    expect(out).toContain('<![CDATA[<button class="primary">Click me</button>]]>');
    expect(out).toContain('"role":"button"');
  });
});

describe('mergePicked', () => {
  const payload = {
    url: 'https://example.com',
    title: 'Example',
    selector: 'div.foo',
    tagName: 'div',
    textContent: 'hi',
    outerHTML: '<div class="foo">hi</div>',
    attrs: { class: 'foo' },
    rect: { x: 0, y: 0, w: 10, h: 10 },
  };

  it('adds a new item when basket is empty and under cap', () => {
    const result = mergePicked([], payload, 5, 2000, () => 'new-id');
    expect(result.kind).toBe('added');
    if (result.kind !== 'added') return;
    expect(result.newId).toBe('new-id');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].pickedAt).toBe(2000);
  });

  it('replaces existing item with same url+selector and refreshes pickedAt', () => {
    const prev = [makePicked({ id: 'old-id', url: payload.url, selector: payload.selector, pickedAt: 100 })];
    const result = mergePicked(prev, payload, 5, 9000, () => 'should-not-use');
    expect(result.kind).toBe('replaced');
    if (result.kind !== 'replaced') return;
    expect(result.replacedId).toBe('old-id');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('old-id');
    expect(result.items[0].pickedAt).toBe(9000);
  });

  it('treats items as distinct when selector or url differs', () => {
    const prev = [makePicked({ id: 'a', url: payload.url, selector: 'div.bar' })];
    const result = mergePicked(prev, payload, 5, 1, () => 'b');
    expect(result.kind).toBe('added');
    if (result.kind !== 'added') return;
    expect(result.items).toHaveLength(2);
  });

  it('rejects new items when basket is at capacity', () => {
    const prev = Array.from({ length: 3 }, (_, i) => makePicked({ id: `id-${i}`, selector: `div.s${i}` }));
    const result = mergePicked(prev, payload, 3, 1, () => 'x');
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reason).toBe('full');
    expect(result.items).toBe(prev);
  });

  it('still allows refresh-replace when at capacity (existing url+selector)', () => {
    const prev = Array.from({ length: 3 }, (_, i) =>
      makePicked({
        id: `id-${i}`,
        url: i === 0 ? payload.url : `https://other-${i}.test`,
        selector: i === 0 ? payload.selector : `div.s${i}`,
        pickedAt: 100,
      })
    );
    const result = mergePicked(prev, payload, 3, 5000, () => 'x');
    expect(result.kind).toBe('replaced');
    if (result.kind !== 'replaced') return;
    expect(result.replacedId).toBe('id-0');
    expect(result.items[0].pickedAt).toBe(5000);
  });
});
