/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Manages the codex-api-proxy child process.
 *
 * Codex CLI requires `wire_api = "responses"` (OpenAI Responses API format),
 * but the POUNDING API only supports the Chat Completions API for most models.
 * This manager starts a local Node.js proxy that translates between the two
 * formats, including SSE streaming.
 *
 * The proxy is auto-started when the backend is ready and auto-restarted on
 * crash (up to 3 attempts within 30 seconds).
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const PROXY_SCRIPT_NAME = 'codexApiProxy.mjs';
const DEFAULT_PORT = 18792;
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_WINDOW_MS = 30_000;
const PORT_DISCOVERY_TIMEOUT_MS = 5_000;

/** File where the proxy writes its actual port for other modules to read. */
function resolveProxyPortFile(): string {
  try {
    const { app } = require('electron');
    if (app && app.isReady()) {
      return path.join(app.getPath('userData'), 'pounding', 'codex-proxy-port');
    }
  } catch {
    /* not in Electron context */
  }
  return path.join(os.homedir(), '.pounding', 'codex-proxy-port');
}

function resolveBundledNode(): string {
  try {
    const resourcesPath = process.resourcesPath;
    if (!resourcesPath) return 'node';

    // Platform key: darwin-arm64, darwin-x64, win32-x64, etc.
    const platformKey = `${process.platform}-${process.arch}`;
    const managedDir = path.join(resourcesPath, 'bundled-poundingcore', platformKey, 'managed-resources');

    // Also check legacy directory name
    const candidates = [managedDir];
    // Add fallback with common platform keys
    if (process.platform === 'darwin') {
      candidates.push(path.join(resourcesPath, 'bundled-poundingcore', 'darwin-arm64', 'managed-resources'));
      candidates.push(path.join(resourcesPath, 'bundled-poundingcore', 'darwin-x64', 'managed-resources'));
    }

    for (const base of candidates) {
      const nodeDir = path.join(base, 'node');
      if (!fs.existsSync(nodeDir)) continue;
      const entries = fs.readdirSync(nodeDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const binName = process.platform === 'win32' ? 'node.exe' : 'node';
        const candidate1 = path.join(nodeDir, entry.name, 'bin', binName);
        if (fs.existsSync(candidate1)) return candidate1;
        const candidate2 = path.join(nodeDir, entry.name, binName);
        if (fs.existsSync(candidate2)) return candidate2;
      }
    }
  } catch {
    /* best-effort */
  }
  return 'node'; // fallback to system node
}

type ProxyStatus = 'stopped' | 'starting' | 'running' | 'failed';

interface CodexProxyState {
  process: ChildProcess | null;
  port: number | null;
  status: ProxyStatus;
  restartCount: number;
  restartWindowStart: number;
  apiKey: string | null;
}

const state: CodexProxyState = {
  process: null,
  port: null,
  status: 'stopped',
  restartCount: 0,
  restartWindowStart: 0,
  apiKey: null,
};

function resolveProxyScriptPath(): string {
  // In production (packaged app), the script is in the same directory as
  // the compiled main process JS files (out/main/).
  // In development, it's in the TypeScript source directory.
  const candidates = [
    // Production: next to compiled index.js (out/main/codexApiProxy.mjs)
    path.join(__dirname, PROXY_SCRIPT_NAME),
    // electron-vite dev: __dirname = out/main/, source is in packages/desktop/src/process/
    path.join(__dirname, '..', '..', '..', 'packages', 'desktop', 'src', 'process', PROXY_SCRIPT_NAME),
    // Fallback: process.cwd() is project root (AionUi/)
    path.join(process.cwd(), 'packages', 'desktop', 'src', 'process', PROXY_SCRIPT_NAME),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Cannot find ${PROXY_SCRIPT_NAME}. Checked: ${candidates.join(', ')}`);
}

function parsePortFromLine(line: string): number | null {
  const match = line.match(/\[proxy\] PORT=(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function startProxy(apiKey: string, upstream: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const scriptPath = resolveProxyScriptPath();

    console.log(`[CodexProxyManager] Starting proxy: ${scriptPath}`);

    const bundledNode = resolveBundledNode();
    console.log(`[CodexProxyManager] Using node binary: ${bundledNode}`);
    const child = spawn(bundledNode, [scriptPath], {
      env: {
        ...process.env,
        POUNDING_API_KEY: apiKey,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let discoveredPort: number | null = null;
    let stdoutBuffer = '';
    let stderrBuffer = '';
    const timeout = setTimeout(() => {
      if (!discoveredPort) {
        child.kill();
        reject(new Error(`Proxy did not emit PORT= line within ${PORT_DISCOVERY_TIMEOUT_MS}ms`));
      }
    }, PORT_DISCOVERY_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutBuffer += text;

      // Forward proxy stdout to main process stdout for diagnostics
      process.stdout.write(text);

      if (!discoveredPort) {
        const port = parsePortFromLine(text);
        if (port) {
          discoveredPort = port;
          clearTimeout(timeout);
          state.process = child;
          state.port = port;
          state.status = 'running';
          // Write port to well-known file so other modules can read it
          // without importing this module (avoids circular dependencies).
          try {
            const portFile = resolveProxyPortFile();
            const dir = path.dirname(portFile);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(portFile, String(port), 'utf-8');
          } catch (err: unknown) {
            console.error(
              `[CodexProxyManager] Failed to write port file: ${err instanceof Error ? err.message : String(err)}`
            );
          }
          console.log(`[CodexProxyManager] Proxy ready on port ${port}`);
          resolve(port);
        }
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuffer += text;
      process.stderr.write(text);
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start proxy process: ${err.message}`));
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timeout);

      if (!discoveredPort) {
        reject(new Error(`Proxy exited before emitting PORT= line (code=${code}, signal=${signal})`));
        return;
      }

      // Proxy crashed after starting successfully — attempt restart
      handleProxyExit(code, signal);
    });
  });
}

