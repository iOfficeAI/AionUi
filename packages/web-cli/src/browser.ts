/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';

type OpenBrowserCommand = {
  command: string;
  args: string[];
  windowsHide?: boolean;
};

export type OpenBrowserResult =
  | { ok: true }
  | {
      ok: false;
      reason: string;
    };

export type OpenBrowserDeps = {
  platform: NodeJS.Platform;
  spawnSync: typeof spawnSync;
};

export type ShouldAutoOpenBrowserOptions = {
  allowRemote: boolean;
  env?: NodeJS.ProcessEnv;
  openFlag?: boolean;
  noOpenFlag?: boolean;
};

function parseBoolean(v: string | undefined): boolean | undefined {
  if (!v) return undefined;
  const normalized = v.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

export function shouldAutoOpenBrowser(opts: ShouldAutoOpenBrowserOptions): boolean {
  if (opts.noOpenFlag) return false;
  if (opts.openFlag) return true;

  const envOverride = parseBoolean(opts.env?.AIONUI_OPEN_BROWSER);
  if (envOverride !== undefined) return envOverride;

  return !opts.allowRemote;
}

export function buildOpenBrowserCommand(url: string, platform: NodeJS.Platform): OpenBrowserCommand | undefined {
  if (platform === 'darwin') {
    return {
      command: 'open',
      args: [url],
    };
  }

  if (platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/c', 'start', '', url],
      windowsHide: true,
    };
  }

  if (['linux', 'freebsd', 'openbsd', 'netbsd', 'aix', 'sunos', 'android'].includes(platform)) {
    return {
      command: 'xdg-open',
      args: [url],
    };
  }

  return undefined;
}

export function openBrowserUrl(
  url: string,
  deps: OpenBrowserDeps = {
    platform: process.platform,
    spawnSync,
  }
): OpenBrowserResult {
  const command = buildOpenBrowserCommand(url, deps.platform);
  if (!command) {
    return {
      ok: false,
      reason: `unsupported platform: ${deps.platform}`,
    };
  }

  const result = deps.spawnSync(command.command, command.args, {
    stdio: 'ignore',
    windowsHide: command.windowsHide ?? false,
  });

  if (result.error) {
    return {
      ok: false,
      reason: result.error.message,
    };
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    return {
      ok: false,
      reason: `${command.command} exited with status ${result.status}`,
    };
  }

  return { ok: true };
}
