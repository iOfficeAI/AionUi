/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, act, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---

const convertInvokeMock = vi.fn();

vi.mock('../../src/common', () => ({
  ipcBridge: {
    document: {
      convert: {
        invoke: (...args: any[]) => convertInvokeMock(...args),
      },
    },
    shell: {
      openFile: { invoke: vi.fn() },
      showItemInFolder: { invoke: vi.fn() },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const messageErrorMock = vi.fn();

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick }: any) => React.createElement('button', { onClick }, children),
  Message: Object.assign(
    {},
    {
      useMessage: () => [
        { error: vi.fn(), info: vi.fn() },
        React.createElement('div', { 'data-testid': 'message-holder' }),
      ],
      error: (...args: any[]) => messageErrorMock(...args),
    }
  ),
}));

vi.mock('../../src/renderer/pages/conversation/Preview/context/PreviewToolbarExtrasContext', () => ({
  usePreviewToolbarExtras: () => null,
}));

vi.mock('../../src/renderer/pages/conversation/Preview/components/viewers/MarkdownViewer', () => ({
  default: ({ content }: { content: string }) =>
    React.createElement('div', { 'data-testid': 'markdown-preview' }, content),
}));

import OfficeDocPreview from '../../src/renderer/pages/conversation/Preview/components/viewers/OfficeDocViewer';

describe('OfficeDocViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses static Message.error when document conversion fails', async () => {
    convertInvokeMock.mockRejectedValue(new Error('conversion failed'));

    render(
      React.createElement(OfficeDocPreview, {
        filePath: '/test/doc.docx',
        docType: 'word' as const,
      })
    );

    await waitFor(() => {
      expect(messageErrorMock).toHaveBeenCalledWith('conversion failed');
    });
  });

  it('shows error text when conversion fails', async () => {
    convertInvokeMock.mockRejectedValue(new Error('File corrupt'));

    const { container } = render(
      React.createElement(OfficeDocPreview, {
        filePath: '/test/bad.docx',
        docType: 'word' as const,
      })
    );

    await waitFor(() => {
      expect(container.textContent).toContain('File corrupt');
    });
  });

  it('renders markdown when conversion succeeds', async () => {
    convertInvokeMock.mockResolvedValue({
      to: 'markdown',
      result: { success: true, data: '# Test Content' },
    });

    const { container } = render(
      React.createElement(OfficeDocPreview, {
        filePath: '/test/good.docx',
        docType: 'word' as const,
      })
    );

    await waitFor(() => {
      expect(container.textContent).toContain('# Test Content');
    });

    expect(messageErrorMock).not.toHaveBeenCalled();
  });
});
