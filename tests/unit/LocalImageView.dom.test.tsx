/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getImageBase64Mock = vi.fn();

vi.mock('../../src/common', () => ({
  ipcBridge: {
    fs: {
      getImageBase64: {
        invoke: (...args: any[]) => getImageBase64Mock(...args),
      },
    },
  },
}));

vi.mock('../../src/common/chat/chatLib', () => ({
  joinPath: (...parts: string[]) => parts.filter(Boolean).join('/'),
}));

vi.mock('@icon-park/react', () => ({
  LoadingTwo: () => <span data-testid='icon-loading'>loading</span>,
}));

// "Image not found" placeholder SVG returned by fsBridge.getImageBase64 on ENOENT.
const PLACEHOLDER_SVG =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4=';

const REAL_IMAGE_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

import LocalImageView from '../../src/renderer/components/media/LocalImageView';

const flushMicrotasks = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe('LocalImageView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders image immediately when getImageBase64 returns real data', async () => {
    getImageBase64Mock.mockResolvedValue(REAL_IMAGE_B64);

    render(<LocalImageView src='/workspace/test.png' alt='test' />);

    await flushMicrotasks();

    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img?.getAttribute('src')).toBe(REAL_IMAGE_B64);
    });
    expect(getImageBase64Mock).toHaveBeenCalledTimes(1);
  });

  it('retries when getImageBase64 returns placeholder then succeeds', async () => {
    getImageBase64Mock.mockResolvedValueOnce(PLACEHOLDER_SVG).mockResolvedValueOnce(REAL_IMAGE_B64);

    render(<LocalImageView src='/workspace/pasted_image.png' alt='pasted' />);

    await flushMicrotasks();
    expect(getImageBase64Mock).toHaveBeenCalledTimes(1);
    // Still loading while retry is pending
    expect(screen.getByTestId('icon-loading')).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    await flushMicrotasks();

    expect(getImageBase64Mock).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img?.getAttribute('src')).toBe(REAL_IMAGE_B64);
    });
  });

  it('stops retrying after MAX_IMAGE_RETRIES and renders the placeholder', async () => {
    getImageBase64Mock.mockResolvedValue(PLACEHOLDER_SVG);

    render(<LocalImageView src='/workspace/missing.png' alt='missing' />);

    for (let i = 0; i < 6; i++) {
      await flushMicrotasks();
      if (i < 5) {
        await act(async () => {
          vi.advanceTimersByTime(900);
        });
      }
    }

    // 1 initial + 5 retries = 6 calls
    expect(getImageBase64Mock).toHaveBeenCalledTimes(6);
    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img?.getAttribute('src')).toBe(PLACEHOLDER_SVG);
    });
  });

  it('cleans up retry timer on unmount', async () => {
    getImageBase64Mock.mockResolvedValue(PLACEHOLDER_SVG);

    const { unmount } = render(<LocalImageView src='/workspace/test.png' alt='t' />);

    await flushMicrotasks();
    expect(getImageBase64Mock).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    await flushMicrotasks();

    expect(getImageBase64Mock).toHaveBeenCalledTimes(1);
  });

  it('stops loading and keeps state sane when getImageBase64 rejects', async () => {
    getImageBase64Mock.mockRejectedValue(new Error('ipc failed'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<LocalImageView src='/workspace/broken.png' alt='broken' />);

    await flushMicrotasks();

    expect(getImageBase64Mock).toHaveBeenCalledTimes(1);
    // Loading spinner replaced once the promise settles (even on error).
    await waitFor(() => {
      expect(screen.queryByTestId('icon-loading')).toBeNull();
    });
    errSpy.mockRestore();
  });
});
