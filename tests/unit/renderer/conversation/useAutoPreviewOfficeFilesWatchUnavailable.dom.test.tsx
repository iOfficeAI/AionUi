/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackendHttpError } from '@/common/adapter/httpBridge';

const startInvoke = vi.fn();
const listInvoke = vi.fn(() => Promise.resolve([]));
const stopInvoke = vi.fn(() => Promise.resolve());
const fileAddedOn = vi.fn(() => () => {});
const warningSpy = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    workspaceOfficeWatch: {
      start: { invoke: startInvoke },
      stop: { invoke: stopInvoke },
      fileAdded: { on: fileAddedOn },
    },
    fs: { listWorkspaceFiles: { invoke: listInvoke } },
  },
}));
vi.mock('@arco-design/web-react', () => ({ Message: { warning: warningSpy } }));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ findPreviewTab: vi.fn(() => false), openPreview: vi.fn() }),
}));
vi.mock('@/renderer/hooks/system/useAutoPreviewOfficeFilesEnabled', () => ({
  useAutoPreviewOfficeFilesEnabled: () => true,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const loadHook = async () =>
  (await import('@/renderer/hooks/file/useAutoPreviewOfficeFiles')).useAutoPreviewOfficeFiles;

beforeEach(() => {
  vi.resetModules();
  startInvoke.mockReset();
  warningSpy.mockReset();
  fileAddedOn.mockReturnValue(() => {});
});

afterEach(() => cleanup());

describe('useAutoPreviewOfficeFiles FILE_WATCH_UNAVAILABLE handling', () => {
  it('shows one localized warning and remains mounted', async () => {
    startInvoke.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/fs/office-watch/start',
        status: 503,
        body: { code: 'FILE_WATCH_UNAVAILABLE' },
      })
    );
    const useAutoPreviewOfficeFiles = await loadHook();

    await act(async () => {
      renderHook(() => useAutoPreviewOfficeFiles({ conversation_id: 'c1', workspace: '/workspace' }));
    });

    await waitFor(() => expect(warningSpy).toHaveBeenCalledTimes(1));
    expect(warningSpy).toHaveBeenCalledWith('conversation.officePreview.fileWatchUnavailable');
  });

  it('does not warn for unrelated backend failures', async () => {
    startInvoke.mockRejectedValue(
      new BackendHttpError({ method: 'POST', path: '/api/fs/office-watch/start', status: 500, body: { code: 'OTHER' } })
    );
    const useAutoPreviewOfficeFiles = await loadHook();

    await act(async () => {
      renderHook(() => useAutoPreviewOfficeFiles({ conversation_id: 'c1', workspace: '/workspace' }));
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(warningSpy).not.toHaveBeenCalled();
  });
});
