/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { UpdateReleaseInfo } from '@/common/update/updateTypes';

/**
 * Discriminated outcome of an update check. The `available`/`upToDate` field
 * shapes map 1:1 onto the `checkAvailable`/`checkUpToDate` reducer events so
 * both the notification card and the About button reuse the same reducer cases.
 */
export type CheckUpdateOutcome =
  | {
      kind: 'available';
      currentVersion: string;
      updateInfo: UpdateReleaseInfo | null;
      releasePageUrl: string;
      autoUpdateAvailable: boolean;
      autoUpdateInfo: { version: string; releaseNotes?: string } | null;
    }
  | {
      kind: 'upToDate';
      currentVersion: string;
      updateInfo: UpdateReleaseInfo | null;
      releasePageUrl: string;
    }
  | {
      kind: 'error';
      message: string;
    };

export const getIncludePrerelease = () => localStorage.getItem('update.includePrerelease') === 'true';

/**
 * Single source of truth for "is there an update?". Runs the best-effort
 * auto-updater check plus the authoritative manual check, then returns a
 * discriminated outcome. Performs no UI side effects and no dispatch — callers
 * decide how to present the result.
 */
export const runUpdateCheck = async (opts: {
  includePrerelease: boolean;
  fallbackVersion: string;
  checkFailedLabel: string;
}): Promise<CheckUpdateOutcome> => {
  try {
    let autoUpdateAvailable = false;
    let autoUpdateInfo: { version: string; releaseNotes?: string } | null = null;
    try {
      const autoRes = await ipcBridge.autoUpdate.check.invoke({ includePrerelease: opts.includePrerelease });
      if (autoRes?.success && autoRes.data?.updateInfo) {
        autoUpdateAvailable = true;
        autoUpdateInfo = {
          version: autoRes.data.updateInfo.version,
          releaseNotes: autoRes.data.updateInfo.releaseNotes,
        };
      }
    } catch (error) {
      console.warn('Auto-update check error, using manual mode:', error);
    }

    const res = await ipcBridge.update.check.invoke({ includePrerelease: opts.includePrerelease });
    if (!res?.success) {
      throw new Error(res?.msg || opts.checkFailedLabel);
    }

    const currentVersion = res.data?.currentVersion || opts.fallbackVersion;
    const latest = res.data?.latest ?? null;
    const releasePageUrl = latest?.htmlUrl || '';

    if (autoUpdateAvailable || (res.data?.updateAvailable && latest)) {
      return {
        kind: 'available',
        currentVersion,
        updateInfo: latest,
        releasePageUrl,
        autoUpdateAvailable,
        autoUpdateInfo,
      };
    }

    return {
      kind: 'upToDate',
      currentVersion,
      updateInfo: latest,
      releasePageUrl,
    };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
};
