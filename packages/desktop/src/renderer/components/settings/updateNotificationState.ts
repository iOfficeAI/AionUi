/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UpdateReleaseInfo } from '@/common/update/updateTypes';

type UpdateNotificationStatus =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'success'
  | 'error';

export type UpdateNotificationPresentation = 'card' | 'mini';

export type ReleaseNotesStatus = 'idle' | 'loading' | 'loaded' | 'failed';

type AutoUpdateInfo = {
  version: string;
  releaseNotes?: string;
};

export type UpdateNotificationActiveTask = {
  kind: 'auto' | 'manual';
  id: string;
};

export type UpdateNotificationProgress = {
  percent: number;
  transferred: number;
  total: number;
  speed: string;
};

export type UpdateNotificationState = {
  visible: boolean;
  status: UpdateNotificationStatus;
  autoUpdateAvailable: boolean;
  currentVersion: string;
  autoUpdateInfo: AutoUpdateInfo | null;
  updateInfo: UpdateReleaseInfo | null;
  releasePageUrl: string;
  errorMsg: string;
  downloadPath: string;
  activeTask: UpdateNotificationActiveTask | null;
  progress: UpdateNotificationProgress;
  presentation: UpdateNotificationPresentation;
  releaseNotesStatus: ReleaseNotesStatus;
};

export type UpdateNotificationOpenSource = 'menu' | 'about' | 'tray' | 'startup';

export type UpdateNotificationEvent =
  | {
      type: 'autoStatusAvailable';
      version: string;
      currentVersion?: string;
      releaseNotes?: string;
    }
  | {
      type: 'openRequested';
      source: UpdateNotificationOpenSource;
      userInitiated: boolean;
    }
  | {
      type: 'dismissRequested';
      reason: 'later' | 'close';
    }
  | {
      type: 'minimizeRequested';
    }
  | {
      type: 'restoreRequested';
    }
  | {
      type: 'cancelDownloadRequested';
    }
  | {
      type: 'manualProgress';
      downloadId: string;
      status: 'starting' | 'downloading' | 'completed' | 'error' | 'cancelled';
      progress: UpdateNotificationProgress;
      filePath?: string;
      error?: string;
    }
  | {
      type: 'checkStarted';
    }
  | {
      type: 'checkAvailable';
      currentVersion: string;
      updateInfo: UpdateReleaseInfo | null;
      releasePageUrl: string;
      autoUpdateAvailable: boolean;
      autoUpdateInfo: AutoUpdateInfo | null;
    }
  | {
      type: 'checkUpToDate';
      currentVersion: string;
      updateInfo: UpdateReleaseInfo | null;
      releasePageUrl: string;
    }
  | {
      type: 'checkError';
      message: string;
    }
  | {
      type: 'manualReleaseInfoLoaded';
      updateInfo: UpdateReleaseInfo;
      releasePageUrl: string;
    }
  | {
      type: 'manualReleaseInfoFailed';
      releasePageUrl: string;
    }
  | {
      type: 'autoDownloadStarted';
    }
  | {
      type: 'manualDownloadStarted';
      downloadId: string;
    }
  | {
      type: 'manualDownloadReady';
      downloadId: string;
      filePath: string;
    }
  | {
      type: 'autoProgress';
      progress: UpdateNotificationProgress;
    }
  | {
      type: 'autoDownloaded';
    }
  | {
      type: 'autoDownloadedRestored';
      version: string;
      currentVersion?: string;
      releaseNotes?: string;
      size?: number;
    }
  | {
      type: 'autoError';
      message: string;
    };

export type UpdateNotificationEffect =
  | {
      type: 'loadManualReleaseInfoForDisplay';
    }
  | {
      type: 'cancelDownload';
      task: UpdateNotificationActiveTask;
    };

export type UpdateNotificationResult = {
  state: UpdateNotificationState;
  effects: UpdateNotificationEffect[];
};

export type UpdateNotificationCapabilities = {
  notificationCard: true;
  singletonState: true;
  autoDownloadSingleFlight: true;
  manualDownloadDedupe: true;
};

