/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lifecycle hook runner — executed in a forked child process.
 *
 * Main process forks this script via child_process.fork(), sends hook details
 * via IPC, and waits for a success/failure response. This keeps the main
 * process event loop free while hooks run heavy operations (e.g. bun add -g).
 *
 * Protocol:
 *   Main → Child:  { scriptPath, hookName, context }
 *   Child → Main:  { success: true } | { success: false, error: string }
 */

interface RunRequest {
  scriptPath: string;
  hookName: string;
  context: {
    extensionName: string;
    extensionDir: string;
    version: string;
  };
}

process.on('message', async (msg: RunRequest) => {
  try {
    // eslint-disable-next-line no-eval -- bypasses bundler to load extension script at runtime
    const nativeRequire = eval('require');
    const mod = nativeRequire(msg.scriptPath);
    const hookFn = mod.default || mod[msg.hookName] || mod;

    if (typeof hookFn !== 'function') {
      process.send!({ success: false, error: 'Hook script does not export a callable function' });
      process.exit(1);
      return;
    }

    const result = hookFn(msg.context);
    // Support both sync and async hooks
    if (result && typeof result.then === 'function') {
      await result;
    }

    process.send!({ success: true });
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    process.send!({ success: false, error: errorMessage });
    process.exit(1);
  }
});
