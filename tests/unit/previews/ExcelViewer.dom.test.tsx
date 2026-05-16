/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * N4c V3: ExcelViewer smoke test.
 * ExcelViewer is a thin wrapper that forwards props to OfficeWatchViewer with docType='excel'.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Stub the underlying OfficeWatchViewer to avoid loading its ipcBridge / Arco chain.
vi.mock('@/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer', () => ({
  default: vi.fn(({ docType, file_path, workspace }: { docType: string; file_path?: string; workspace?: string }) =>
    React.createElement('div', {
      'data-testid': 'office-watch-stub',
      'data-doctype': docType,
      'data-path': file_path ?? '',
      'data-workspace': workspace ?? '',
    })
  ),
}));

import ExcelViewer from '@/renderer/pages/conversation/Preview/components/viewers/ExcelViewer';
import OfficeWatchViewer from '@/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer';
import { render, screen } from '@testing-library/react';

describe('ExcelViewer', () => {
  it('is a function component that can be rendered', () => {
    expect(typeof ExcelViewer).toBe('function');
    const { container } = render(React.createElement(ExcelViewer, { file_path: '/tmp/a.xlsx' }));
    expect(container.firstChild).toBeTruthy();
  });

  it('forwards props to OfficeWatchViewer with docType="excel"', () => {
    render(React.createElement(ExcelViewer, { file_path: '/tmp/sheet.xlsx', workspace: '/workspace' }));
    expect(OfficeWatchViewer).toHaveBeenCalled();
    const stub = screen.getByTestId('office-watch-stub');
    expect(stub.dataset.doctype).toBe('excel');
    expect(stub.dataset.path).toBe('/tmp/sheet.xlsx');
    expect(stub.dataset.workspace).toBe('/workspace');
  });

  it('accepts empty props without crashing', () => {
    const { container } = render(React.createElement(ExcelViewer, {}));
    expect(container.firstChild).toBeTruthy();
    const stub = screen.getByTestId('office-watch-stub');
    expect(stub.dataset.doctype).toBe('excel');
  });
});
