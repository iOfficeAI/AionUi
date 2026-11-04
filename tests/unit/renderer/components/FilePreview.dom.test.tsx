/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ipcBridge } from '@/common';
import FilePreview, { fitImageWithinBounds } from '@/renderer/components/media/FilePreview';

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFileMetadata: { invoke: vi.fn() },
      getImageBase64: { invoke: vi.fn() },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en' } }),
}));

vi.mock('@arco-design/web-react', () => ({
  Image: ({
    src,
    alt,
    width,
    height,
    style,
    className,
  }: {
    src?: string;
    alt?: string;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    className?: string;
  }) => (
    <img
      data-testid='file-preview-arco-image'
      src={src}
      alt={alt}
      width={width}
      height={height}
      style={style}
      className={className}
    />
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/assets/icons/file-icon.svg', () => ({ default: 'file-icon.svg' }));

describe('fitImageWithinBounds', () => {
  it('preserves landscape aspect ratio within max bounds', () => {
    expect(fitImageWithinBounds(1200, 400, 60, 60)).toEqual({ width: 60, height: 20 });
  });

  it('preserves portrait aspect ratio within max bounds', () => {
    expect(fitImageWithinBounds(400, 1200, 60, 60)).toEqual({ width: 20, height: 60 });
  });

  it('does not upscale images smaller than the max bounds', () => {
    expect(fitImageWithinBounds(30, 20, 60, 60)).toEqual({ width: 30, height: 20 });
  });
});

describe('FilePreview image thumbnails', () => {
  beforeEach(() => {
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockReset().mockResolvedValue({ size: 1024 } as never);
    vi.mocked(ipcBridge.fs.getImageBase64.invoke).mockReset().mockResolvedValue('data:image/png;base64,abc');
  });

  it('sizes a landscape thumbnail without forcing a square crop', async () => {
    const OriginalImage = window.Image;
    class MockImage {
      naturalWidth = 1200;
      naturalHeight = 400;
      onload: ((ev: Event) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.(new Event('load')));
      }
    }
    // @ts-expect-error test double for HTMLImageElement
    window.Image = MockImage;

    render(<FilePreview path='/tmp/wide.png' onRemove={() => undefined} readonly />);

    await waitFor(() => {
      const img = screen.getByTestId('file-preview-arco-image');
      expect(img).toHaveAttribute('width', '60');
      expect(img).toHaveAttribute('height', '20');
      expect(img).toHaveClass('object-contain');
    });

    window.Image = OriginalImage;
  });

  it('sizes a portrait thumbnail without forcing a square crop', async () => {
    const OriginalImage = window.Image;
    class MockImage {
      naturalWidth = 400;
      naturalHeight = 1200;
      onload: ((ev: Event) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.(new Event('load')));
      }
    }
    // @ts-expect-error test double for HTMLImageElement
    window.Image = MockImage;

    render(<FilePreview path='/tmp/tall.png' onRemove={() => undefined} readonly />);

    await waitFor(() => {
      const img = screen.getByTestId('file-preview-arco-image');
      expect(img).toHaveAttribute('width', '20');
      expect(img).toHaveAttribute('height', '60');
      expect(img).toHaveClass('object-contain');
    });

    window.Image = OriginalImage;
  });
});
