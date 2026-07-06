/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InstallerLastFailureMarker } from '@/common/update/updateTypes';
import fs from 'node:fs/promises';
import path from 'node:path';

export const INSTALLER_LAST_FAILURE_FILE_NAME = 'installer-last-failure.json';

type ConsumeOptions = {
  appDataDir?: string;
  markerPath?: string;
};

const isString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export function getInstallerLastFailureMarkerPath(appDataDir: string): string {
  return path.join(appDataDir, 'AionUi', INSTALLER_LAST_FAILURE_FILE_NAME);
}

export function parseInstallerLastFailureMarker(raw: unknown): InstallerLastFailureMarker | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;

  if (value.schemaVersion !== 1) return null;
  if (value.kind !== 'app-cannot-be-closed') return null;
  if (value.phase !== 'customCheckAppRunning') return null;
  if (value.silent !== true) return null;
  if (value.updated !== true) return null;
  if (typeof value.retryCount !== 'number' || !Number.isFinite(value.retryCount)) return null;
  if (!isString(value.instDir)) return null;
  if (!isString(value.logPath)) return null;
  if (!isString(value.at)) return null;
  if (value.blockers !== undefined && !Array.isArray(value.blockers)) return null;

  return {
    schemaVersion: 1,
    kind: 'app-cannot-be-closed',
    phase: 'customCheckAppRunning',
    silent: true,
    updated: true,
    retryCount: value.retryCount,
    instDir: value.instDir,
    logPath: value.logPath,
    at: value.at,
    ...(Array.isArray(value.blockers) ? { blockers: value.blockers } : {}),
  };
}

const stripUtf8Bom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

export async function consumeInstallerLastFailure(options: ConsumeOptions): Promise<InstallerLastFailureMarker | null> {
  const markerPath =
    options.markerPath ?? (options.appDataDir ? getInstallerLastFailureMarkerPath(options.appDataDir) : '');
  if (!markerPath) return null;

  let text: string;
  try {
    text = await fs.readFile(markerPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripUtf8Bom(text));
  } catch {
    return null;
  }

  const marker = parseInstallerLastFailureMarker(parsed);
  if (!marker) return null;

  await fs.rm(markerPath, { force: true });
  return marker;
}
