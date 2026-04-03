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
 *   Main → Child:  { type, scriptPath?, hookName?, shell?, context }
 *   Child → Main:  { success: true } | { success: false, error: string }
 */

import { spawn } from 'child_process';

interface RunRequest {
  type: 'script' | 'shell';
  scriptPath?: string;
  hookName?: string;
  shell?: {
    cliCommand: string;
    args?: string[];
  };
  context: {
    extensionName: string;
    extensionDir: string;
    version: string;
  };
}

/**
 * Allowed CLI commands for shell-type lifecycle hooks.
 * Only whitelisted commands can be executed to prevent arbitrary code execution.
 */
const ALLOWED_SHELL_COMMANDS = new Set(['bun', 'bunx']);

async function runShell(msg: RunRequest): Promise<void> {
  const { cliCommand, args = [] } = msg.shell!;

  // Security: only allow whitelisted commands
  const baseCommand = cliCommand.split('/').pop()?.split('\\').pop() ?? cliCommand;
  if (!ALLOWED_SHELL_COMMANDS.has(baseCommand)) {
    throw new Error(
      `Shell command "${cliCommand}" is not allowed. Only [${[...ALLOWED_SHELL_COMMANDS].join(', ')}] are permitted in lifecycle hooks.`
    );
  }

  const child = spawn(cliCommand, args, {
    cwd: msg.context.extensionDir,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  await new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Shell command exited with code ${code}`));
    });
  });
}

async function runScript(msg: RunRequest): Promise<void> {
  // eslint-disable-next-line no-eval -- bypasses bundler to load extension script at runtime
  const nativeRequire = eval('require');
  const mod = nativeRequire(msg.scriptPath);
  const hookFn = mod.default || mod[msg.hookName!] || mod;

  if (typeof hookFn !== 'function') {
    throw new Error('Hook script does not export a callable function');
  }

  const result = hookFn(msg.context);
  if (result && typeof result.then === 'function') {
    await result;
  }
}

process.on('message', async (msg: RunRequest) => {
  try {
    switch (msg.type) {
      case 'shell':
        await runShell(msg);
        break;
      case 'script':
        await runScript(msg);
        break;
      default:
        throw new Error(`Unknown run request type: ${msg.type}`);
    }

    process.send!({ success: true });
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    process.send!({ success: false, error: errorMessage });
    process.exit(1);
  }
});
