/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---

const getImageBase64Mock = vi.fn();
const getFileMetadataMock = vi.fn();

vi.mock('../../src/common', () => ({
  ipcBridge: {
    fs: {
      getImageBase64: {
        invoke: (...args: any[]) => getImageBase64Mock(...args),
      },
      getFileMetadata: {
        invoke: (...args: any[]) => getFileMetadataMock(...args),
      },
    },
  },
}));

vi.mock('../../src/renderer/services/FileService', () => ({
  getFileExtension: (name: string) => {
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot) : '';
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Image: ({ src, alt, style, ...rest }: any) => (
    <img data-testid='arco-image' src={src} alt={alt} style={style} {...rest} />
  ),
}));

vi.mock('@icon-park/react', () => ({
  Close: () => <span data-testid='icon-close'>X</span>,
}));

// "Image not found" placeholder SVG (same as in fsBridge.ts)
const PLACEHOLDER_SVG =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4=';

const REAL_IMAGE_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

import FilePreview from '../../src/renderer/components/media/FilePreview';

// Helper: flush microtasks (promise callbacks)
const flushMicrotasks = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe('FilePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getFileMetadataMock.mockResolvedValue({ size: 1024 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders image immediately when getImageBase64 returns real data', async () => {
    getImageBase64Mock.mockResolvedValue(REAL_IMAGE_B64);

    render(<FilePreview path='/workspace/test.png' onRemove={vi.fn()} />);

    // Flush the initial promise resolution
    await flushMicrotasks();

    const img = screen.getByTestId('arco-image');
    expect(img).toHaveAttribute('src', REAL_IMAGE_B64);
    expect(getImageBase64Mock).toHaveBeenCalledTimes(1);
  });

  it('retries when getImageBase64 returns placeholder then succeeds', async () => {
    getImageBase64Mock.mockResolvedValueOnce(PLACEHOLDER_SVG).mockResolvedValueOnce(REAL_IMAGE_B64);

    render(<FilePreview path='/workspace/pasted_image.png' onRemove={vi.fn()} />);

    // Flush initial promise → schedules retry timer
    await flushMicrotasks();
    expect(getImageBase64Mock).toHaveBeenCalledTimes(1);

    // Advance past retry delay
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    // Flush retry promise
    await flushMicrotasks();

    expect(getImageBase64Mock).toHaveBeenCalledTimes(2);
    const img = screen.getByTestId('arco-image');
    expect(img).toHaveAttribute('src', REAL_IMAGE_B64);
  });

  it('stops retrying after MAX_IMAGE_RETRIES and shows placeholder', async () => {
    getImageBase64Mock.mockResolvedValue(PLACEHOLDER_SVG);

    render(<FilePreview path='/workspace/missing.png' onRemove={vi.fn()} />);

    // Flush initial + 5 retries
    for (let i = 0; i < 6; i++) {
      await flushMicrotasks();
      if (i < 5) {
        await act(async () => {
          vi.advanceTimersByTime(900);
        });
      }
    }

    // 1 initial + 5 retries = 6 calls total
    expect(getImageBase64Mock).toHaveBeenCalledTimes(6);

    // After max retries, should show the placeholder
    const img = screen.getByTestId('arco-image');
    expect(img).toHaveAttribute('src', PLACEHOLDER_SVG);
  });

  it('renders non-image files without retry logic', async () => {
    getFileMetadataMock.mockResolvedValue({ size: 2048 });

    render(<FilePreview path='/workspace/document.pdf' onRemove={vi.fn()} />);

    await flushMicrotasks();

    // Should not attempt to load image
    expect(getImageBase64Mock).not.toHaveBeenCalled();
    expect(screen.getByText('document.pdf')).toBeDefined();
  });

  it('cleans up retry timer on unmount', async () => {
    getImageBase64Mock.mockResolvedValue(PLACEHOLDER_SVG);

    const { unmount } = render(<FilePreview path='/workspace/test.png' onRemove={vi.fn()} />);

    await flushMicrotasks();
    expect(getImageBase64Mock).toHaveBeenCalledTimes(1);

    // Unmount before retry fires
    unmount();

    // Advance past retry delay
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    await flushMicrotasks();

    // Should still be 1 call (no retry after unmount)
    expect(getImageBase64Mock).toHaveBeenCalledTimes(1);
  });
});
