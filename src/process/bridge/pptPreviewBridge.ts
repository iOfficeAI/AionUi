/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PPT Preview Bridge
 *
 * Manages officecli watch child processes for live PPT preview.
 * Each pptx file gets one watch process on a unique port.
 * The renderer loads http://localhost:<port> in a webview.
 */

import { ipcBridge } from '@/common';
import { getPlatformServices } from '@/common/platform';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { getEnhancedEnv } from '@process/utils/shellEnv';

interface WatchSession {
  process: ChildProcess;
  port: number;
  aborted: boolean;
}

// Track sessions by filePath — process is tracked immediately after spawn
const sessions = new Map<string, WatchSession>();
// Pending kill timers — delayed stop allows Strict Mode re-mount to reuse sessions
const pendingKills = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Find a free TCP port by binding to port 0.
 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to get port')));
      }
    });
    server.on('error', reject);
  });
}

/**
 * Wait until a TCP connection to localhost:port succeeds.
 */
function waitForPort(port: number, maxRetries = 20, interval = 100): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryConnect = () => {
      const socket = net.connect(port, '127.0.0.1');
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        attempt++;
        if (attempt >= maxRetries) {
          reject(new Error(`Port ${port} not ready after ${maxRetries} attempts`));
        } else {
          setTimeout(tryConnect, interval);
        }
      });
    };
    tryConnect();
  });
}

/**
 * Kill an existing session and remove it from the map.
 */
function killSession(filePath: string): void {
  const session = sessions.get(filePath);
  if (session) {
    session.aborted = true;
    session.process.kill();
    sessions.delete(filePath);
  }
}

/**
 * Background update check — runs at most once per day.
 */
function checkForUpdate(): void {
  const markerPath = path.join(getPlatformServices().paths.getDataDir(), '.officecli-update-check');
  try {
    const stat = fs.statSync(markerPath);
    if (Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000) return; // checked within 24h
  } catch {}

  // Mark as checked (touch file)
  try {
    fs.writeFileSync(markerPath, '');
  } catch {}

  try {
    const localVersion = execSync('officecli --version', {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 10000,
    }).trim();
    const latestUrl = 'https://github.com/iOfficeAI/OfficeCli/releases/latest';
    const effective = execSync(`curl -fsSL -o /dev/null -w "%{url_effective}" ${latestUrl}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    }).trim();
    const remoteVersion = effective.split('/').pop()?.replace(/^v/, '') ?? '';
    if (remoteVersion && remoteVersion !== localVersion) {
      installOfficecli();
    }
  } catch {
    // Silently ignore — not critical
  }
}

/**
 * Auto-install officecli if not found.
 */
function installOfficecli(): boolean {
  try {
    ipcBridge.pptPreview.status.emit({ state: 'installing' });
    if (process.platform === 'win32') {
      execSync(
        'powershell -Command "irm https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.ps1 | iex"',
        { stdio: 'inherit' }
      );
    } else {
      execSync('curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.sh | bash', {
        stdio: 'inherit',
      });
      try {
        execSync('xattr -cr ~/.local/bin/officecli && codesign -s - --force ~/.local/bin/officecli', { stdio: 'pipe' });
      } catch {}
    }
    return true;
  } catch (e) {
    console.error('[pptPreview] Failed to install officecli:', e);
    return false;
  }
}

/**
 * Start an officecli watch process and wait for the server URL.
 * Reuses an existing healthy session if one is already running.
 * Auto-installs officecli on first use if not found.
 */
async function startWatch(filePath: string, retry = false): Promise<string> {
  // Resolve symlinks so the pipe name matches what officecli commands compute
  try {
    filePath = fs.realpathSync(filePath);
  } catch {
    // If realpath fails, use original path
  }

  // Cancel any pending delayed kill (Strict Mode re-mount)
  const pendingTimer = pendingKills.get(filePath);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingKills.delete(filePath);
  }

  // Reuse existing session if process is still alive
  const existing = sessions.get(filePath);
  if (existing && !existing.aborted && existing.process.exitCode === null) {
    const url = `http://localhost:${existing.port}`;
    return url;
  }

  // Kill any existing/pending session for this file first
  killSession(filePath);

  const port = await findFreePort();

  ipcBridge.pptPreview.status.emit({ state: 'starting' });

  const child = spawn('officecli', ['watch', filePath, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: getEnhancedEnv(),
  });

  // Track session immediately so stop can kill it
  const session: WatchSession = { process: child, port, aborted: false };
  sessions.set(filePath, session);

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        killSession(filePath);
        reject(new Error('officecli watch timed out'));
      }
    }, 15000);

    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (err) reject(err);
    };

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      if (!settled && text.includes('Watch:')) {
        // Check if session was aborted while we waited for stdout
        if (session.aborted) {
          settle(new Error('Watch session was aborted'));
          return;
        }
        const url = `http://localhost:${port}`;
        waitForPort(port)
          .then(() => {
            if (session.aborted) {
              settle(new Error('Watch session was aborted'));
              return;
            }
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              resolve(url);
            }
          })
          .catch(() => {
            settle(new Error('officecli watch server did not become ready'));
            killSession(filePath);
          });
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      console.error('[pptPreview] officecli stderr:', data.toString().trim());
    });

    child.on('error', (err) => {
      console.error('[pptPreview] spawn error:', err.message);
      sessions.delete(filePath);
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' && !retry) {
        // officecli not found — try auto-install then retry once
        settle();
        if (installOfficecli()) {
          startWatch(filePath, true).then(resolve, reject);
        } else {
          reject(new Error('officecli is not installed and auto-install failed'));
        }
      } else {
        settle(new Error(`Failed to start officecli: ${err.message}`));
      }
    });

    child.on('exit', (code, signal) => {
      sessions.delete(filePath);
      if (session.aborted) {
        settle();
        return;
      }
      const reason = signal ? `signal ${signal}` : `code ${code}`;
      settle(new Error(`officecli exited with ${reason}`));
    });
  });
}

/**
 * Check if a port belongs to an active PPT preview session.
 * Used by the web server proxy route to validate proxy targets.
 */
export function isActivePreviewPort(port: number): boolean {
  for (const [, session] of sessions) {
    if (session.port === port && !session.aborted && session.process.exitCode === null) {
      return true;
    }
  }
  return false;
}

/**
 * Stop all running watch processes (called on app shutdown).
 */
export function stopAllWatchSessions(): void {
  for (const [filePath] of sessions) {
    killSession(filePath);
  }
}

export function initPptPreviewBridge(): void {
  // Background update check (non-blocking, at most once per day)
  setTimeout(() => checkForUpdate(), 5000);

  ipcBridge.pptPreview.start.provider(async ({ filePath }) => {
    try {
      const url = await startWatch(filePath);
      return { url };
    } catch (err) {
      // Never re-throw — bridge.subscribe() lacks .catch(), so thrown errors
      // become unhandled promise rejections (Sentry ELECTRON-CT).
      console.error('[pptPreview] start failed:', err);
      return { url: '', error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcBridge.pptPreview.stop.provider(async ({ filePath }) => {
    try {
      filePath = fs.realpathSync(filePath);
    } catch {}
    // Delay kill to allow Strict Mode re-mount to reuse the session
    const timer = setTimeout(() => {
      pendingKills.delete(filePath);
      killSession(filePath);
    }, 500);
    pendingKills.set(filePath, timer);
  });
}
