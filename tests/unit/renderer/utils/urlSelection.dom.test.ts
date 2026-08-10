/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { resolveSelectionHttpUrl } from '@/renderer/utils/url';

/**
 * Anchor-href fallback of resolveSelectionHttpUrl — needs a real DOM, so this
 * lives in a .dom.test.ts (jsdom) file. jsdom resolves relative hrefs against
 * http://localhost, which is fine: only http(s) results are accepted.
 */
describe('resolveSelectionHttpUrl (anchor fallback)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('uses the enclosing <a> href when the display text is not itself a URL', () => {
    document.body.innerHTML = '<a href="https://example.com/docs">click here</a>';
    const textNode = document.querySelector('a')!.firstChild;
    expect(resolveSelectionHttpUrl('click here', textNode, textNode)).toBe('https://example.com/docs');
  });

  it('ignores non-http(s) anchor hrefs', () => {
    document.body.innerHTML = '<a href="mailto:x@example.com">mail me</a>';
    const textNode = document.querySelector('a')!.firstChild;
    expect(resolveSelectionHttpUrl('mail me', textNode, textNode)).toBeNull();
  });

  it('returns null when the selection spans two different anchors', () => {
    document.body.innerHTML = '<a href="https://a.example.com">one</a><a href="https://b.example.com">two</a>';
    const [a1, a2] = Array.from(document.querySelectorAll('a'));
    expect(resolveSelectionHttpUrl('one two', a1.firstChild, a2.firstChild)).toBeNull();
  });

  it('returns null when there is no anchor and the text is not a URL', () => {
    document.body.innerHTML = '<p>plain text</p>';
    const textNode = document.querySelector('p')!.firstChild;
    expect(resolveSelectionHttpUrl('plain text', textNode, textNode)).toBeNull();
  });
});
