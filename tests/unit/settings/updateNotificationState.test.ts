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
});
