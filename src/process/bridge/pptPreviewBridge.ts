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
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { getEnhancedEnv } from '@process/utils/shellEnv';

interface WatchSession {
  process: ChildProcess;
  port: number;
  aborted: boolean;
}

// Track sessions by filePath — process is tracked immediately after spawn
const sessions = new Map<string, WatchSession>();

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
    console.log('[pptPreview] Killed session for:', filePath);
  }
}

/**
 * Start an officecli watch process and wait for the server URL.
 */
async function startWatch(filePath: string): Promise<string> {
  // Kill any existing/pending session for this file first
  killSession(filePath);

  const port = await findFreePort();
  console.log('[pptPreview] Got free port:', port);
  console.log('[pptPreview] Spawning: officecli watch', filePath, '--port', port);

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
      console.log('[pptPreview] stdout:', text.trim());

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
              console.log('[pptPreview] start resolved:', url);
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
      settle(new Error(`Failed to start officecli: ${err.message}`));
    });

    child.on('exit', (code, signal) => {
      console.log('[pptPreview] process exited: code=', code, 'signal=', signal);
      sessions.delete(filePath);
      settle(new Error(`officecli exited with code ${code}`));
    });
  });
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
  console.log('[pptPreview] Bridge initialized');

  ipcBridge.pptPreview.start.provider(async ({ filePath }) => {
    console.log('[pptPreview] start requested:', filePath);
    try {
      const url = await startWatch(filePath);
      return { url };
    } catch (err) {
      console.error('[pptPreview] start failed:', err);
      throw err;
    }
  });

  ipcBridge.pptPreview.stop.provider(async ({ filePath }) => {
    console.log('[pptPreview] stop requested:', filePath);
    killSession(filePath);
  });
}
