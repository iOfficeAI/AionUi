/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Device Auth Store for OpenClaw Gateway Authentication
 *
 * Based on OpenClaw's device-auth-store implementation.
 * Stores device tokens for role-based authentication.
 *
 * Storage location: ~/.openclaw/identity/device-auth.json
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface DeviceAuthEntry {
  token: string;
  role: string;
  scopes: string[];
  updated_atMs: number;
}

interface DeviceAuthStore {
  version: 1;
  deviceId: string;
  tokens: Record<string, DeviceAuthEntry>;
}

// OpenClaw uses ~/.openclaw/identity/device-auth.json
const DEFAULT_STATE_DIR = path.join(os.homedir(), '.openclaw');
const DEVICE_AUTH_FILE = 'device-auth.json';

function resolveDeviceAuthPath(): string {
  // Check for OPENCLAW_STATE_DIR override
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim() || DEFAULT_STATE_DIR;
  return path.join(stateDir, 'identity', DEVICE_AUTH_FILE);
}

function normalizeRole(role: string): string {
  return role.trim();
}

function normalizeScopes(scopes: string[] | undefined): string[] {
  if (!Array.isArray(scopes)) {
    return [];
  }
  const out = new Set<string>();
  for (const scope of scopes) {
    const trimmed = scope.trim();
    if (trimmed) {
      out.add(trimmed);
    }
  }
  return [...out].toSorted();
}

function readStore(file_path: string): DeviceAuthStore | null {
  try {
    if (!fs.existsSync(file_path)) {
      return null;
    }
    const raw = fs.readFileSync(file_path, 'utf8');
    const parsed = JSON.parse(raw) as DeviceAuthStore;
    if (parsed?.version !== 1 || typeof parsed.deviceId !== 'string') {
      return null;
    }
    if (!parsed.tokens || typeof parsed.tokens !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStore(file_path: string, store: DeviceAuthStore): void {
  try {
    fs.mkdirSync(path.dirname(file_path), { recursive: true });
    fs.writeFileSync(file_path, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    try {
      fs.chmodSync(file_path, 0o600);
    } catch {
      // best-effort
    }
  } catch {
    // Silently ignore write failures (EROFS, EACCES, ENOSPC, etc.)
    // The user will simply need to re-authenticate next session.
  }
}

/**
 * Load device auth token for a specific device and role
 */
export function loadDeviceAuthToken(params: { deviceId: string; role: string }): DeviceAuthEntry | null {
  const file_path = resolveDeviceAuthPath();
  const store = readStore(file_path);
  if (!store) {
    return null;
  }
  if (store.deviceId !== params.deviceId) {
    return null;
  }
  const role = normalizeRole(params.role);
  const entry = store.tokens[role];
  if (!entry || typeof entry.token !== 'string') {
    return null;
  }
  return entry;
}

/**
 * Store device auth token for a specific device and role
 */
export function storeDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes?: string[];
}): DeviceAuthEntry {
  const file_path = resolveDeviceAuthPath();
  const existing = readStore(file_path);
  const role = normalizeRole(params.role);
  const next: DeviceAuthStore = {
    version: 1,
    deviceId: params.deviceId,
    tokens: existing && existing.deviceId === params.deviceId && existing.tokens ? { ...existing.tokens } : {},
  };
  const entry: DeviceAuthEntry = {
    token: params.token,
    role,
    scopes: normalizeScopes(params.scopes),
    updated_atMs: Date.now(),
  };
  next.tokens[role] = entry;
  writeStore(file_path, next);
  return entry;
}

/**
 * Clear device auth token for a specific device and role
 */
export function clearDeviceAuthToken(params: { deviceId: string; role: string }): void {
  const file_path = resolveDeviceAuthPath();
  const store = readStore(file_path);
  if (!store || store.deviceId !== params.deviceId) {
    return;
  }
  const role = normalizeRole(params.role);
  if (!store.tokens[role]) {
    return;
  }
  const next: DeviceAuthStore = {
    version: 1,
    deviceId: store.deviceId,
    tokens: { ...store.tokens },
  };
  delete next.tokens[role];
  writeStore(file_path, next);
}
