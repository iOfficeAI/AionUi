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
    pptPreview: {
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

import PptViewer from '../../src/renderer/pages/conversation/Preview/components/viewers/PptViewer';

describe('PptViewer', () => {
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

    render(<PptViewer filePath='/test/file.pptx' />);

    expect(screen.getByTestId('spin')).toBeInTheDocument();
    expect(screen.getByText('preview.ppt.loading')).toBeInTheDocument();
  });

  it('shows error when filePath is not provided', () => {
    render(<PptViewer />);

    expect(screen.getByText('preview.errors.missingFilePath')).toBeInTheDocument();
  });

  it('renders webview after successful start', async () => {
    startInvokeMock.mockResolvedValue({ url: 'http://localhost:12345' });

    await act(async () => {
      render(<PptViewer filePath='/test/file.pptx' />);
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
      render(<PptViewer filePath='/test/file.pptx' />);
    });

    expect(screen.getByText('spawn failed')).toBeInTheDocument();
    expect(screen.getByText('preview.ppt.installHint')).toBeInTheDocument();
  });

  it('subscribes to status emitter and unsubscribes on unmount', async () => {
    startInvokeMock.mockReturnValue(new Promise(() => {}));

    const { unmount } = render(<PptViewer filePath='/test/file.pptx' />);

    expect(statusOnMock).toHaveBeenCalledTimes(1);
    expect(statusOnMock).toHaveBeenCalledWith(expect.any(Function));

    unmount();

    expect(statusUnsubMock).toHaveBeenCalledTimes(1);
  });

  it('calls stop on unmount', async () => {
    startInvokeMock.mockReturnValue(new Promise(() => {}));

    const { unmount } = render(<PptViewer filePath='/test/file.pptx' />);

    unmount();

    expect(stopInvokeMock).toHaveBeenCalledWith({ filePath: '/test/file.pptx' });
  });

  it('shows installing text when status emitter fires installing', async () => {
    startInvokeMock.mockReturnValue(new Promise(() => {}));

    render(<PptViewer filePath='/test/file.pptx' />);

    // Initially shows loading
    expect(screen.getByText('preview.ppt.loading')).toBeInTheDocument();

    // Get the status handler and fire installing event
    const statusHandler = statusOnMock.mock.calls[0][0];

    act(() => {
      statusHandler({ state: 'installing' });
    });

    expect(screen.getByText('preview.ppt.installing')).toBeInTheDocument();
  });

  it('reverts to loading text when status emitter fires starting', async () => {
    startInvokeMock.mockReturnValue(new Promise(() => {}));

    render(<PptViewer filePath='/test/file.pptx' />);

    const statusHandler = statusOnMock.mock.calls[0][0];

    // Switch to installing
    act(() => {
      statusHandler({ state: 'installing' });
    });
    expect(screen.getByText('preview.ppt.installing')).toBeInTheDocument();

    // Switch back to starting
    act(() => {
      statusHandler({ state: 'starting' });
    });
    expect(screen.getByText('preview.ppt.loading')).toBeInTheDocument();
  });

  it('does not update status after unmount (cancelled)', async () => {
    startInvokeMock.mockReturnValue(new Promise(() => {}));

    const { unmount } = render(<PptViewer filePath='/test/file.pptx' />);

    const statusHandler = statusOnMock.mock.calls[0][0];

    unmount();

    // Should not throw or cause state update
    expect(() => {
      statusHandler({ state: 'installing' });
    }).not.toThrow();
  });
});