export const updateNotificationCapabilities: UpdateNotificationCapabilities = {
  notificationCard: true,
  singletonState: true,
  autoDownloadSingleFlight: true,
  manualDownloadDedupe: true,
};

export const initialUpdateNotificationState: UpdateNotificationState = {
  visible: false,
  status: 'idle',
  autoUpdateAvailable: false,
  currentVersion: '',
  autoUpdateInfo: null,
  updateInfo: null,
  releasePageUrl: '',
  errorMsg: '',
  downloadPath: '',
  activeTask: null,
  progress: {
    percent: 0,
    transferred: 0,
    total: 0,
    speed: '',
  },
  presentation: 'card',
  releaseNotesStatus: 'idle',
};

const emptyProgress = (): UpdateNotificationProgress => ({
  percent: 0,
  transferred: 0,
  total: 0,
  speed: '',
});

const completeProgress = (progress: UpdateNotificationProgress): UpdateNotificationProgress => ({
  ...progress,
  percent: 100,
  transferred: progress.total > 0 ? Math.max(progress.transferred, progress.total) : progress.transferred,
});

export const updateNotificationReducer = (
  state: UpdateNotificationState,
  event: UpdateNotificationEvent
): UpdateNotificationResult => {
  switch (event.type) {
    case 'checkStarted':
      return {
        state: {
          ...state,
          visible: true,
          status: 'checking',
          errorMsg: '',
          presentation: 'card',
          releaseNotesStatus: 'idle',
        },
        effects: [],
      };
    case 'autoStatusAvailable':
      return {
        state: {
          ...state,
          visible: true,
          status: 'available',
          autoUpdateAvailable: true,
          currentVersion: event.currentVersion ?? state.currentVersion,
          autoUpdateInfo: {
            version: event.version,
            releaseNotes: event.releaseNotes,
          },
          presentation: 'card',
          releaseNotesStatus: event.releaseNotes ? 'loaded' : 'loading',
        },
        effects: [{ type: 'loadManualReleaseInfoForDisplay' }],
      };
    case 'checkAvailable':
      return {
        state: {
          ...state,
          visible: true,
          status: 'available',
          currentVersion: event.currentVersion,
          updateInfo: event.updateInfo,
          releasePageUrl: event.releasePageUrl,
          autoUpdateAvailable: event.autoUpdateAvailable,
          autoUpdateInfo: event.autoUpdateInfo,
          errorMsg: '',
          presentation: 'card',
          releaseNotesStatus: event.updateInfo?.body || event.autoUpdateInfo?.releaseNotes ? 'loaded' : 'failed',
        },
        effects: [],
      };
    case 'checkUpToDate':
      return {
        state: {
          ...state,
          visible: true,
          status: 'upToDate',
          currentVersion: event.currentVersion,
          updateInfo: event.updateInfo,
          releasePageUrl: event.releasePageUrl,
          errorMsg: '',
          presentation: 'card',
          releaseNotesStatus: 'idle',
        },
        effects: [],
      };
    case 'checkError':
      return {
        state: {
          ...state,
          visible: true,
          status: 'error',
          errorMsg: event.message,
          presentation: 'card',
        },
        effects: [],
      };
    case 'openRequested':
      return {
        state: {
          ...state,
          visible: true,
          presentation: state.presentation === 'mini' ? 'card' : state.presentation,
        },
        effects: [],
      };
    case 'dismissRequested':
      return {
        state: {
          ...state,
          visible: false,
          presentation: 'card',
        },
        effects: [],
      };
    case 'minimizeRequested':
      if (state.status !== 'downloading') {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          visible: true,
          presentation: 'mini',
        },
        effects: [],
      };
    case 'restoreRequested':
      return {
        state: {
          ...state,
          visible: true,
          presentation: 'card',
        },
        effects: [],
      };
    case 'cancelDownloadRequested':
      if (!state.activeTask) {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          visible: true,
          status: 'available',
          activeTask: null,
          progress: emptyProgress(),
          presentation: 'card',
          errorMsg: '',
        },
        effects: [{ type: 'cancelDownload', task: state.activeTask }],
      };
    case 'manualReleaseInfoLoaded':
      return {
        state: {
          ...state,
          updateInfo: event.updateInfo,
          releasePageUrl: event.releasePageUrl,
          releaseNotesStatus: event.updateInfo.body ? 'loaded' : 'failed',
        },
        effects: [],
      };
    case 'manualReleaseInfoFailed':
      return {
        state: {
          ...state,
          releasePageUrl: event.releasePageUrl || state.releasePageUrl,
          releaseNotesStatus: 'failed',
        },
        effects: [],
      };
    case 'autoDownloadStarted':
      return {
        state: {
          ...state,
          status: 'downloading',
          activeTask: { kind: 'auto', id: 'auto' },
          progress: emptyProgress(),
          presentation: 'card',
        },
        effects: [],
      };
    case 'manualDownloadStarted':
      return {
        state: {
          ...state,
          status: 'downloading',
          activeTask: { kind: 'manual', id: event.downloadId },
          progress: emptyProgress(),
          presentation: 'card',
        },
        effects: [],
      };
    case 'manualDownloadReady':
      return {
        state: {
          ...state,
          activeTask:
            state.activeTask?.kind === 'manual'
              ? {
                  kind: 'manual',
                  id: event.downloadId,
                }
              : state.activeTask,
          downloadPath: event.filePath,
        },
        effects: [],
      };
    case 'autoProgress':
      if (state.activeTask?.kind !== 'auto') {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          status: 'downloading',
          activeTask: { kind: 'auto', id: 'auto' },
          progress: {
            ...event.progress,
            percent: Math.max(state.progress.percent, event.progress.percent),
          },
        },
        effects: [],
      };
    case 'autoDownloaded':
      if (state.activeTask?.kind !== 'auto') {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          status: 'downloaded',
          activeTask: null,
          progress: completeProgress(state.progress),
        },
        effects: [],
      };
    case 'autoDownloadedRestored':
      return {
        state: {
          ...state,
          visible: true,
          status: 'downloaded',
          autoUpdateAvailable: true,
          currentVersion: event.currentVersion ?? state.currentVersion,
          autoUpdateInfo: {
            version: event.version,
            releaseNotes: event.releaseNotes,
          },
          activeTask: null,
          progress: completeProgress({
            ...state.progress,
            transferred: event.size ?? state.progress.transferred,
            total: event.size ?? state.progress.total,
          }),
          presentation: 'card',
          releaseNotesStatus: event.releaseNotes ? 'loaded' : state.releaseNotesStatus,
        },
        effects: [],
      };
    case 'autoError':
      if (state.activeTask?.kind !== 'auto') {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          status: 'error',
          activeTask: null,
          errorMsg: event.message,
        },
        effects: [],
      };
    case 'manualProgress':
      if (state.activeTask?.kind !== 'manual' || state.activeTask.id !== event.downloadId) {
        return { state, effects: [] };
      }
      if (event.status === 'completed') {
        return {
          state: {
            ...state,
            status: 'downloaded',
            activeTask: null,
            progress: completeProgress({
              ...event.progress,
              percent: Math.max(state.progress.percent, event.progress.percent),
            }),
            downloadPath: event.filePath ?? state.downloadPath,
          },
          effects: [],
        };
      }
      if (event.status === 'cancelled') {
        return {
          state: {
            ...state,
            status: 'available',
            activeTask: null,
            progress: emptyProgress(),
            presentation: 'card',
          },
          effects: [],
        };
      }
      if (event.status === 'error') {
        return {
          state: {
            ...state,
            status: 'error',
            activeTask: null,
            errorMsg: event.error ?? state.errorMsg,
          },
          effects: [],
        };
      }
      return {
        state: {
          ...state,
          status: 'downloading',
          progress: {
            ...event.progress,
            percent: Math.max(state.progress.percent, event.progress.percent),
          },
        },
        effects: [],
      };
  }
};