function handleProxyExit(code: number | null, signal: string | null): void {
  const now = Date.now();

  // Reset restart counter if outside the window
  if (now - state.restartWindowStart > RESTART_WINDOW_MS) {
    state.restartCount = 0;
    state.restartWindowStart = now;
  }

  state.restartCount++;

  console.warn(
    `[CodexProxyManager] Proxy exited (code=${code}, signal=${signal}). ` +
      `Restart attempt ${state.restartCount}/${MAX_RESTART_ATTEMPTS}`
  );

  if (state.restartCount > MAX_RESTART_ATTEMPTS) {
    console.error(
      `[CodexProxyManager] Proxy crashed ${state.restartCount} times within ${RESTART_WINDOW_MS}ms. Giving up.`
    );
    state.status = 'failed';
    state.process = null;
    return;
  }

  // Restart after 1 second delay
  setTimeout(() => {
    if (state.status === 'failed') return;

    console.log('[CodexProxyManager] Restarting proxy...');
    state.status = 'starting';

    // Read API key from pounding config
    const apiKey = readApiKeyFromConfig() || process.env.POUNDING_API_KEY || '';
    // Read upstream from the resolveCodexBaseUrl logic
    const upstream = 'https://api.mxou.cn/v1';

    startProxy(apiKey, upstream)
      .then((port) => {
        // Re-sync Codex config with the new port
        console.log(`[CodexProxyManager] Re-syncing Codex config after restart on port ${port}`);
        try {
          // Dynamic import to avoid circular dependencies
          import('@process/bridge/services/NewApiDesktopAccountService').then((m) => {
            void m.newApiDesktopAccountService.reconcileManagedRuntimeState().catch((err: unknown) => {
              console.error('[CodexProxyManager] Failed to re-sync config:', err);
            });
          });
        } catch (err: unknown) {
          console.error('[CodexProxyManager] Failed to import config sync:', err);
        }
      })
      .catch((err) => {
        console.error('[CodexProxyManager] Failed to restart proxy:', err.message);
        handleProxyExit(-1, null);
      });
  }, 1000);
}

function readApiKeyFromConfig(): string | undefined {
  try {
    const configPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.pounding', 'config.json');
    if (!fs.existsSync(configPath)) return undefined;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.api?.key || config.api_key || config.token || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Start the codex-api-proxy child process.
 *
 * Called once after the backend is healthy, and again whenever the API key
 * or upstream URL changes (e.g. user re-logins).
 *
 * Returns the actual port the proxy is listening on (may differ from
 * DEFAULT_PORT if the default was in use).
 */
export async function ensureCodexProxyRunning(): Promise<{ port: number } | null> {
  // Already running — but check if API key has changed (e.g. after login)
  if (state.status === 'running' && state.process && state.port) {
    const currentApiKey = readApiKeyFromConfig() || process.env.POUNDING_API_KEY || '';
    if (currentApiKey && state.apiKey && currentApiKey !== state.apiKey) {
      console.log('[CodexProxyManager] API key changed, restarting proxy...');
      try {
        state.process.kill();
      } catch {
        /* ignore */
      }
      state.process = null;
      state.port = null;
      state.status = 'stopped';
      // Fall through to restart below
    } else {
      return { port: state.port };
    }
  }

  // Currently starting — wait for it
  if (state.status === 'starting') {
    // Simple polling wait (status may change via async callbacks)
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const s = state.status as ProxyStatus;
      if (s === 'running' && state.port) {
        return { port: state.port };
      }
      if (s === 'failed') {
        return null;
      }
    }
    return null;
  }

  // Stop any failed/stale process
  if (state.process) {
    try {
      state.process.kill();
    } catch {
      /* ignore */
    }
    state.process = null;
    state.port = null;
  }

  // Start fresh
  state.status = 'starting';
  state.restartCount = 0;
  state.restartWindowStart = Date.now();

  const apiKey = readApiKeyFromConfig() || process.env.POUNDING_API_KEY || '';
  state.apiKey = apiKey;
  const upstream = 'https://api.mxou.cn/v1';

  try {
    const port = await startProxy(apiKey, upstream);
    return { port };
  } catch (err) {
    console.error('[CodexProxyManager] Failed to start proxy:', err);
    state.status = 'failed';
    return null;
  }
}

/**
 * Stop the proxy child process.
 */
export function stopCodexProxy(): void {
  if (state.process) {
    console.log('[CodexProxyManager] Stopping proxy...');
    try {
      state.process.kill();
    } catch {
      /* ignore */
    }
    state.process = null;
    state.port = null;
    state.status = 'stopped';
  }
  // Remove port file on clean shutdown
  try {
    fs.rmSync(resolveProxyPortFile(), { force: true });
  } catch {
    /* ignore */
  }
}

/**
 * Get the current proxy port, if running.
 */
export function getCodexProxyPort(): number | null {
  return state.port;
}

/**
 * Read the proxy port from the well-known file.
 *
 * This can be called from any module (including the AccountService) without
 * creating a circular dependency on CodexProxyManager.
 */
export function readCodexProxyPort(): number | null {
  try {
    const content = fs.readFileSync(resolveProxyPortFile(), 'utf-8').trim();
    const port = parseInt(content, 10);
    if (port > 0 && port < 65536) return port;
    return null;
  } catch {
    return null;
  }
}
