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

import OfficeDocViewer from '@/renderer/pages/conversation/Preview/components/viewers/OfficeDocViewer';

describe('OfficeDocViewer', () => {
  it('renders OfficeWatchViewer with docType word', () => {
    const { getByTestId } = render(<OfficeDocViewer file_path='/test.docx' />);
    const viewer = getByTestId('office-watch-viewer');
    expect(viewer.getAttribute('data-doctype')).toBe('word');
  });

  it('forwards file_path prop to OfficeWatchViewer', () => {
    const { getByTestId } = render(<OfficeDocViewer file_path='/docs/report.docx' />);
    const viewer = getByTestId('office-watch-viewer');
    expect(viewer.getAttribute('data-filepath')).toBe('/docs/report.docx');
  });

  it('renders without file_path', () => {
    const { getByTestId } = render(<OfficeDocViewer />);
    const viewer = getByTestId('office-watch-viewer');
    expect(viewer).toBeInTheDocument();
  });
});
