/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---

const startInvokeMock = vi.fn();
const stopInvokeMock = vi.fn();
const statusOnMock = vi.fn();
const statusUnsubMock = vi.fn();

vi.mock('../../src/common', () => ({
  ipcBridge: {
    wordPreview: {
      start: {
        invoke: (...args: any[]) => startInvokeMock(...args),
      },
      stop: {
        invoke: (...args: any[]) => stopInvokeMock(...args),
      },
      status: {
        on: (...args: any[]) => statusOnMock(...args),
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Spin: ({ size }: { size?: number }) => (
    <div data-testid='spin' data-size={size}>
      loading...
    </div>
  ),
}));

vi.mock('../../src/renderer/components/media/WebviewHost', () => ({
  default: ({ url, className }: { url: string; className?: string }) => (
    <div data-testid='webview-host' data-url={url} className={className} />
  ),
}));

import OfficeDocPreview from '../../src/renderer/pages/conversation/Preview/components/viewers/OfficeDocViewer';

describe('OfficeDocViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusOnMock.mockReturnValue(statusUnsubMock);
    stopInvokeMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading spinner initially', () => {
    startInvokeMock.mockReturnValue(new Promise(() => {})); // never resolves

    render(<OfficeDocPreview filePath='/test/file.docx' />);

    expect(screen.getByTestId('spin')).toBeInTheDocument();
    expect(screen.getByText('preview.word.watch.loading')).toBeInTheDocument();
  });

  it('shows error when filePath is not provided', () => {
    render(<OfficeDocPreview />);

    expect(screen.getByText('preview.errors.missingFilePath')).toBeInTheDocument();
  });

  it('renders webview after successful start', async () => {
    startInvokeMock.mockResolvedValue({ url: 'http://localhost:12345' });

    await act(async () => {
      render(<OfficeDocPreview filePath='/test/file.docx' />);
    });

    // Wait for the 300ms delay
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    const webview = screen.getByTestId('webview-host');
    expect(webview).toBeInTheDocument();
    expect(webview.getAttribute('data-url')).toBe('http://localhost:12345');
  });

  it('shows error when start fails', async () => {
    startInvokeMock.mockRejectedValue(new Error('spawn failed'));

    await act(async () => {
      render(<OfficeDocPreview filePath='/test/file.docx' />);
    });

    expect(screen.getByText('spawn failed')).toBeInTheDocument();
    expect(screen.getByText('preview.word.watch.installHint')).toBeInTheDocument();
  });

  it('subscribes to status emitter and unsubscribes on unmount', () => {
    startInvokeMock.mockReturnValue(new Promise(() => {}));

    const { unmount } = render(<OfficeDocPreview filePath='/test/file.docx' />);

    expect(statusOnMock).toHaveBeenCalledTimes(1);
    expect(statusOnMock).toHaveBeenCalledWith(expect.any(Function));

    unmount();

    expect(statusUnsubMock).toHaveBeenCalledTimes(1);
  });

  it('calls stop on unmount', () => {
    startInvokeMock.mockReturnValue(new Promise(() => {}));

    const { unmount } = render(<OfficeDocPreview filePath='/test/file.docx' />);

    unmount();

    expect(stopInvokeMock).toHaveBeenCalledWith({ filePath: '/test/file.docx' });
  });

  it('shows installing text when status emitter fires installing', () => {
    startInvokeMock.mockReturnValue(new Promise(() => {}));

    render(<OfficeDocPreview filePath='/test/file.docx' />);

    expect(screen.getByText('preview.word.watch.loading')).toBeInTheDocument();

    const statusHandler = statusOnMock.mock.calls[0][0];

    act(() => {
      statusHandler({ state: 'installing' });
    });

    expect(screen.getByText('preview.word.watch.installing')).toBeInTheDocument();
  });
});
