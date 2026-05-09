/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

vi.mock('@/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer', () => ({
  default: ({ docType, file_path }: { docType: string; file_path?: string }) => (
    <div data-testid='office-watch-viewer' data-doctype={docType} data-filepath={file_path} />
  ),
}));

import PptViewer from '@/renderer/pages/conversation/Preview/components/viewers/PptViewer';

describe('PptViewer', () => {
  it('renders OfficeWatchViewer with docType ppt', () => {
    const { getByTestId } = render(<PptViewer file_path='/test.pptx' />);
    const viewer = getByTestId('office-watch-viewer');
    expect(viewer.getAttribute('data-doctype')).toBe('ppt');
  });

  it('forwards file_path prop to OfficeWatchViewer', () => {
    const { getByTestId } = render(<PptViewer file_path='/slides/deck.pptx' />);
    const viewer = getByTestId('office-watch-viewer');
    expect(viewer.getAttribute('data-filepath')).toBe('/slides/deck.pptx');
  });

  it('renders without file_path', () => {
    const { getByTestId } = render(<PptViewer />);
    const viewer = getByTestId('office-watch-viewer');
    expect(viewer).toBeInTheDocument();
  });
});
