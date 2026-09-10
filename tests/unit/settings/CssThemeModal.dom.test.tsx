/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { Message } from '@arco-design/web-react';
import * as coverImageUtils from '@/renderer/pages/settings/AppearanceSettings/coverImageUtils';
import { MAX_COVER_IMAGE_BYTES } from '@/renderer/pages/settings/AppearanceSettings/coverImageUtils';

// Stub heavy / environment-specific deps so the modal renders in jsdom.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext.tsx', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('@uiw/react-codemirror', () => ({
  default: () => <div data-testid='codemirror' />,
}));

vi.mock('@renderer/components/base/AionModal.tsx', () => ({
  default: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
    visible ? <div data-testid='modal'>{children}</div> : null,
}));

// Guard: the fix must NOT route theme covers through the sandboxed backend.
const getImageBase64Mock = vi.fn();
vi.mock('@/common', () => ({
  ipcBridge: {
    fs: { getImageBase64: { invoke: getImageBase64Mock } },
    dialog: { showOpen: { invoke: vi.fn() } },
  },
}));

import CssThemeModal from '@/renderer/pages/settings/AppearanceSettings/CssThemeModal';

const getFileInput = (container: HTMLElement): HTMLInputElement => {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error('cover file input not found');
  return input;
};

const selectFile = (container: HTMLElement, file: File) => {
  fireEvent.change(getFileInput(container), { target: { files: [file] } });
};

describe('CssThemeModal cover upload', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders a browser file input for the cover (no backend read)', () => {
    const { container } = render(<CssThemeModal visible theme={null} onClose={() => {}} onSave={() => {}} />);
    const input = getFileInput(container);
    expect(input.accept).toBe('image/*');
    expect(getImageBase64Mock).not.toHaveBeenCalled();
  });

  it('opens the file picker when the cover box is clicked', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const { container } = render(<CssThemeModal visible theme={null} onClose={() => {}} onSave={() => {}} />);
    const box = container.querySelector('.cursor-pointer') as HTMLElement;
    fireEvent.click(box);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('reads a valid image locally and shows it as the cover preview', async () => {
    const { container } = render(<CssThemeModal visible theme={null} onClose={() => {}} onSave={() => {}} />);
    selectFile(container, new File(['imgdata'], 'bg.png', { type: 'image/png' }));

    await waitFor(() => {
      const img = container.querySelector('img[alt="cover"]') as HTMLImageElement | null;
      expect(img).not.toBeNull();
      expect(img?.src.startsWith('data:image/png;base64,')).toBe(true);
    });
    expect(getImageBase64Mock).not.toHaveBeenCalled();
  });

  it('rejects a non-image file with an error message and no preview', async () => {
    const errorSpy = vi.spyOn(Message, 'error').mockImplementation(() => ({}) as ReturnType<typeof Message.error>);
    const { container } = render(<CssThemeModal visible theme={null} onClose={() => {}} onSave={() => {}} />);
    selectFile(container, new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' }));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('settings.cssTheme.coverInvalidType');
    });
    expect(container.querySelector('img[alt="cover"]')).toBeNull();
  });

  it('rejects an oversized image with the too-large error', async () => {
    const errorSpy = vi.spyOn(Message, 'error').mockImplementation(() => ({}) as ReturnType<typeof Message.error>);
    const { container } = render(<CssThemeModal visible theme={null} onClose={() => {}} onSave={() => {}} />);
    const big = new File([new Uint8Array(MAX_COVER_IMAGE_BYTES + 1)], 'big.png', { type: 'image/png' });
    expect(big.size).toBe(MAX_COVER_IMAGE_BYTES + 1);
    selectFile(container, big);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('settings.cssTheme.coverTooLarge');
    });
    expect(container.querySelector('img[alt="cover"]')).toBeNull();
  });

  it('shows the read-failure error when reading the image throws', async () => {
    vi.spyOn(coverImageUtils, 'readImageFileAsDataUrl').mockRejectedValueOnce(new Error('read failed'));
    const errorSpy = vi.spyOn(Message, 'error').mockImplementation(() => ({}) as ReturnType<typeof Message.error>);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<CssThemeModal visible theme={null} onClose={() => {}} onSave={() => {}} />);
    selectFile(container, new File(['imgdata'], 'bg.png', { type: 'image/png' }));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('settings.cssTheme.coverReadFailed');
    });
    expect(container.querySelector('img[alt="cover"]')).toBeNull();
  });

  it('ignores an empty selection (no file chosen)', () => {
    const errorSpy = vi.spyOn(Message, 'error').mockImplementation(() => ({}) as ReturnType<typeof Message.error>);
    const { container } = render(<CssThemeModal visible theme={null} onClose={() => {}} onSave={() => {}} />);
    fireEvent.change(getFileInput(container), { target: { files: [] } });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(container.querySelector('img[alt="cover"]')).toBeNull();
  });
});
