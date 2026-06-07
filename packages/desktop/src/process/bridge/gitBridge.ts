/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bridges the renderer's `git.*` IPC namespace to the main-process
 * `GitService` singleton. Service events are forwarded via
 * `bridge.buildEmitter`, which the adapter broadcasts to every renderer.
 *
 * The bridge is registered once at app start; the subscription on the
 * service's `'changed'` event is idempotent (guarded by an unsubscribe
 * ref) so calling `initGitBridge()` twice is safe.
 */

import type { GitChangedEvent } from '@/common/types/git/gitTypes';
import { ipcBridge } from '@/common';
import { getGitService } from '@process/services/git/GitService';

let changedUnsubscribe: (() => void) | null = null;

export function initGitBridge(): void {
  const service = getGitService();

  // Forward working-tree change events from the service to all renderers.
  // The event payload now includes the resolved repo root so renderers
  // watching a SUBDIRECTORY of a repo can still react to sibling changes.
  if (!changedUnsubscribe) {
    const handler = (event: GitChangedEvent) => {
      ipcBridge.git.changed.emit(event);
    };
    service.on('changed', handler);
    changedUnsubscribe = () => service.off('changed', handler);
  }

  ipcBridge.git.getRepoInfo.provider(async (req) => {
    try {
      const data = await service.getRepoInfo(req);
      return { success: true, data };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.git.getStatus.provider(async (req) => {
    try {
      // Lazy start the watcher the first time a status is requested.
      // `ensureWatch` is refcounted so concurrent getStatus calls for the
      // same workspace stay cheap; unwatch is the matching release.
      await service.ensureWatch(req.workspace);
      const data = await service.getStatus(req);
      return { success: true, data };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.git.init.provider(async (req) => {
    try {
      const data = await service.init(req);
      await service.ensureWatch(req.workspace);
      return { success: true, data };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.git.unwatch.provider(async (req) => {
    try {
      await service.unwatch(req.workspace);
      return { success: true };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.git.getDiff.provider(async (req) => {
    try {
      const data = await service.getDiff(req);
      return { success: true, data };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.git.stageFile.provider(async (req) => {
    try {
      await service.stageFile(req);
      return { success: true };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.git.stageAll.provider(async (req) => {
    try {
      await service.stageAll(req);
      return { success: true };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.git.unstageFile.provider(async (req) => {
    try {
      await service.unstageFile(req);
      return { success: true };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.git.unstageAll.provider(async (req) => {
    try {
      await service.unstageAll(req);
      return { success: true };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.git.discardFile.provider(async (req) => {
    try {
      await service.discardFile(req);
      return { success: true };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.git.getBranches.provider(async (req) => {
    try {
      const data = await service.getBranches(req);
      return { success: true, data };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.git.commit.provider(async (req) => {
    try {
      const data = await service.commit(req);
      return { success: true, data };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });
}

/**
 * Tear down the bridge subscription. Watchers themselves are closed via
 * `GitService.dispose()` from the app `before-quit` hook.
 */
export function disposeGitBridge(): void {
  changedUnsubscribe?.();
  changedUnsubscribe = null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
