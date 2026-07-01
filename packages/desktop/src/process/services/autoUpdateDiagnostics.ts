/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AutoUpdateStatus } from './autoUpdaterService';

const AUTO_UPDATE_DIAGNOSTICS_FILE = 'auto-update-diagnostics.json';
const MAX_AUTO_UPDATE_EVENTS = 20;

export type AutoUpdateDiagnosticStatus =
  | AutoUpdateStatus['status']
  | 'quit-and-install'
  | 'native-update-ready'
  | 'native-update-error'
  | 'native-update-timeout';

export type AutoUpdateDiagnosticEvent = {
  at: string;
  elapsedMs?: number;
  error?: string;
  platform?: NodeJS.Platform;
  progressPercent?: number;
  status: AutoUpdateDiagnosticStatus;
  total?: number;
  transferred?: number;
  version?: string;
};

export type AutoUpdateDiagnostics = {
  currentAppVersion: string;
  events: AutoUpdateDiagnosticEvent[];
  lastEvent?: AutoUpdateDiagnosticEvent;
  lastQuitAndInstallAt?: string;
};

type AutoUpdateDiagnosticOptions = {
  currentAppVersion: string;
  now?: () => Date;
  userDataPath: string;
};

function getAutoUpdateDiagnosticsPath(userDataPath: string): string {
  return path.join(userDataPath, AUTO_UPDATE_DIAGNOSTICS_FILE);
}

function readDiagnosticsFile(filePath: string): AutoUpdateDiagnostics | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<AutoUpdateDiagnostics>;
    if (typeof parsed.currentAppVersion !== 'string' || !Array.isArray(parsed.events)) return undefined;
    const events = parsed.events.filter((event): event is AutoUpdateDiagnosticEvent => {
      if (!event || typeof event !== 'object') return false;
      return typeof event.at === 'string' && typeof event.status === 'string';
    });
    return {
      currentAppVersion: parsed.currentAppVersion,
      events,
      lastEvent: events.at(-1),
      lastQuitAndInstallAt: typeof parsed.lastQuitAndInstallAt === 'string' ? parsed.lastQuitAndInstallAt : undefined,
    };
  } catch {
    return undefined;
  }
}

function writeDiagnosticsFile(filePath: string, diagnostics: AutoUpdateDiagnostics): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(diagnostics, null, 2));
  } catch {
    // Update diagnostics must never interfere with the updater or startup path.
  }
}

export function appendAutoUpdateDiagnosticEvent(
  state: AutoUpdateDiagnostics,
  event: AutoUpdateDiagnosticEvent
): AutoUpdateDiagnostics {
  const events = [...state.events, event].slice(-MAX_AUTO_UPDATE_EVENTS);
  return {
    currentAppVersion: state.currentAppVersion,
    events,
    lastEvent: event,
    lastQuitAndInstallAt: event.status === 'quit-and-install' ? event.at : state.lastQuitAndInstallAt,
  };
}

function eventFromStatus(status: AutoUpdateStatus, at: string): AutoUpdateDiagnosticEvent {
  return {
    at,
    error: status.error,
    progressPercent: status.progress?.percent,
    status: status.status,
    total: status.progress?.total,
    transferred: status.progress?.transferred,
    version: status.version,
  };
}

function updateAutoUpdateDiagnostics(event: AutoUpdateDiagnosticEvent, options: AutoUpdateDiagnosticOptions): void {
  const filePath = getAutoUpdateDiagnosticsPath(options.userDataPath);
  const previous = readDiagnosticsFile(filePath) ?? {
    currentAppVersion: options.currentAppVersion,
    events: [],
  };
  writeDiagnosticsFile(
    filePath,
    appendAutoUpdateDiagnosticEvent(
      {
        ...previous,
        currentAppVersion: options.currentAppVersion,
      },
      event
    )
  );
}

export function recordAutoUpdateStatus(status: AutoUpdateStatus, options: AutoUpdateDiagnosticOptions): void {
  const at = (options.now ?? (() => new Date()))().toISOString();
  updateAutoUpdateDiagnostics(eventFromStatus(status, at), options);
}

export function recordAutoUpdateQuitAndInstall(options: AutoUpdateDiagnosticOptions): void {
  const at = (options.now ?? (() => new Date()))().toISOString();
  updateAutoUpdateDiagnostics({ at, status: 'quit-and-install' }, options);
}

export function recordAutoUpdateNativeInstallReady(
  event: { elapsedMs?: number; version?: string },
  options: AutoUpdateDiagnosticOptions
): void {
  const at = (options.now ?? (() => new Date()))().toISOString();
  updateAutoUpdateDiagnostics(
    {
      at,
      elapsedMs: event.elapsedMs,
      platform: 'darwin',
      status: 'native-update-ready',
      version: event.version,
    },
    options
  );
}

export function recordAutoUpdateNativeInstallError(
  event: { elapsedMs?: number; error: string; version?: string },
  options: AutoUpdateDiagnosticOptions
): void {
  const at = (options.now ?? (() => new Date()))().toISOString();
  updateAutoUpdateDiagnostics(
    {
      at,
      elapsedMs: event.elapsedMs,
      error: event.error,
      platform: 'darwin',
      status: 'native-update-error',
      version: event.version,
    },
    options
  );
}

export function recordAutoUpdateNativeInstallTimeout(
  event: { elapsedMs: number; version?: string },
  options: AutoUpdateDiagnosticOptions
): void {
  const at = (options.now ?? (() => new Date()))().toISOString();
  updateAutoUpdateDiagnostics(
    {
      at,
      elapsedMs: event.elapsedMs,
      platform: 'darwin',
      status: 'native-update-timeout',
      version: event.version,
    },
    options
  );
}

export function readAutoUpdateDiagnostics(userDataPath: string): AutoUpdateDiagnostics | undefined {
  return readDiagnosticsFile(getAutoUpdateDiagnosticsPath(userDataPath));
}
