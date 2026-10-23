/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { COMMON_CHROME_PATHS, DEFAULT_EXTERNAL_CHROME_PORT } from '@/common/browser/constants';
import type { ExternalChromeConfig, ExternalChromeStatus } from '@/common/browser/types';

export class ExternalChromeLauncher {
  private spawnedProcesses: Map<number, ChildProcess> = new Map();

  public findChromeExecutable(overridePath?: string): string | null {
    if (overridePath && fs.existsSync(overridePath)) {
      return overridePath;
    }

    const platform = process.platform as 'win32' | 'darwin' | 'linux';
    const pathsToCheck = COMMON_CHROME_PATHS[platform] || [];

    for (const p of pathsToCheck) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  public async probeChrome(port: number = DEFAULT_EXTERNAL_CHROME_PORT): Promise<ExternalChromeStatus> {
    return new Promise((resolve) => {
      const req = http.get(
        {
          host: '127.0.0.1',
          port,
          path: '/json/version',
          timeout: 2000,
        },
        (res) => {
          if (res.statusCode !== 200) {
            resolve({
              running: false,
              port,
              error: `HTTP ${res.statusCode} from Chrome DevTools endpoint`,
            });
            return;
          }

          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve({
                running: true,
                port,
                wsEndpoint: parsed.webSocketDebuggerUrl,
                browserVersion: parsed.Browser,
              });
            } catch (err) {
              resolve({
                running: false,
                port,
                error: `Invalid JSON response: ${err}`,
              });
            }
          });
        }
      );

      req.on('error', (err) => {
        resolve({
          running: false,
          port,
          error: err.message,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          running: false,
          port,
          error: 'Connection timed out',
        });
      });
    });
  }

  public async launch(config: ExternalChromeConfig): Promise<ExternalChromeStatus> {
    const port = config.port || DEFAULT_EXTERNAL_CHROME_PORT;

    // Check if Chrome is already running on this port
    const existing = await this.probeChrome(port);
    if (existing.running) {
      return existing;
    }

    const executable = this.findChromeExecutable(config.chromePath);
    if (!executable) {
      return {
        running: false,
        port,
        error: 'Google Chrome executable could not be found. Please configure the Chrome path in settings.',
      };
    }

    if (!fs.existsSync(config.userDataDir)) {
      fs.mkdirSync(config.userDataDir, { recursive: true });
    }

    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${config.userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ];

    try {
      const child = spawn(executable, args, {
        detached: true,
        stdio: 'ignore',
      });

      child.unref();
      this.spawnedProcesses.set(port, child);

      // Poll up to 10 seconds for Chrome to bind port and respond
      const maxAttempts = 20;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((res) => setTimeout(res, 500));
        const status = await this.probeChrome(port);
        if (status.running) {
          return status;
        }
      }

      return {
        running: false,
        port,
        error: 'Timed out waiting for Chrome remote debugging port to respond',
      };
    } catch (err) {
      return {
        running: false,
        port,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public close(port: number): boolean {
    const proc = this.spawnedProcesses.get(port);
    if (proc) {
      try {
        proc.kill();
      } catch {
        // Ignored
      }
      this.spawnedProcesses.delete(port);
      return true;
    }
    return false;
  }
}

let launcherInstance: ExternalChromeLauncher | null = null;

export function getExternalChromeLauncher(): ExternalChromeLauncher {
  if (!launcherInstance) {
    launcherInstance = new ExternalChromeLauncher();
  }
  return launcherInstance;
}
