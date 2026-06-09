/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UpdateDownloadProgressEvent, UpdateDownloadRequest } from '@/common/update/updateTypes';

const mocks = vi.hoisted(() => ({
  manualProgressHandler: null as ((evt: UpdateDownloadProgressEvent) => void) | null,
  autoUpdateCheckMock: vi.fn(),
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
      download: { invoke: vi.fn() },
      quitAndInstall: { invoke: vi.fn() },
      status: { on: vi.fn(() => vi.fn()) },
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
    mocks.manualProgressHandler = null;
    mocks.autoUpdateCheckMock.mockResolvedValue({
      success: true,
      data: {
        updateInfo: {
          version: '2.1.14',
          releaseNotes: 'notes',
        },
      },
    });
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
  });

  it('keeps fast manual download completion matched to the caller-provided download id', async () => {
    const user = userEvent.setup();
    render(<UpdateModal />);

    act(() => {
      window.dispatchEvent(new Event('aionui-open-update-modal'));
    });

    const manualInstall = await screen.findByText('update.manualInstall');
    await user.click(manualInstall);

    await waitFor(() => {
      expect(screen.getByText('update.downloadCompleteTitle')).toBeInTheDocument();
    });

    expect(mocks.updateDownloadMock).toHaveBeenCalledWith({
      downloadId: expect.any(String),
      url: 'https://static.aionui.com/releases/2.1.14/AionUi-2.1.14-mac-arm64.dmg',
      fallbackUrl: 'https://github.com/iOfficeAI/AionUi/releases/download/v2.1.14/AionUi-2.1.14-mac-arm64.dmg',
      file_name: 'AionUi-2.1.14-mac-arm64.dmg',
    });
    expect(screen.queryByText('update.downloadingTitle')).not.toBeInTheDocument();
  });
});
