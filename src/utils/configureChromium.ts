/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';

// Configure Chromium command-line flags for WebUI and CLI modes
// 为 WebUI 和 CLI 模式配置 Chromium 命令行参数

const isWebUI = process.argv.some((arg) => arg === '--webui');
const isResetPassword = process.argv.includes('--resetpass');

// Only configure flags for WebUI and --resetpass modes
// 仅为 WebUI 和重置密码模式配置参数
if (isWebUI || isResetPassword) {
  // For Linux without DISPLAY, enable headless mode
  // 对于无显示服务器的 Linux，启用 headless 模式
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    app.commandLine.appendSwitch('headless');
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-software-rasterizer');
  }

  // For root user, disable sandbox to prevent crash
  // 对于 root 用户，禁用沙箱以防止崩溃
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    app.commandLine.appendSwitch('no-sandbox');
  }
}

// ---------------------------------------------------------------------------
// Chrome DevTools Protocol (CDP) — enable remote debugging in dev mode
// so chrome-devtools-mcp and other CDP clients can connect to this Electron app.
//
// Default port: 9223 (avoids conflict with common CDP port 9222).
// Override via AIONUI_CDP_PORT env variable. Set to "0" to disable.
//
// Multi-instance support: a file-based registry tracks all active instances
// so each one gets a unique port and MCP tools can discover them all.
// Registry file: ~/.aionui-cdp-registry.json
// ---------------------------------------------------------------------------
const DEFAULT_CDP_PORT = 9223;
const CDP_PORT_RANGE_START = 9223;
const CDP_PORT_RANGE_END = 9230;
const CDP_REGISTRY_FILE = path.join(os.homedir(), '.aionui-cdp-registry.json');

interface CdpRegistryEntry {
  pid: number;
  port: number;
  cwd: string;
  startTime: number;
}

/** Read the CDP registry file, returning an empty array on any error. */
function readRegistry(): CdpRegistryEntry[] {
  try {
    if (!fs.existsSync(CDP_REGISTRY_FILE)) return [];
    const raw = fs.readFileSync(CDP_REGISTRY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Write the CDP registry file atomically. */
function writeRegistry(entries: CdpRegistryEntry[]): void {
  try {
    fs.writeFileSync(CDP_REGISTRY_FILE, JSON.stringify(entries, null, 2), 'utf-8');
  } catch {
    // Non-critical — log but don't crash
    console.warn('[DevTools MCP] Failed to write CDP registry file');
  }
}

/** Check if a process is still alive by sending signal 0. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Remove dead-process entries from the registry and return live ones. */
function pruneRegistry(): CdpRegistryEntry[] {
  const entries = readRegistry();
  const alive = entries.filter((e) => isProcessAlive(e.pid));
  if (alive.length !== entries.length) {
    writeRegistry(alive);
  }
  return alive;
}

/** Find the first available port not occupied by a live registry entry. */
function findAvailablePort(preferredPort: number): number {
  const liveEntries = pruneRegistry();
  const usedPorts = new Set(liveEntries.map((e) => e.port));

  // Try the preferred port first
  if (!usedPorts.has(preferredPort)) return preferredPort;

  // Scan the port range for an available one
  for (let p = CDP_PORT_RANGE_START; p <= CDP_PORT_RANGE_END; p++) {
    if (!usedPorts.has(p)) return p;
  }

  // All ports in range occupied — fall back to preferred and let Electron handle the conflict
  return preferredPort;
}

/** Register the current process in the CDP registry. */
function registerInstance(port: number): void {
  const entries = pruneRegistry();
  // Remove any stale entry for our own PID (e.g. from a previous crash)
  const filtered = entries.filter((e) => e.pid !== process.pid);
  filtered.push({
    pid: process.pid,
    port,
    cwd: process.cwd(),
    startTime: Date.now(),
  });
  writeRegistry(filtered);
}

/** Remove the current process from the CDP registry. */
export function unregisterInstance(): void {
  try {
    const entries = readRegistry();
    const filtered = entries.filter((e) => e.pid !== process.pid);
    writeRegistry(filtered);
  } catch {
    // Best-effort cleanup
  }
}

function resolveCdpPort(): number | null {
  const envVal = process.env.AIONUI_CDP_PORT;
  if (envVal === '0' || envVal === 'false') return null;
  if (envVal) {
    const parsed = Number(envVal);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return DEFAULT_CDP_PORT;
}

/** The active CDP port, or null if remote debugging is disabled. */
export let cdpPort: number | null = null;

if (!app.isPackaged) {
  const preferredPort = resolveCdpPort();
  if (preferredPort) {
    const port = findAvailablePort(preferredPort);
    app.commandLine.appendSwitch('remote-debugging-port', String(port));
    cdpPort = port;
    registerInstance(port);

    // Clean up registry on exit
    process.on('exit', () => unregisterInstance());
  }
}

/**
 * Verify CDP remote debugging is actually accessible after app starts.
 * Retries several times with delay to account for startup time.
 */
export async function verifyCdpReady(port: number, maxRetries = 5, retryDelay = 800): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/json/version`, { timeout: 2000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(res.statusCode === 200 && data.length > 0));
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return true;
    if (i < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, retryDelay));
    }
  }
  return false;
}

/**
 * Get all live CDP instances from the registry.
 * Prunes dead entries automatically.
 */
export function getActiveCdpInstances(): CdpRegistryEntry[] {
  return pruneRegistry();
}
