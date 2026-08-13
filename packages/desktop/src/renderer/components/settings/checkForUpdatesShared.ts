/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { UpdateReleaseInfo } from '@/common/update/updateTypes';
import semver from 'semver';

/**
 * True only when `candidate` is a strictly greater version than `current`.
 * Guards against downgrade offers (e.g. installed 2.1.54, feed reports 2.1.53)
 * that upstream checks can surface when a channel is rolled back or the local
 * build is ahead of the feed. Coerces loose versions so dev builds still compare.
 */
const isNewerVersion = (candidate: string | null | undefined, current: string): boolean => {
  if (!candidate) return false;
  const currentSemver = semver.valid(current) || semver.coerce(current)?.version;
  const candidateSemver = semver.valid(candidate) || semver.coerce(candidate)?.version;
  return Boolean(currentSemver && candidateSemver && semver.gt(candidateSemver, currentSemver));
};

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
    let autoUpdateInfo: { version: string; releaseNotes?: string } | null = null;
    try {
      const autoRes = await ipcBridge.autoUpdate.check.invoke({ includePrerelease: opts.includePrerelease });
      if (autoRes?.success && autoRes.data?.updateInfo) {
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

    // Never treat a same-or-older feed version as an available update. The
    // auto-updater and CDN manifest can report a version that is not strictly
    // newer than the installed build; comparing here prevents downgrade offers.
    const autoUpdateAvailable = isNewerVersion(autoUpdateInfo?.version, currentVersion);
    const manualUpdateAvailable = Boolean(
      res.data?.updateAvailable && latest && isNewerVersion(latest.version, currentVersion)
    );

    if (autoUpdateAvailable || manualUpdateAvailable) {
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
