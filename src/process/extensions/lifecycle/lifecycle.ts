/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import * as fs from 'fs';
import { fork, type ChildProcess } from 'child_process';
import { getEnhancedEnv } from '@process/utils/shellEnv';
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
export type LifecycleHookValue =
  | string
  | {
      script?: string;
      shell?: {
        cliCommand?: string;
        args?: string[];
      };
      timeout?: number;
    };

export interface LifecycleHooks {
  onActivate?: LifecycleHookValue;
  onDeactivate?: LifecycleHookValue;
  onInstall?: LifecycleHookValue;
  onUninstall?: LifecycleHookValue;
}

export interface LifecycleContext {
  extensionName: string;
  extensionDir: string;
  version: string;
}

/**
 * Default timeout per hook type (ms).
 * Extension developers can override via manifest: { script: "...", timeout: N }.
 */
const DEFAULT_HOOK_TIMEOUTS: Record<keyof LifecycleHooks, number> = {
  onInstall: 120_000, // 2 min — may download binaries
  onUninstall: 60_000, // 1 min — cleanup
  onActivate: 30_000, // 30s
  onDeactivate: 30_000, // 30s
};

/**
 * Run a lifecycle hook script in a forked child process.
 *
 * The hook runs in a separate Node.js process (child_process.fork) so that:
 * - Heavy operations (e.g. `bun add -g`) don't block the main process event loop
 * - A buggy hook crash or process.exit() doesn't take down the application
 * - Timeout can forcibly kill the child without affecting the main process
 *
 * Returns true if the hook ran successfully, false if it failed or doesn't exist.
 */
async function runLifecycleHook(
  extension: LoadedExtension,
  hookName: keyof LifecycleHooks,
  hookValue: LifecycleHookValue
): Promise<boolean> {
  const timeout =
    typeof hookValue === 'string'
      ? DEFAULT_HOOK_TIMEOUTS[hookName]
      : (hookValue.timeout ?? DEFAULT_HOOK_TIMEOUTS[hookName]);

  const script = typeof hookValue === 'string' ? hookValue : hookValue.script;
  const shell = typeof hookValue === 'object' ? hookValue.shell : undefined;

  if (!script && (!shell || !shell.cliCommand)) return false;

  const context: LifecycleContext = {
    extensionName: extension.manifest.name,
    extensionDir: extension.directory,
    version: extension.manifest.version,
  };

  return new Promise<boolean>((resolve) => {
    let child: ChildProcess | undefined;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settle(false, `timed out after ${timeout}ms`);
        child?.kill('SIGKILL');
      }
    }, timeout);

    const settle = (success: boolean, reason?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (success) {
        console.log(`[Extension Lifecycle] ${hookName} completed for "${extension.manifest.name}"`);
      } else {
        console.error(
          `[Extension Lifecycle] ${hookName} failed for "${extension.manifest.name}"${reason ? `: ${reason}` : ''}`
        );
      }
      resolve(success);
    };

    let scriptPath: string | undefined;

    if (script) {
      scriptPath = path.resolve(extension.directory, script);

      // Security: ensure script is within extension directory
      if (!isPathWithinDirectory(scriptPath, extension.directory)) {
        console.warn(
          `[Extension Lifecycle] Path traversal detected in ${hookName} hook for "${extension.manifest.name}": ${script}`
        );
        settle(false, `Path traversal detected in ${hookName} hook: ${script}`);
        return;
      }

      if (!fs.existsSync(scriptPath)) {
        console.warn(`[Extension Lifecycle] Hook script not found for "${extension.manifest.name}": ${scriptPath}`);
        settle(false, `Hook script not found: ${scriptPath}`);
        return;
      }
    }

    const runnerScript = path.join(__dirname, 'lifecycleRunner.js');

    try {
      child = fork(runnerScript, [], {
        cwd: extension.directory,
        env: getEnhancedEnv(),
        silent: false, // inherit stdio so hook console.log is visible
      });
    } catch (error) {
      settle(false, `failed to fork child process: ${error}`);
      return;
    }

    child.on('message', (msg: { success: boolean; error?: string }) => {
      settle(msg.success, msg.error);
    });

    child.on('error', (error) => {
      settle(false, `child process error: ${error.message}`);
    });

    child.on('exit', (code) => {
      // Fallback: settle on any exit, in case the child exits without sending a message
      // (e.g. IPC disconnect, unexpected early exit). settle() is idempotent.
      if (code !== 0) {
        settle(false, `child process exited with code ${code}`);
      } else {
        settle(false, 'child process exited without sending a result');
      }
    });

    // Send hook details to child process
    if (shell && shell.cliCommand) {
      child.send({ type: 'shell', shell, context });
    } else if (script) {
      child.send({ type: 'script', scriptPath, hookName, context });
    }
  });
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
