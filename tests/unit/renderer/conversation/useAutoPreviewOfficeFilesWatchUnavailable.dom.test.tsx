/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tripwire for ELECTRON-2PM (front-end ③): when the backend reports the
 * file-watch service is unavailable (HTTP 503 `FILE_WATCH_UNAVAILABLE` — OS
 * inotify quota exhausted), the office-auto-preview hook must degrade
 * gracefully: no crash, and surface exactly ONE accurate, actionable hint
 * (mention inotify / file-watch handles) — NEVER a "reinstall / missing
 * resources" prompt, which cannot fix a quota problem.
 *
 * If the FILE_WATCH_UNAVAILABLE handling is removed, the hint is never shown and
 * these assertions fail.
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
vi.mock('@arco-design/web-react', () => ({ Message: { warning: warningSpy, error: vi.fn() } }));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ findPreviewTab: vi.fn(() => false), openPreview: vi.fn() }),
}));
vi.mock('@/renderer/hooks/system/useAutoPreviewOfficeFilesEnabled', () => ({
  useAutoPreviewOfficeFilesEnabled: () => true,
}));
vi.mock('react-i18next', () => ({
  // Return the inline defaultValue so the test asserts the real copy.
  useTranslation: () => ({ t: (_k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _k }),
}));

const watchUnavailable503 = () =>
  new BackendHttpError({
    method: 'POST',
    path: '/api/fs/office-watch/start',
    status: 503,
    body: { code: 'FILE_WATCH_UNAVAILABLE', error: 'file watch service unavailable', details: { errno: 24 } },
  });

// Re-import the hook fresh each test so its module-level "warned once" guard resets.
const loadHook = async () =>
  (await import('@/renderer/hooks/file/useAutoPreviewOfficeFiles')).useAutoPreviewOfficeFiles;

beforeEach(() => {
  vi.resetModules();
  startInvoke.mockReset();
  warningSpy.mockReset();
  fileAddedOn.mockReturnValue(() => {});
});
afterEach(() => cleanup());

describe('useAutoPreviewOfficeFiles — FILE_WATCH_UNAVAILABLE graceful degrade (ELECTRON-2PM)', () => {
  it('shows one accurate inotify hint on 503 FILE_WATCH_UNAVAILABLE (no reinstall wording)', async () => {
    startInvoke.mockRejectedValue(watchUnavailable503());
    const useAutoPreviewOfficeFiles = await loadHook();

    await act(async () => {
      renderHook(() => useAutoPreviewOfficeFiles({ conversation_id: 'c1', workspace: '/w' }));
    });

    await waitFor(() => expect(warningSpy).toHaveBeenCalledTimes(1));
    const msg = String(warningSpy.mock.calls[0][0]);
    expect(msg).toMatch(/inotify|file[- ]watch/i);
    expect(msg).not.toMatch(/reinstall|reinstalling|missing resources|incomplete install|重装|缺资源/i);
  });

  it('stays inert (no hint) on an unrelated backend error', async () => {
    startInvoke.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/fs/office-watch/start',
        status: 500,
        body: { code: 'INTERNAL' },
      })
    );
    const useAutoPreviewOfficeFiles = await loadHook();

    await act(async () => {
      renderHook(() => useAutoPreviewOfficeFiles({ conversation_id: 'c1', workspace: '/w' }));
    });

    // Let the rejected prime settle, then assert no toast.
    await new Promise((r) => setTimeout(r, 30));
    expect(warningSpy).not.toHaveBeenCalled();
  });

  it('does not crash and shows no hint when the watch starts successfully', async () => {
    startInvoke.mockResolvedValue(undefined);
    const useAutoPreviewOfficeFiles = await loadHook();

    await act(async () => {
      renderHook(() => useAutoPreviewOfficeFiles({ conversation_id: 'c1', workspace: '/w' }));
    });

    await new Promise((r) => setTimeout(r, 30));
    expect(warningSpy).not.toHaveBeenCalled();
  });
});
