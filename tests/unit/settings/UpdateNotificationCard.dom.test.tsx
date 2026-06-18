/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutoUpdateStatus, UpdateDownloadProgressEvent, UpdateDownloadRequest } from '@/common/update/updateTypes';

const mocks = vi.hoisted(() => ({
  manualProgressHandler: null as ((evt: UpdateDownloadProgressEvent) => void) | null,
  autoStatusHandler: null as ((evt: AutoUpdateStatus) => void) | null,
  updateOpenHandler: null as ((evt: { source?: 'menu' | 'about' | 'tray' }) => void) | null,
  autoUpdateCheckMock: vi.fn(),
  autoUpdateRestoreDownloadedMock: vi.fn(),
  autoUpdateDownloadMock: vi.fn(),
  autoUpdateCancelDownloadMock: vi.fn(),
  updateCheckMock: vi.fn(),
  updateDownloadMock: vi.fn(),
  updateCancelDownloadMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/components/Markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    autoUpdate: {
      check: { invoke: mocks.autoUpdateCheckMock },
      restoreDownloaded: { invoke: mocks.autoUpdateRestoreDownloadedMock },
      download: { invoke: mocks.autoUpdateDownloadMock },
      cancelDownload: { invoke: mocks.autoUpdateCancelDownloadMock },
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
      cancelDownload: { invoke: mocks.updateCancelDownloadMock },
      downloadProgress: {
        on: vi.fn((handler: (evt: UpdateDownloadProgressEvent) => void) => {
          mocks.manualProgressHandler = handler;
          return vi.fn();
        }),
      },
      open: {
        on: vi.fn((handler: (evt: { source?: 'menu' | 'about' | 'tray' }) => void) => {
          mocks.updateOpenHandler = handler;
          return vi.fn();
        }),
      },
    },
    shell: {
      openExternal: { invoke: vi.fn() },
      openFile: { invoke: vi.fn() },
      showItemInFolder: { invoke: vi.fn() },
    },
  },
}));

import UpdateNotificationCard from '@/renderer/components/settings/UpdateNotificationCard';

