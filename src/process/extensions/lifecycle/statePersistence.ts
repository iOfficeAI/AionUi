/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ExtensionState } from '../types';
import { extensionEventBus, ExtensionSystemEvents } from './ExtensionEventBus';
import { getDataPath } from '@process/utils';

const EXTENSION_STATES_FILE_ENV = 'AIONUI_EXTENSION_STATES_FILE';
const DEFAULT_STATES_FILE = 'extension-states.json';

function resolveStatesFile(): string {
  const override = process.env[EXTENSION_STATES_FILE_ENV]?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(getDataPath(), DEFAULT_STATES_FILE);
}

/**
 * Persisted state format on disk.
 * Stored under getDataPath(): ~/.aionui/extension-states.json (Electron release),
 * ~/.aionui-dev/extension-states.json (Electron macOS dev), or the platform-standard
 * app data dir on Windows/Linux. Can be overridden via AIONUI_EXTENSION_STATES_FILE.
 */
interface PersistedStates {
  /** Schema version for future migrations */
  version: 1;
  /** Map of extensionName → persisted state */
  extensions: Record<
    string,
    {
      enabled: boolean;
      disabledAt?: string; // ISO date string
      disabledReason?: string;
      /** Track whether onInstall has been run for this extension */
      installed?: boolean;
      /** Last known version — used for migration detection */
      lastVersion?: string;
    }
  >;
}

/**
 * Load persisted extension states from disk.
 * Returns an empty map if the file doesn't exist or is invalid.
 */
export function loadPersistedStates(): Map<string, ExtensionState & { installed?: boolean; lastVersion?: string }> {
  const result = new Map<string, ExtensionState & { installed?: boolean; lastVersion?: string }>();
  const statesFile = resolveStatesFile();

  try {
    if (!fs.existsSync(statesFile)) {
      return result;
    }
    const raw = fs.readFileSync(statesFile, 'utf-8');
    const data = JSON.parse(raw) as PersistedStates;

    if (data.version !== 1) {
      console.warn('[Extensions] Unknown state file version, ignoring persisted states');
      return result;
    }

    for (const [name, state] of Object.entries(data.extensions)) {
      result.set(name, {
        enabled: state.enabled,
        disabledAt: state.disabledAt ? new Date(state.disabledAt) : undefined,
        disabledReason: state.disabledReason,
        installed: state.installed,
        lastVersion: state.lastVersion,
      });
    }
  } catch (error) {
    console.warn('[Extensions] Failed to load persisted states:', error instanceof Error ? error.message : error);
  }

  return result;
}

/**
 * Save extension states to disk.
 * Creates the target directory if it doesn't exist.
 */
export function savePersistedStates(
  states: Map<string, ExtensionState & { installed?: boolean; lastVersion?: string }>
): void {
  const statesFile = resolveStatesFile();
  const statesDir = path.dirname(statesFile);

  try {
    if (!fs.existsSync(statesDir)) {
      fs.mkdirSync(statesDir, { recursive: true });
    }

    const data: PersistedStates = {
      version: 1,
      extensions: {},
    };

    for (const [name, state] of states) {
      data.extensions[name] = {
        enabled: state.enabled,
        disabledAt: state.disabledAt?.toISOString(),
        disabledReason: state.disabledReason,
        installed: (state as any).installed,
        lastVersion: (state as any).lastVersion,
      };
    }

    // Atomic write: write to temp file then rename
    const tmpFile = statesFile + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, statesFile);

    extensionEventBus.emitLifecycle(ExtensionSystemEvents.STATES_PERSISTED, {
      extensionName: '*',
      version: '0.0.0',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Extensions] Failed to save persisted states:', error instanceof Error ? error.message : error);
  }
}

/**
 * Check if an extension needs its onInstall hook to run.
 * Returns true if:
 * - Extension has never been seen before (first install)
 * - Extension version has changed (upgrade)
 */
export function needsInstallHook(
  extensionName: string,
  currentVersion: string,
  persistedStates: Map<string, ExtensionState & { installed?: boolean; lastVersion?: string }>
): { isFirstInstall: boolean; isUpgrade: boolean } {
  const persisted = persistedStates.get(extensionName);

  if (!persisted || !persisted.installed) {
    return { isFirstInstall: true, isUpgrade: false };
  }

  if (persisted.lastVersion && persisted.lastVersion !== currentVersion) {
    return { isFirstInstall: false, isUpgrade: true };
  }

  return { isFirstInstall: false, isUpgrade: false };
}
