/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import * as fs from 'fs';
import type { LoadedExtension } from '../types';
import { isPathWithinDirectory } from '../sandbox/pathSafety';
import { extensionEventBus, ExtensionSystemEvents, type ExtensionLifecyclePayload } from './ExtensionEventBus';

/**
 * Lifecycle hook scripts that an extension can declare in its manifest.
 *
 * Example in aion-extension.json:
 * ```json
 * {
 *   "lifecycle": {
 *     "onActivate": "scripts/activate.js",
 *     "onDeactivate": "scripts/deactivate.js"
 *   }
 * }
 * ```
 */
export interface LifecycleHooks {
  onActivate?: string;
  onDeactivate?: string;
  onInstall?: string;
  onUninstall?: string;
}

export interface LifecycleContext {
  extensionName: string;
  extensionDir: string;
  version: string;
}

/**
 * Run a lifecycle hook script for an extension.
 * Scripts run in the main process (same as Channel Plugins).
 * Returns true if the hook ran successfully, false if it failed or doesn't exist.
 */
async function runLifecycleHook(
  extension: LoadedExtension,
  hookName: keyof LifecycleHooks,
  scriptRelativePath: string
): Promise<boolean> {
  const scriptPath = path.resolve(extension.directory, scriptRelativePath);

  // Security: ensure script is within extension directory
  if (!isPathWithinDirectory(scriptPath, extension.directory)) {
    console.warn(
      `[Extension Lifecycle] Path traversal detected in ${hookName} hook for "${extension.manifest.name}": ${scriptRelativePath}`
    );
    return false;
  }

  if (!fs.existsSync(scriptPath)) {
    console.warn(`[Extension Lifecycle] Hook script not found for "${extension.manifest.name}": ${scriptPath}`);
    return false;
  }

  const context: LifecycleContext = {
    extensionName: extension.manifest.name,
    extensionDir: extension.directory,
    version: extension.manifest.version,
  };

  try {
    // eslint-disable-next-line no-eval
    const nativeRequire = eval('require');
    const mod = nativeRequire(scriptPath);
    const hookFn = mod.default || mod[hookName] || mod;

    if (typeof hookFn === 'function') {
      const result = hookFn(context);
      // Support both sync and async hooks
      if (result && typeof result.then === 'function') {
        await result;
      }
      console.log(`[Extension Lifecycle] ${hookName} completed for "${extension.manifest.name}"`);
      return true;
    } else {
      console.warn(
        `[Extension Lifecycle] Hook script for "${extension.manifest.name}" does not export a callable function`
      );
      return false;
    }
  } catch (error) {
    console.error(`[Extension Lifecycle] ${hookName} failed for "${extension.manifest.name}":`, error);
    return false;
  }
}

/**
 * Execute the activation lifecycle for an extension.
 * Runs onInstall (if first time) then onActivate hook.
 */
export async function activateExtension(extension: LoadedExtension, isFirstTime: boolean): Promise<void> {
  const lifecycle = extension.manifest.lifecycle;
  const payload: ExtensionLifecyclePayload = {
    extensionName: extension.manifest.name,
    version: extension.manifest.version,
    timestamp: Date.now(),
  };

  if (lifecycle) {
    // First-time install hook
    if (isFirstTime && lifecycle.onInstall) {
      await runLifecycleHook(extension, 'onInstall', lifecycle.onInstall);
      extensionEventBus.emitLifecycle(ExtensionSystemEvents.EXTENSION_INSTALLED, payload);
    }

    // Activation hook
    if (lifecycle.onActivate) {
      await runLifecycleHook(extension, 'onActivate', lifecycle.onActivate);
    }
  }

  extensionEventBus.emitLifecycle(ExtensionSystemEvents.EXTENSION_ACTIVATED, payload);
}

/**
 * Execute the deactivation lifecycle for an extension.
 */
export async function deactivateExtension(extension: LoadedExtension): Promise<void> {
  const lifecycle = extension.manifest.lifecycle;
  const payload: ExtensionLifecyclePayload = {
    extensionName: extension.manifest.name,
    version: extension.manifest.version,
    timestamp: Date.now(),
  };

  if (lifecycle?.onDeactivate) {
    await runLifecycleHook(extension, 'onDeactivate', lifecycle.onDeactivate);
  }

  extensionEventBus.emitLifecycle(ExtensionSystemEvents.EXTENSION_DEACTIVATED, payload);
}

/**
 * Execute the uninstall lifecycle for an extension.
 */
export async function uninstallExtension(extension: LoadedExtension): Promise<void> {
  const lifecycle = extension.manifest.lifecycle;
  const payload: ExtensionLifecyclePayload = {
    extensionName: extension.manifest.name,
    version: extension.manifest.version,
    timestamp: Date.now(),
  };

  if (lifecycle?.onUninstall) {
    await runLifecycleHook(extension, 'onUninstall', lifecycle.onUninstall);
  }

  extensionEventBus.emitLifecycle(ExtensionSystemEvents.EXTENSION_UNINSTALLED, payload);
}