describe('UpdateNotificationCard', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '2.1.15');
    mocks.manualProgressHandler = null;
    mocks.autoStatusHandler = null;
    mocks.updateOpenHandler = null;
    mocks.autoUpdateCheckMock.mockResolvedValue({ success: true });
    mocks.autoUpdateRestoreDownloadedMock.mockResolvedValue({ success: true, data: { ready: false } });
    mocks.autoUpdateDownloadMock.mockResolvedValue({ success: true });
    mocks.autoUpdateCancelDownloadMock.mockResolvedValue({ success: true });
    mocks.updateCancelDownloadMock.mockResolvedValue({ success: true });
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
    mocks.updateDownloadMock.mockImplementation(async (request: UpdateDownloadRequest) => ({
      success: true,
      data: {
        downloadId: request.downloadId ?? 'manual-download',
        file_path: '/tmp/AionUi-2.1.14-mac-arm64.dmg',
      },
    }));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a bottom-right notification card for auto-update availability without a dialog', async () => {
    render(<UpdateNotificationCard />);

    await waitFor(() => {
      expect(mocks.autoStatusHandler).toBeTruthy();
    });

    await act(async () => {
      mocks.autoStatusHandler?.({
        status: 'available',
        version: '2.1.14',
        currentVersion: '2.1.13',
        releaseNotes: 'auto notes',
      });
    });

    const card = await screen.findByTestId('update-notification-card');
    expect(card).toHaveClass('fixed');
    expect(card).toHaveClass('right-24px');
    expect(card).toHaveClass('bottom-24px');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.updateCheckMock).toHaveBeenCalled();
    });

    // Release notes moved to a centered modal opened via the Release Log link.
    expect(screen.queryByText('notes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('update.releaseLog'));
    expect(await screen.findByText('notes')).toBeInTheDocument();
  });

  it('restores a cached completed auto-update on mount', async () => {
    mocks.autoUpdateRestoreDownloadedMock.mockResolvedValue({
      success: true,
      data: {
        ready: true,
        version: '2.1.14',
        filePath: '/cache/pending/AionUi-2.1.14-mac.zip',
      },
    });

    render(<UpdateNotificationCard />);

    expect(await screen.findByTestId('update-notification-card')).toBeInTheDocument();
    // Downloaded state shows the "download complete" label + restart button (no progress bar).
    expect(screen.getByText('update.downloadCompleteTitle')).toBeInTheDocument();
    expect(screen.getByText('update.restartNow')).toBeInTheDocument();
    expect(mocks.updateCheckMock).not.toHaveBeenCalled();

    await act(async () => {
      mocks.updateOpenHandler?.({ source: 'menu' });
    });

    expect(screen.getByText('update.restartNow')).toBeInTheDocument();
    expect(mocks.autoUpdateCheckMock).not.toHaveBeenCalled();
    expect(mocks.updateCheckMock).not.toHaveBeenCalled();
  });

  it('does not flash the initial available state while cached restore is pending', async () => {
    let resolveRestore!: (value: { success: boolean; data: { ready: boolean; version: string } }) => void;
    mocks.autoUpdateRestoreDownloadedMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRestore = resolve;
        })
    );

    render(<UpdateNotificationCard />);

    await waitFor(() => {
      expect(mocks.autoStatusHandler).toBeTruthy();
    });

    await act(async () => {
      mocks.autoStatusHandler?.({
        status: 'available',
        version: '2.1.14',
        currentVersion: '2.1.13',
        releaseNotes: 'auto notes',
      });
    });

    expect(screen.queryByTestId('update-notification-card')).not.toBeInTheDocument();
    expect(mocks.updateCheckMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveRestore({
        success: true,
        data: {
          ready: true,
          version: '2.1.14',
        },
      });
    });

    expect(await screen.findByText('update.downloadCompleteTitle')).toBeInTheDocument();
    expect(screen.getByText('update.restartNow')).toBeInTheDocument();
    expect(screen.queryByText('update.downloadButton')).not.toBeInTheDocument();
  });

  it('keeps the download progress bar stable when update entry points are opened again', async () => {
    render(<UpdateNotificationCard />);

    await waitFor(() => {
      expect(mocks.autoStatusHandler).toBeTruthy();
      expect(mocks.updateOpenHandler).toBeTruthy();
    });

    await act(async () => {
      mocks.autoStatusHandler?.({
        status: 'available',
        version: '2.1.14',
        currentVersion: '2.1.13',
        releaseNotes: 'auto notes',
      });
    });

    fireEvent.click(await screen.findByText('update.downloadButton'));

    await act(async () => {
      mocks.autoStatusHandler?.({
        status: 'downloading',
        progress: {
          bytesPerSecond: 524288,
          percent: 42,
          transferred: 1048576,
          total: 4194304,
        },
      });
    });

    const progressBar = await screen.findByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('1.0 MB / 4.0 MB')).toBeInTheDocument();
    expect(screen.getByText('512.0 KB/s')).toBeInTheDocument();

    await act(async () => {
      mocks.updateOpenHandler?.({ source: 'menu' });
    });

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(mocks.autoUpdateCheckMock).not.toHaveBeenCalled();
  });

  it('renders the initial available state without a top-right close button or manual install action', async () => {
    render(<UpdateNotificationCard />);

    await waitFor(() => {
      expect(mocks.autoStatusHandler).toBeTruthy();
    });

    await act(async () => {
      mocks.autoStatusHandler?.({
        status: 'available',
        version: '2.1.14',
        currentVersion: '2.1.13',
        releaseNotes: 'auto notes',
      });
    });

    const card = await screen.findByTestId('update-notification-card');
    expect(card).toHaveTextContent('2.1.13');
    expect(card).toHaveTextContent('2.1.14');
    expect(screen.queryByLabelText('common.close')).not.toBeInTheDocument();
    expect(screen.queryByText('update.manualInstall')).not.toBeInTheDocument();
    expect(screen.getByText('update.later')).toBeInTheDocument();
    expect(screen.getByText('update.downloadButton')).toBeInTheDocument();
  });

  it('shows release-note loading and failure states instead of empty notes', async () => {
    mocks.updateCheckMock.mockImplementation(() => new Promise(() => undefined));
    render(<UpdateNotificationCard />);

    await waitFor(() => {
      expect(mocks.autoStatusHandler).toBeTruthy();
    });

    await act(async () => {
      mocks.autoStatusHandler?.({
        status: 'available',
        version: '2.1.14',
        currentVersion: '2.1.13',
      });
    });

    fireEvent.click(await screen.findByText('update.releaseLog'));
    expect(await screen.findByText('update.releaseNotesLoading')).toBeInTheDocument();

    cleanup();
    mocks.updateCheckMock.mockRejectedValue(new Error('network failed'));
    render(<UpdateNotificationCard />);

    await waitFor(() => {
      expect(mocks.autoStatusHandler).toBeTruthy();
    });

    await act(async () => {
      mocks.autoStatusHandler?.({
        status: 'available',
        version: '2.1.14',
        currentVersion: '2.1.13',
      });
    });

    fireEvent.click(await screen.findByText('update.releaseLog'));
    expect(await screen.findByText('update.releaseNotesFailed')).toBeInTheDocument();
    expect(screen.getByText('update.viewRelease')).toBeInTheDocument();
  });

  it('shows only a close (cancel) icon while downloading and cancel restores the initial state', async () => {
    render(<UpdateNotificationCard />);

    await waitFor(() => {
      expect(mocks.autoStatusHandler).toBeTruthy();
    });

    await act(async () => {
      mocks.autoStatusHandler?.({
        status: 'available',
        version: '2.1.14',
        currentVersion: '2.1.13',
        releaseNotes: 'auto notes',
      });
    });

    fireEvent.click(await screen.findByText('update.downloadButton'));

    await act(async () => {
      mocks.autoStatusHandler?.({
        status: 'downloading',
        progress: {
          bytesPerSecond: 1048576,
          percent: 18,
          transferred: 1048576,
          total: 4194304,
        },
      });
    });

    // Downloading hides text buttons; the only action is the top-right close (cancel) icon.
    expect(screen.queryByText('update.later')).not.toBeInTheDocument();
    expect(screen.queryByText('update.cancel')).not.toBeInTheDocument();
    expect(screen.queryByText('update.minimize')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('update.cancel'));

    await waitFor(() => {
      expect(mocks.autoUpdateCancelDownloadMock).toHaveBeenCalled();
    });
    expect(await screen.findByText('update.downloadButton')).toBeInTheDocument();
    expect(screen.getByText('update.later')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows restart guidance text and later/restart actions after download completes', async () => {
    render(<UpdateNotificationCard />);

    await waitFor(() => {
      expect(mocks.autoStatusHandler).toBeTruthy();
    });

    await act(async () => {
      mocks.autoStatusHandler?.({
        status: 'available',
        version: '2.1.14',
        currentVersion: '2.1.13',
        releaseNotes: 'auto notes',
      });
    });

    fireEvent.click(await screen.findByText('update.downloadButton'));

    await act(async () => {
      mocks.autoStatusHandler?.({
        status: 'downloading',
        progress: {
          bytesPerSecond: 1048576,
          percent: 64,
          transferred: 1048576,
          total: 4194304,
        },
      });
      mocks.autoStatusHandler?.({
        status: 'downloaded',
        version: '2.1.14',
      });
    });

    expect(await screen.findByText('update.downloadCompleteTitle')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('update.later')).toBeInTheDocument();
    expect(screen.getByText('update.restartNow')).toBeInTheDocument();
  });

  it('does not render a close button in the error state', async () => {
    mocks.updateCheckMock.mockRejectedValue(new Error('network failed'));
    render(<UpdateNotificationCard />);

    await waitFor(() => {
      expect(mocks.updateOpenHandler).toBeTruthy();
    });

    await act(async () => {
      mocks.updateOpenHandler?.({ source: 'menu' });
    });

    expect(await screen.findByText('network failed')).toBeInTheDocument();
    expect(screen.queryByLabelText('common.close')).not.toBeInTheDocument();
  });
});
