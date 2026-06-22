/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AutoUpdateStatus, UpdateDownloadProgressEvent, UpdateDownloadRequest } from '@/common/update/updateTypes';

const mocks = vi.hoisted(() => ({
  manualProgressHandler: null as ((evt: UpdateDownloadProgressEvent) => void) | null,
  autoStatusHandler: null as ((evt: AutoUpdateStatus) => void) | null,
  autoUpdateCheckMock: vi.fn(),
  autoUpdateRestoreDownloadedMock: vi.fn(),
  updateCheckMock: vi.fn(),
  updateDownloadMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
    visible ? <div>{children}</div> : null,
}));

vi.mock('@/renderer/components/Markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    autoUpdate: {
      check: { invoke: mocks.autoUpdateCheckMock },
      restoreDownloaded: { invoke: mocks.autoUpdateRestoreDownloadedMock },
      download: { invoke: vi.fn() },
      quitAndInstall: { invoke: vi.fn() },
      status: {
        on: vi.fn((handler: (evt: AutoUpdateStatus) => void) => {
          mocks.autoStatusHandler = handler;
          return vi.fn();
        }),
      },
    },
    update: {
      check: { invoke: mocks.updateCheckMock },
      download: { invoke: mocks.updateDownloadMock },
      downloadProgress: {
        on: vi.fn((handler: (evt: UpdateDownloadProgressEvent) => void) => {
          mocks.manualProgressHandler = handler;
          return vi.fn();
        }),
      },
      open: { on: vi.fn(() => vi.fn()) },
    },
    shell: {
      openExternal: { invoke: vi.fn() },
      openFile: { invoke: vi.fn() },
      showItemInFolder: { invoke: vi.fn() },
    },
  },
}));

import UpdateModal from '@/renderer/components/settings/UpdateModal';

describe('UpdateModal manual install fallback', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '2.1.15');
    mocks.manualProgressHandler = null;
    mocks.autoStatusHandler = null;
    mocks.autoUpdateCheckMock.mockResolvedValue({ success: true });
    mocks.autoUpdateRestoreDownloadedMock.mockResolvedValue({ success: true, data: { ready: false } });
    mocks.updateCheckMock.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '2.1.13',
        updateAvailable: true,
        latest: {
          tagName: 'v2.1.14',
          version: '2.1.14',
          name: 'v2.1.14',
          body: 'notes',
          htmlUrl: 'https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.14',
          prerelease: false,
          draft: false,
          assets: [],
          recommendedAsset: {
            name: 'AionUi-2.1.14-mac-arm64.dmg',
            url: 'https://static.aionui.com/releases/2.1.14/AionUi-2.1.14-mac-arm64.dmg',
            fallbackUrl: 'https://github.com/iOfficeAI/AionUi/releases/download/v2.1.14/AionUi-2.1.14-mac-arm64.dmg',
            size: 123,
          },
        },
      },
    });
    mocks.updateDownloadMock.mockImplementation(async (request: UpdateDownloadRequest) => {
      const downloadId = request.downloadId ?? 'missing-download-id';
      mocks.manualProgressHandler?.({
        downloadId,
        status: 'completed',
        receivedBytes: 123,
        totalBytes: 123,
        percent: 100,
        file_path: '/tmp/AionUi-2.1.14-mac-arm64.dmg',
      });
      return {
        success: true,
        data: {
          downloadId,
          file_path: '/tmp/AionUi-2.1.14-mac-arm64.dmg',
        },
      };
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps fast manual download completion matched to the caller-provided download id', async () => {
    const user = userEvent.setup();
    render(<UpdateModal />);

    act(() => {
      window.dispatchEvent(new Event('aionui-open-update-modal'));
    });

    const downloadAndInstall = await screen.findByText('update.downloadButton');
    await user.click(downloadAndInstall);

    await waitFor(() => {
      expect(screen.getByText('update.restartNow')).toBeInTheDocument();
    });

    expect(mocks.updateDownloadMock).toHaveBeenCalledWith({
      downloadId: expect.any(String),
      url: 'https://static.aionui.com/releases/2.1.14/AionUi-2.1.14-mac-arm64.dmg',
      fallbackUrl: 'https://github.com/iOfficeAI/AionUi/releases/download/v2.1.14/AionUi-2.1.14-mac-arm64.dmg',
      file_name: 'AionUi-2.1.14-mac-arm64.dmg',
    });
    expect(screen.queryByText('update.manualInstall')).not.toBeInTheDocument();
  });

  it('loads release notes when auto-update status opens the modal', async () => {
    render(<UpdateModal />);

    act(() => {
      mocks.autoStatusHandler?.({
        status: 'available',
        version: '2.1.14',
        currentVersion: '2.1.13',
      });
    });

    await waitFor(() => {
      expect(mocks.updateCheckMock).toHaveBeenCalled();
    });

    // Release notes now live in the Release Log modal, opened via the link.
    fireEvent.click(await screen.findByText('update.releaseLog'));
    expect(await screen.findByText('notes')).toBeInTheDocument();
    expect(screen.getByText(/2\.1\.13/)).toBeInTheDocument();
  });
});
