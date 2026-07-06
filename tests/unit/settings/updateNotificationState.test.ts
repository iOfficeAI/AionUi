/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  initialUpdateNotificationState,
  type UpdateNotificationState,
  updateNotificationCapabilities,
  updateNotificationReducer,
} from '@/renderer/components/settings/updateNotificationState';

describe('updateNotificationReducer', () => {
  it('opens the notification when auto-update reports an available version', () => {
    const result = updateNotificationReducer(initialUpdateNotificationState, {
      type: 'autoStatusAvailable',
      version: '2.2.0',
      currentVersion: '2.1.9',
      releaseNotes: 'release notes',
    });

    expect(result.state.visible).toBe(true);
    expect(result.state.status).toBe('available');
    expect(result.state.autoUpdateAvailable).toBe(true);
    expect(result.state.currentVersion).toBe('2.1.9');
    expect(result.state.autoUpdateInfo).toEqual({
      version: '2.2.0',
      releaseNotes: 'release notes',
    });
    expect(result.effects).toEqual([{ type: 'loadManualReleaseInfoForDisplay' }]);
  });

  it('preserves the active download when an entry opens during downloading', () => {
    const downloadingState: UpdateNotificationState = {
      ...initialUpdateNotificationState,
      visible: false,
      status: 'downloading',
      activeTask: {
        kind: 'manual',
        id: 'manual-1',
      },
      progress: {
        percent: 42,
        transferred: 42,
        total: 100,
        speed: '1.0 MB/s',
      },
    };

    const result = updateNotificationReducer(downloadingState, {
      type: 'openRequested',
      source: 'about',
      userInitiated: true,
    });

    expect(result.state.visible).toBe(true);
    expect(result.state.status).toBe('downloading');
    expect(result.state.activeTask).toEqual({
      kind: 'manual',
      id: 'manual-1',
    });
    expect(result.state.progress).toEqual({
      percent: 42,
      transferred: 42,
      total: 100,
      speed: '1.0 MB/s',
    });
    expect(result.effects).toEqual([]);
  });

  it('hides the notification on later without clearing the active download', () => {
    const downloadingState: UpdateNotificationState = {
      ...initialUpdateNotificationState,
      visible: true,
      status: 'downloading',
      activeTask: {
        kind: 'auto',
        id: 'auto',
      },
      progress: {
        percent: 64,
        transferred: 64,
        total: 100,
        speed: '2.0 MB/s',
      },
    };

    const result = updateNotificationReducer(downloadingState, {
      type: 'dismissRequested',
      reason: 'later',
    });

    expect(result.state.visible).toBe(false);
    expect(result.state.status).toBe('downloading');
    expect(result.state.activeTask).toEqual({
      kind: 'auto',
      id: 'auto',
    });
    expect(result.state.progress.percent).toBe(64);
    expect(result.effects).toEqual([]);
  });

  it('cancels an active download and restores the available update state', () => {
    const downloadingState: UpdateNotificationState = {
      ...initialUpdateNotificationState,
      visible: true,
      status: 'downloading',
      currentVersion: '2.1.13',
      autoUpdateAvailable: true,
      autoUpdateInfo: {
        version: '2.1.14',
        releaseNotes: 'notes',
      },
      activeTask: {
        kind: 'auto',
        id: 'auto',
      },
      progress: {
        percent: 58,
        transferred: 58,
        total: 100,
        speed: '1.0 MB/s',
      },
    };

    const result = updateNotificationReducer(downloadingState, {
      type: 'cancelDownloadRequested',
    } as never);

    expect(result.state.visible).toBe(true);
    expect(result.state.status).toBe('available');
    expect(result.state.activeTask).toBeNull();
    expect(result.state.progress.percent).toBe(0);
    expect(result.state.autoUpdateInfo?.version).toBe('2.1.14');
    expect(result.effects).toEqual([{ type: 'cancelDownload', task: { kind: 'auto', id: 'auto' } }]);
  });

  it('minimizes and restores the active download without changing progress owner', () => {
    const downloadingState: UpdateNotificationState = {
      ...initialUpdateNotificationState,
      visible: true,
      status: 'downloading',
      activeTask: {
        kind: 'manual',
        id: 'manual-1',
      },
      progress: {
        percent: 33,
        transferred: 33,
        total: 100,
        speed: '1.0 MB/s',
      },
    };

    const minimized = updateNotificationReducer(downloadingState, {
      type: 'minimizeRequested',
    } as never);

    expect(minimized.state.visible).toBe(true);
    expect((minimized.state as UpdateNotificationState & { presentation: string }).presentation).toBe('mini');
    expect(minimized.state.activeTask).toEqual({ kind: 'manual', id: 'manual-1' });
    expect(minimized.state.progress.percent).toBe(33);

    const restored = updateNotificationReducer(minimized.state, {
      type: 'restoreRequested',
    } as never);

    expect((restored.state as UpdateNotificationState & { presentation: string }).presentation).toBe('card');
    expect(restored.state.activeTask).toEqual({ kind: 'manual', id: 'manual-1' });
    expect(restored.state.progress.percent).toBe(33);
  });

  it('keeps a 100 percent progress snapshot when auto download completes', () => {
    const downloadingState: UpdateNotificationState = {
      ...initialUpdateNotificationState,
      visible: true,
      status: 'downloading',
      activeTask: {
        kind: 'auto',
        id: 'auto',
      },
      progress: {
        percent: 74,
        transferred: 74,
        total: 100,
        speed: '2.0 MB/s',
      },
    };

    const result = updateNotificationReducer(downloadingState, {
      type: 'autoDownloaded',
    });

    expect(result.state.status).toBe('downloaded');
    expect(result.state.activeTask).toBeNull();
    expect(result.state.progress.percent).toBe(100);
  });

  it('restores a completed auto-update without requiring an active download owner', () => {
    const result = updateNotificationReducer(initialUpdateNotificationState, {
      type: 'autoDownloadedRestored',
      version: '2.1.14',
      currentVersion: '2.1.13',
    } as never);

    expect(result.state.visible).toBe(true);
    expect(result.state.status).toBe('downloaded');
    expect(result.state.autoUpdateAvailable).toBe(true);
    expect(result.state.currentVersion).toBe('2.1.13');
    expect(result.state.autoUpdateInfo).toEqual({ version: '2.1.14' });
    expect(result.state.activeTask).toBeNull();
    expect(result.state.presentation).toBe('card');
    expect(result.state.progress.percent).toBe(100);
    expect(result.effects).toEqual([]);
  });

  it('enters preparing-install after an auto-update install request', () => {
    const downloadedState: UpdateNotificationState = {
      ...initialUpdateNotificationState,
      visible: true,
      status: 'downloaded',
      autoUpdateAvailable: true,
      autoUpdateInfo: { version: '2.2.0' },
      progress: {
        percent: 100,
        transferred: 100,
        total: 100,
        speed: '',
      },
    };

    const result = updateNotificationReducer(downloadedState, {
      type: 'autoPreparingInstall',
      version: '2.2.0',
    } as never);

    expect(result.state.visible).toBe(true);
    expect(result.state.status).toBe('preparing-install');
    expect(result.state.autoUpdateInfo?.version).toBe('2.2.0');
    expect(result.state.progress.percent).toBe(100);
    expect(result.effects).toEqual([]);
  });

  it('shows an error when preparing-install fails before app exit', () => {
    const preparingState: UpdateNotificationState = {
      ...initialUpdateNotificationState,
      visible: true,
      status: 'preparing-install',
      autoUpdateAvailable: true,
      autoUpdateInfo: { version: '2.2.0' },
    };

    const result = updateNotificationReducer(preparingState, {
      type: 'autoError',
      message: 'Preparing installation timed out. Please try again later.',
    });

    expect(result.state.status).toBe('error');
    expect(result.state.activeTask).toBeNull();
    expect(result.state.errorMsg).toBe('Preparing installation timed out. Please try again later.');
    expect(result.effects).toEqual([]);
  });

  it('shows an error when native readiness fails after auto download completes', () => {
    const downloadedState: UpdateNotificationState = {
      ...initialUpdateNotificationState,
      visible: true,
      status: 'downloaded',
      autoUpdateAvailable: true,
      autoUpdateInfo: { version: '2.2.0' },
    };

    const result = updateNotificationReducer(downloadedState, {
      type: 'autoError',
      message: 'Preparing installation failed. Please try again later.',
    });

    expect(result.state.status).toBe('error');
    expect(result.state.activeTask).toBeNull();
    expect(result.state.errorMsg).toBe('Preparing installation failed. Please try again later.');
    expect(result.effects).toEqual([]);
  });

  it('ignores stale manual progress from a different download id', () => {
    const downloadingState: UpdateNotificationState = {
      ...initialUpdateNotificationState,
      visible: true,
      status: 'downloading',
      activeTask: {
        kind: 'manual',
        id: 'current-download',
      },
      progress: {
        percent: 58,
        transferred: 58,
        total: 100,
        speed: '3.0 MB/s',
      },
    };

    const result = updateNotificationReducer(downloadingState, {
      type: 'manualProgress',
      downloadId: 'stale-download',
      status: 'downloading',
      progress: {
        percent: 99,
        transferred: 99,
        total: 100,
        speed: '9.0 MB/s',
      },
    });

    expect(result.state.progress).toEqual({
      percent: 58,
      transferred: 58,
      total: 100,
      speed: '3.0 MB/s',
    });
    expect(result.state.status).toBe('downloading');
    expect(result.effects).toEqual([]);
  });

  it('keeps notification singleton capabilities platform independent', () => {
    expect(updateNotificationCapabilities).toEqual({
      notificationCard: true,
      singletonState: true,
      autoDownloadSingleFlight: true,
      manualDownloadDedupe: true,
    });
  });

  it('shows a one-shot installer failure marker without clobbering update download state', () => {
    const marker = {
      schemaVersion: 1,
      kind: 'app-cannot-be-closed' as const,
      phase: 'customCheckAppRunning' as const,
      silent: true,
      updated: true,
      retryCount: 3,
      instDir: 'D:\\AionUi',
      logPath: 'C:\\Users\\me\\AppData\\Local\\Temp\\aionui-installer-2.1.27-20260702-151830-ab12cd34ef56.log',
      at: '2026-07-01T00:00:00.000Z',
    };

    const result = updateNotificationReducer(initialUpdateNotificationState, {
      type: 'installerLastFailureConsumed',
      marker,
    } as never);

    expect(result.state.visible).toBe(true);
    expect(result.state.status).toBe('installer-last-failure');
    expect(result.state.installerLastFailure).toEqual(marker);
    expect(result.state.activeTask).toBeNull();
    expect(result.effects).toEqual([]);

    const downloadingState: UpdateNotificationState = {
      ...initialUpdateNotificationState,
      visible: true,
      status: 'downloading',
      activeTask: { kind: 'auto', id: 'auto' },
    };
    const ignored = updateNotificationReducer(downloadingState, {
      type: 'installerLastFailureConsumed',
      marker,
    } as never);

    expect(ignored.state.status).toBe('downloading');
    expect(ignored.state.installerLastFailure).toBeUndefined();
  });

  it('queues an installer failure marker during downloaded and preparing states until it can be displayed', () => {
    const marker = {
      schemaVersion: 1,
      kind: 'app-cannot-be-closed' as const,
      phase: 'customCheckAppRunning' as const,
      silent: true,
      updated: true,
      retryCount: 3,
      instDir: 'D:\\AionUi',
      logPath: 'C:\\Users\\me\\AppData\\Local\\Temp\\aionui-installer-2.1.27-20260702-151830-ab12cd34ef56.log',
      at: '2026-07-01T00:00:00.000Z',
    };
    const downloadedState: UpdateNotificationState = {
      ...initialUpdateNotificationState,
      visible: true,
      status: 'downloaded',
      autoUpdateAvailable: true,
      autoUpdateInfo: { version: '2.2.0' },
    };

    const queued = updateNotificationReducer(downloadedState, {
      type: 'installerLastFailureConsumed',
      marker,
    } as never);

    expect(queued.state.status).toBe('downloaded');
    expect(queued.state.installerLastFailure).toBeUndefined();
    expect(queued.state.pendingInstallerLastFailure).toEqual(marker);

    const preparing = updateNotificationReducer(queued.state, {
      type: 'autoPreparingInstall',
      version: '2.2.0',
    } as never);

    expect(preparing.state.status).toBe('preparing-install');
    expect(preparing.state.pendingInstallerLastFailure).toEqual(marker);

    const displayed = updateNotificationReducer(preparing.state, {
      type: 'autoError',
      message: 'Preparing installation failed. Please try again later.',
    });

    expect(displayed.state.visible).toBe(true);
    expect(displayed.state.status).toBe('installer-last-failure');
    expect(displayed.state.installerLastFailure).toEqual(marker);
    expect(displayed.state.pendingInstallerLastFailure).toBeUndefined();
  });
});
