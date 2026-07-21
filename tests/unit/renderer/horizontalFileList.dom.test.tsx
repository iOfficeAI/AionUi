/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression test for #3656: a message with many attached files stretched the
 * chat area and produced a page-level horizontal scrollbar. The fix bounds the
 * HorizontalFileList to the available conversation width so the inner strip
 * scrolls instead of the whole chat area widening.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';

describe('HorizontalFileList width bounding (#3656)', () => {
  it('bounds the root and scroll container so the strip can shrink and scroll internally', () => {
    const { container } = render(
      <HorizontalFileList>
        <div>file-a</div>
        <div>file-b</div>
        <div>file-c</div>
      </HorizontalFileList>
    );

    // Root wrapper must allow shrinking below content size.
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('min-w-0');
    expect(root.className).toContain('max-w-full');

    // Inner scroll container keeps horizontal scroll and is width-bounded so
    // overflowing files scroll inside the strip rather than stretching layout.
    const scrollContainer = root.firstElementChild as HTMLElement;
    expect(scrollContainer.className).toContain('overflow-x-auto');
    expect(scrollContainer.className).toContain('min-w-0');
    expect(scrollContainer.className).toContain('max-w-full');
    expect(scrollContainer.className).toContain('w-full');
  });
});
