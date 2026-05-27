#!/usr/bin/env bun
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure Node/Bun CLI — resets the WebUI admin password for the standalone
 * `bun run webui` host (independent of Electron).
 *
 * After the M6 auth cleanup, SQLite `users` is the single source of truth.
 * Two paths:
 *   1. A `bun run webui` is already running on the default port → reach its
 *      reverse-proxied /api/webui/reset-password directly. Users don't have to
 *      stop the server first; the just-reset password can be used immediately.
 *   2. No webui running → spawn a short-lived aioncore against the same
 *      data-dir, POST /api/webui/reset-password, and stop the backend. This is
 *      the offline / cold-start path.
 *
 * Usage:
 *   bun run resetpass                 # default work dir
 *   bun run resetpass --data-dir /x   # custom work dir
 *   AIONUI_DATA_DIR=/x bun run resetpass
 *   NODE_ENV=production bun run resetpass
 */

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { startBackend, stopBackend } from '@aionui/web-host';

const BACKEND_BINARY = process.platform === 'win32' ? 'aioncore.exe' : 'aioncore';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}i${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}OK${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}ERR${colors.reset} ${msg}`),
  warning: (msg: string) => console.log(`${colors.yellow}WARN${colors.reset} ${msg}`),
  highlight: (msg: string) => console.log(`${colors.cyan}${colors.bright}${msg}${colors.reset}`),
};

function getFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  const next = process.argv[idx + 1];
  return next && !next.startsWith('--') ? next : undefined;
}

/**
 * Same resolution as scripts/webui.ts:resolveBackendDataDir — keep both in sync
 * so `bun run webui` and `bun run resetpass` always target the same SQLite DB.
 * See the comment there for why the default is `~/.aionui-web*` (not `~/.aionui*`).
 */
function resolveWorkDir(): string {
  const override = getFlag('--data-dir') ?? process.env.AIONUI_DATA_DIR;
  if (override && override.trim().length > 0) {
    const resolved = path.resolve(override);
    fs.mkdirSync(resolved, { recursive: true });
    return resolved;
  }
  const suffix =
    process.env.NODE_ENV === 'production' ? '' : process.env.AIONUI_MULTI_INSTANCE === '1' ? '-dev-2' : '-dev';
  const dir = path.join(os.homedir(), `.aionui-web${suffix}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveBackendBinary(): string {
  if (process.env.AIONUI_BACKEND_BIN) return process.env.AIONUI_BACKEND_BIN;

  const bundledBase = process.env.AIONUI_BACKEND_BUNDLED_DIR ?? path.join(repoRoot, 'resources', 'bundled-aioncore');
  const runtimeKey = `${process.platform}-${process.arch}`;
  const bundled = path.join(bundledBase, runtimeKey, BACKEND_BINARY);
  if (fs.existsSync(bundled)) return bundled;

  try {
    const cmd = process.platform === 'win32' ? `where ${BACKEND_BINARY}` : `which ${BACKEND_BINARY}`;
    const found = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim().split(/\r?\n/)[0];
    if (found && fs.existsSync(found)) return found;
  } catch {
    // fall through
  }

  throw new Error(
    `Cannot find "${BACKEND_BINARY}". Set AIONUI_BACKEND_BIN, put it on PATH, or place it at ${bundled}.`
  );
}

/**
 * Same default port as scripts/webui.ts (mirrors WEBUI_DEFAULT_PORT on the
 * desktop side). Callers can override with `--port` / `AIONUI_PORT` to match
 * a non-default webui launch.
 */
function resolveWebUIProbePort(): number {
  const cli = getFlag('--port');
  if (cli && /^\d+$/.test(cli)) return Number(cli);
  const env = process.env.AIONUI_PORT ?? process.env.PORT;
  if (env && /^\d+$/.test(env)) return Number(env);
  if (process.env.NODE_ENV === 'production') return 25808;
  if (process.env.AIONUI_MULTI_INSTANCE === '1') return 25810;
  return 25809;
}

/**
 * Probe an in-flight `bun run webui` on the expected port. Returns the port if
 * its /api/auth/status responds 200 within ~1.5s, otherwise undefined.
 * We intentionally do NOT try to auto-discover arbitrary ports — the user can
 * pass --port / AIONUI_PORT if they launched webui on a non-default one.
 */
async function detectRunningWebUI(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/status`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function resetPasswordVia(url: string): Promise<string> {
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`reset-password failed (${res.status}): ${body}`);
  }
  const payload = (await res.json()) as { data?: { new_password?: string } };
  const newPassword = payload.data?.new_password;
  if (!newPassword) throw new Error('reset-password returned no new_password');
  return newPassword;
}

// Skip flag values (e.g. `--data-dir /some/path`) so they don't get picked up
// as the username positional argument.
const FLAGS_WITH_VALUES = new Set(['--data-dir', '--port']);

function resolveUsername(): string {
  const args = process.argv.slice(2);
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      if (FLAGS_WITH_VALUES.has(a)) i++; // skip the flag's value too
      continue;
    }
    positional.push(a);
  }
  return positional[0] || 'admin';
}

async function main(): Promise<void> {
  const username = resolveUsername();
  const workDir = resolveWorkDir();
  const webuiPort = resolveWebUIProbePort();

  log.info(`Target user: ${username} (advisory — operates on system_default_user)`);
  log.info(`Work dir   : ${workDir}`);

  // Fast path: a `bun run webui` is already up. Go through its proxy so the
  // running server immediately sees the new password — no need for the user
  // to stop the server or deal with two backends fighting over the same db.
  if (await detectRunningWebUI(webuiPort)) {
    log.info(`Detected running WebUI at http://127.0.0.1:${webuiPort} — reusing it`);
    try {
      const newPassword = await resetPasswordVia(`http://127.0.0.1:${webuiPort}/api/webui/reset-password`);
      log.success('Password reset successfully.');
      log.info('New password:');
      log.highlight(newPassword);
      log.info('');
      log.warning('Please change this password after next login.');
      return;
    } catch (error) {
      log.error(error instanceof Error ? error.message : 'Password reset failed');
      process.exitCode = 1;
      return;
    }
  }

  // Slow path: no webui running. Spawn a short-lived backend against the same
  // data-dir, reset, stop.
  const logDir = process.env.AIONUI_LOG_DIR ?? path.join(workDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  const backendBin = resolveBackendBinary();
  log.info(`No running WebUI on port ${webuiPort} — starting short-lived backend`);
  log.info(`Backend bin: ${backendBin}`);

  const handle = await startBackend({
    app: {
      version: '0.0.0',
      isPackaged: false,
      resourcesPath: repoRoot,
      userDataPath: workDir,
    },
    resolveBackend: () => backendBin,
    dataDir: workDir,
    logDir,
    dirs: {
      cacheDir: workDir,
      workDir,
      logDir,
    },
  });

  try {
    const newPassword = await resetPasswordVia(`http://127.0.0.1:${handle.port}/api/webui/reset-password`);
    log.success('Password reset successfully.');
    log.info('New password:');
    log.highlight(newPassword);
    log.info('');
    log.warning('Please change this password after next login.');
  } catch (error) {
    log.error(error instanceof Error ? error.message : 'Password reset failed');
    process.exitCode = 1;
  } finally {
    await stopBackend(handle).catch((err) => {
      log.warning(`backend stop failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
}

void main();
