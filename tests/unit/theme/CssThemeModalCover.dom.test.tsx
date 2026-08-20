/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression test for AIONUI-224 / issue #4073.
 *
 * Picking a CSS-theme cover image from a location the backend sandbox refuses
 * (another drive, a cloud-redirected Desktop) made `POST /api/fs/image-base64`
 * answer 403 `PATH_OUTSIDE_SANDBOX`. The modal swallowed that into a
 * `console.error`, so the UI showed nothing at all and users retried, assuming
 * the image was too large. Every failing branch must now raise a toast.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackendHttpError } from '@/common/adapter/httpBridge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en-US' } }),
}));

vi.mock('@renderer/hooks/context/ThemeContext.tsx', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

// CodeMirror needs a real editor surface; jsdom has none.
vi.mock('@uiw/react-codemirror', () => ({
  default: () => <div data-testid='codemirror-stub' />,
}));

const showOpenMock = vi.fn();
const getImageBase64Mock = vi.fn();
vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: { showOpen: { invoke: (...args: unknown[]) => showOpenMock(...args) } },
    fs: { getImageBase64: { invoke: (...args: unknown[]) => getImageBase64Mock(...args) } },
  },
}));

const messageErrorMock = vi.fn();
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: { ...actual.Message, error: (...args: unknown[]) => messageErrorMock(...args) },
  };
});

import CssThemeModal from '@/renderer/pages/settings/AppearanceSettings/CssThemeModal';

const renderModal = () => {
  const onSave = vi.fn();
  render(<CssThemeModal visible theme={null} onClose={vi.fn()} onSave={onSave} onDelete={undefined} />);
  return { onSave };
};

/** Click the dashed cover placeholder — the click bubbles to its onClick parent. */
const clickCoverPicker = async (user: ReturnType<typeof userEvent.setup>) => {
  await act(async () => {
    await user.click(screen.getByText('common.upload'));
  });
};

/** A 403 shaped exactly like the backend `ErrorResponse` envelope. */
const sandboxError = () =>
  new BackendHttpError({
    method: 'POST',
    path: '/api/fs/image-base64',
    status: 403,
    body: {
      success: false,
      error: 'Path is outside the allowed sandbox.',
      code: 'PATH_OUTSIDE_SANDBOX',
      details: { field: 'path', operation: 'access' },
    },
  });

describe('CssThemeModal — cover image picking', () => {
  beforeEach(() => {
    showOpenMock.mockReset();
    getImageBase64Mock.mockReset();
    messageErrorMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the actionable sandbox message when the backend answers 403', async () => {
    showOpenMock.mockResolvedValue(['D:/photos/cover.png']);
    getImageBase64Mock.mockRejectedValue(sandboxError());

    renderModal();
    await clickCoverPicker(userEvent.setup());

    await waitFor(() => expect(messageErrorMock).toHaveBeenCalledTimes(1));
    expect(messageErrorMock).toHaveBeenCalledWith('settings.imagePickOutsideSandbox');
    // The cover must stay empty — the placeholder is still on screen.
    expect(screen.getByText('common.upload')).toBeTruthy();
  });

  it('shows the generic message when the read fails for any other reason', async () => {
    showOpenMock.mockResolvedValue(['/home/me/cover.png']);
    getImageBase64Mock.mockRejectedValue(new Error('boom'));

    renderModal();
    await clickCoverPicker(userEvent.setup());

    await waitFor(() => expect(messageErrorMock).toHaveBeenCalledTimes(1));
    expect(messageErrorMock).toHaveBeenCalledWith('common.failed');
  });

  it('shows the generic message when the backend resolves with an empty payload', async () => {
    showOpenMock.mockResolvedValue(['/home/me/cover.png']);
    getImageBase64Mock.mockResolvedValue(null);

    renderModal();
    await clickCoverPicker(userEvent.setup());

    await waitFor(() => expect(messageErrorMock).toHaveBeenCalledTimes(1));
    expect(messageErrorMock).toHaveBeenCalledWith('common.failed');
  });

  it('stays silent and applies the cover when the read succeeds', async () => {
    const dataUrl = 'data:image/png;base64,COVER';
    showOpenMock.mockResolvedValue(['/home/me/cover.png']);
    getImageBase64Mock.mockResolvedValue(dataUrl);

    renderModal();
    await clickCoverPicker(userEvent.setup());

    await waitFor(() => {
      expect(document.querySelector('img[alt="cover"]')?.getAttribute('src')).toBe(dataUrl);
    });
    expect(messageErrorMock).not.toHaveBeenCalled();
  });

  it('stays silent when the user dismisses the file dialog', async () => {
    showOpenMock.mockResolvedValue([]);

    renderModal();
    await clickCoverPicker(userEvent.setup());

    await waitFor(() => expect(showOpenMock).toHaveBeenCalledTimes(1));
    expect(getImageBase64Mock).not.toHaveBeenCalled();
    expect(messageErrorMock).not.toHaveBeenCalled();
  });
});
