/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AutoUpdateStatus, UpdateDownloadProgressEvent } from '@/common/update/updateTypes';
import { uuid } from '@/common/utils';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  initialUpdateNotificationState,
  updateNotificationReducer,
  type UpdateNotificationActiveTask,
  type UpdateNotificationOpenSource,
  type UpdateNotificationProgress,
  type UpdateNotificationState,
} from './updateNotificationState';
import { getIncludePrerelease, runUpdateCheck, type CheckUpdateOutcome } from './checkForUpdatesShared';
import { setUpdateReadyState } from './updateReadyState';

type AvailableOutcome = Extract<CheckUpdateOutcome, { kind: 'available' }>;

export const UPDATE_AVAILABLE_EVENT = 'aionui-update-available';

declare const __APP_VERSION__: string;

const formatSpeed = (bytesPerSecond: number) => {
  if (bytesPerSecond > 1024 * 1024) {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
};

export const formatUpdateSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const toAutoProgress = (evt: AutoUpdateStatus): UpdateNotificationProgress | null => {
  if (!evt.progress) return null;
  return {
    percent: Math.round(evt.progress.percent),
    transferred: evt.progress.transferred,
    total: evt.progress.total,
    speed: formatSpeed(evt.progress.bytesPerSecond),
  };
};

const toManualProgress = (evt: UpdateDownloadProgressEvent): UpdateNotificationProgress => ({
  percent: Math.round(evt.percent ?? 0),
  transferred: evt.receivedBytes ?? 0,
  total: evt.totalBytes ?? 0,
  speed: formatSpeed(evt.bytesPerSecond ?? 0),
});

const createInitialState = (): UpdateNotificationState => ({
  ...initialUpdateNotificationState,
  currentVersion: __APP_VERSION__,
});

const reduceNotificationState = (
  current: UpdateNotificationState,
  event: Parameters<typeof updateNotificationReducer>[1]
): UpdateNotificationState => updateNotificationReducer(current, event).state;

const RELEASES_PAGE_URL = 'https://github.com/iOfficeAI/AionUi/releases';

export const useUpdateNotificationController = () => {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(reduceNotificationState, undefined, createInitialState);
  const stateRef = useRef(state);
  const restoreDownloadedPendingRef = useRef(true);
  const pendingAutoAvailableRef = useRef<AutoUpdateStatus | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const loadManualReleaseInfoForDisplay = useCallback(async () => {
    try {
      const res = await ipcBridge.update.check.invoke({
        includePrerelease: getIncludePrerelease(),
      });
      if (res?.success && res.data?.latest) {
        dispatch({
          type: 'manualReleaseInfoLoaded',
          updateInfo: res.data.latest,
          releasePageUrl: res.data.latest.htmlUrl || '',
        });
      }
    } catch (error) {
      console.warn('Manual release info check error:', error);
      dispatch({
        type: 'manualReleaseInfoFailed',
        releasePageUrl: stateRef.current.releasePageUrl || RELEASES_PAGE_URL,
      });
    }
  }, []);

  const dispatchAutoAvailable = useCallback(
    (evt: AutoUpdateStatus) => {
      dispatch({
        type: 'autoStatusAvailable',
        version: evt.version || '',
        currentVersion: evt.currentVersion || __APP_VERSION__,
        releaseNotes: evt.releaseNotes,
      });
      void loadManualReleaseInfoForDisplay();
    },
    [loadManualReleaseInfoForDisplay]
  );

  const checkForUpdates = useCallback(async () => {
    dispatch({ type: 'checkStarted' });

    const outcome = await runUpdateCheck({
      includePrerelease: getIncludePrerelease(),
      fallbackVersion: __APP_VERSION__,
      checkFailedLabel: t('update.checkFailed'),
    });

    switch (outcome.kind) {
      case 'available':
        dispatch({
          type: 'checkAvailable',
          currentVersion: outcome.currentVersion,
          updateInfo: outcome.updateInfo,
          releasePageUrl: outcome.releasePageUrl,
          autoUpdateAvailable: outcome.autoUpdateAvailable,
          autoUpdateInfo: outcome.autoUpdateInfo,
        });
        return;
      case 'upToDate':
        dispatch({
          type: 'checkUpToDate',
          currentVersion: outcome.currentVersion,
          updateInfo: outcome.updateInfo,
          releasePageUrl: outcome.releasePageUrl,
        });
        return;
      case 'error':
        dispatch({ type: 'checkError', message: outcome.message });
        return;
    }
  }, [t]);

  // Present an already-fetched "available" outcome directly, with no checking
  // flash and no second IPC check. Respects an in-progress/ready download so a
  // background download is never clobbered by a fresh available result.
  const presentAvailableOutcome = useCallback((outcome: AvailableOutcome) => {
    const current = stateRef.current;
    if (current.status === 'downloading' || current.status === 'downloaded') {
      dispatch({ type: 'openRequested', source: 'about', userInitiated: true });
      return;
    }
    dispatch({
      type: 'checkAvailable',
      currentVersion: outcome.currentVersion,
      updateInfo: outcome.updateInfo,
      releasePageUrl: outcome.releasePageUrl,
      autoUpdateAvailable: outcome.autoUpdateAvailable,
      autoUpdateInfo: outcome.autoUpdateInfo,
    });
  }, []);

  const restoreDownloadedUpdate = useCallback(async () => {
    try {
      const res = await ipcBridge.autoUpdate.restoreDownloaded.invoke();
      if (!res?.success || !res.data?.ready || !res.data.version) {
        restoreDownloadedPendingRef.current = false;
        const pendingAutoAvailable = pendingAutoAvailableRef.current;
        pendingAutoAvailableRef.current = null;
        if (pendingAutoAvailable) {
          dispatchAutoAvailable(pendingAutoAvailable);
        }
        return;
      }
      pendingAutoAvailableRef.current = null;
      dispatch({
        type: 'autoDownloadedRestored',
        version: res.data.version,
        currentVersion: res.data.currentVersion || __APP_VERSION__,
        releaseNotes: res.data.releaseNotes,
        size: res.data.size,
      });
    } catch (error) {
      console.warn('Restore downloaded auto-update error:', error);
      const pendingAutoAvailable = pendingAutoAvailableRef.current;
      pendingAutoAvailableRef.current = null;
      if (pendingAutoAvailable) {
        dispatchAutoAvailable(pendingAutoAvailable);
      }
    } finally {
      restoreDownloadedPendingRef.current = false;
    }
  }, [dispatchAutoAvailable]);

  useEffect(() => {
    void restoreDownloadedUpdate();
  }, [restoreDownloadedUpdate]);

  const openUpdateNotification = useCallback(
    (source: UpdateNotificationOpenSource, userInitiated: boolean) => {
      const current = stateRef.current;
      dispatch({ type: 'openRequested', source, userInitiated });
      if (current.status !== 'downloading' && current.status !== 'downloaded') {
        void checkForUpdates();
      }
    },
    [checkForUpdates]
  );

  useEffect(() => {
    const removeOpenListener = ipcBridge.update.open.on((evt) => {
      openUpdateNotification(evt?.source ?? 'menu', true);
    });
    const handleWindowOpen = (evt: Event) => {
      const source = (evt as CustomEvent<{ source?: UpdateNotificationOpenSource }>).detail?.source ?? 'about';
      openUpdateNotification(source, true);
    };
    window.addEventListener('aionui-open-update-modal', handleWindowOpen);

    // The About button runs its own check and only reveals the card when an
    // update is actually available, handing over the already-fetched outcome.
    const handleAvailable = (evt: Event) => {
      const outcome = (evt as CustomEvent<AvailableOutcome>).detail;
      if (outcome?.kind === 'available') {
        presentAvailableOutcome(outcome);
      }
    };
    window.addEventListener(UPDATE_AVAILABLE_EVENT, handleAvailable);

    return () => {
      removeOpenListener();
      window.removeEventListener('aionui-open-update-modal', handleWindowOpen);
      window.removeEventListener(UPDATE_AVAILABLE_EVENT, handleAvailable);
    };
  }, [openUpdateNotification, presentAvailableOutcome]);

  useEffect(() => {
    const removeListener = ipcBridge.autoUpdate.status.on((evt: AutoUpdateStatus) => {
      if (!evt) return;

      switch (evt.status) {
        case 'available':
          if (restoreDownloadedPendingRef.current) {
            pendingAutoAvailableRef.current = evt;
            break;
          }
          dispatchAutoAvailable(evt);
          break;
        case 'downloading': {
          const progress = toAutoProgress(evt);
          if (progress) {
            dispatch({ type: 'autoProgress', progress });
          }
          break;
        }
        case 'downloaded':
          dispatch({ type: 'autoDownloaded' });
          break;
        case 'error':
          dispatch({ type: 'autoError', message: evt.error || t('update.downloadFailed') });
          break;
        case 'checking':
        case 'not-available':
        case 'cancelled':
          break;
      }
    });

    return () => removeListener();
  }, [dispatchAutoAvailable, t]);

  useEffect(() => {
    const removeProgressListener = ipcBridge.update.downloadProgress.on((evt: UpdateDownloadProgressEvent) => {
      if (!evt) return;
      dispatch({
        type: 'manualProgress',
        downloadId: evt.downloadId,
        status: evt.status,
        progress: toManualProgress(evt),
        filePath: evt.file_path,
        error: evt.error || t('update.downloadFailed'),
      });
    });

    return () => removeProgressListener();
  }, [t]);

  const openReleasePage = useCallback(() => {
    if (!state.releasePageUrl) return;
    void ipcBridge.shell.openExternal.invoke(state.releasePageUrl).catch((error) => {
      console.error('Failed to open release page:', error);
    });
  }, [state.releasePageUrl]);

  const startAutoDownload = useCallback(async () => {
    dispatch({ type: 'autoDownloadStarted' });
    const res = await ipcBridge.autoUpdate.download.invoke();
    if (!res?.success) {
      dispatch({ type: 'autoError', message: res?.msg || t('update.downloadStartFailed') });
    }
  }, [t]);

  const startManualInstallDownload = useCallback(async () => {
    const asset = state.updateInfo?.recommendedAsset;
    if (!asset) return;

    const callerDownloadId = uuid();
    dispatch({ type: 'manualDownloadStarted', downloadId: callerDownloadId });

    const res = await ipcBridge.update.download.invoke({
      downloadId: callerDownloadId,
      url: asset.url,
      fallbackUrl: asset.fallbackUrl,
      file_name: asset.name,
    });
    if (!res?.success || !res.data) {
      dispatch({ type: 'checkError', message: res?.msg || t('update.downloadStartFailed') });
      return;
    }
    dispatch({
      type: 'manualDownloadReady',
      downloadId: res.data.downloadId,
      filePath: res.data.file_path,
    });
  }, [state.updateInfo?.recommendedAsset, t]);

  const startDownload = useCallback(() => {
    if (state.autoUpdateAvailable) {
      void startAutoDownload();
      return;
    }
    void startManualInstallDownload();
  }, [startAutoDownload, startManualInstallDownload, state.autoUpdateAvailable]);

  const quitAndInstall = useCallback(() => {
    if (stateRef.current.downloadPath) {
      void ipcBridge.shell.openFile.invoke(stateRef.current.downloadPath);
      return;
    }
    void ipcBridge.autoUpdate.quitAndInstall.invoke();
  }, []);

  const openFile = useCallback(() => {
    if (!state.downloadPath) return;
    void ipcBridge.shell.openFile.invoke(state.downloadPath);
  }, [state.downloadPath]);

  const showInFolder = useCallback(() => {
    if (!state.downloadPath) return;
    void ipcBridge.shell.showItemInFolder.invoke(state.downloadPath);
  }, [state.downloadPath]);

  const dismiss = useCallback((reason: 'later' | 'close') => {
    dispatch({ type: 'dismissRequested', reason });
  }, []);

  const cancelTask = useCallback(async (task: UpdateNotificationActiveTask | null) => {
    if (!task) return;
    if (task.kind === 'manual') {
      await ipcBridge.update.cancelDownload.invoke({ downloadId: task.id });
      return;
    }
    await ipcBridge.autoUpdate.cancelDownload.invoke();
  }, []);

  const cancelDownload = useCallback(() => {
    const task = stateRef.current.activeTask;
    dispatch({ type: 'cancelDownloadRequested' });
    void cancelTask(task).catch((error) => {
      dispatch({
        type: 'autoError',
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, [cancelTask]);

  const minimize = useCallback(() => {
    dispatch({ type: 'minimizeRequested' });
  }, []);

  const restore = useCallback(() => {
    dispatch({ type: 'restoreRequested' });
  }, []);

  const versionLabel = useMemo(() => state.updateInfo?.version || state.autoUpdateInfo?.version || '', [state]);
  const showManualInstallFallback = Boolean(state.autoUpdateAvailable && state.updateInfo?.recommendedAsset);

  useEffect(() => {
    if (state.status === 'downloaded' && versionLabel) {
      setUpdateReadyState({
        ready: true,
        version: versionLabel,
        filePath: state.downloadPath || undefined,
      });
      return;
    }
    if (state.status === 'available' || state.status === 'idle' || state.status === 'error') {
      setUpdateReadyState({
        ready: false,
        version: '',
      });
    }
  }, [state.downloadPath, state.status, versionLabel]);

  return {
    state,
    versionLabel,
    showManualInstallFallback,
    actions: {
      checkForUpdates,
      openReleasePage,
      startManualInstallDownload,
      startDownload,
      quitAndInstall,
      openFile,
      showInFolder,
      dismiss,
      cancelDownload,
      minimize,
      restore,
    },
  };
};
