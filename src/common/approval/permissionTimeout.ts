/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const GLOBAL_PERMISSION_TIMEOUT_ENV = 'AIONUI_PERMISSION_REQUEST_TIMEOUT_MS';

function normalizePermissionTimeoutMs(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  if (value <= 0) {
    return null;
  }

  return Math.floor(value);
}

function parsePermissionTimeoutMs(rawValue: string): number | undefined {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

/**
 * Resolve permission timeout from env vars.
 *
 * Priority:
 * 1) scoped env var (backend-specific)
 * 2) global env var
 * 3) fallback default
 *
 * Non-positive values (<= 0) mean "disable timeout" (wait indefinitely).
 */
export function resolvePermissionTimeoutMs(defaultMs: number, scopedEnvVar?: string): number | null {
  const scopedRaw = scopedEnvVar ? process.env[scopedEnvVar] : undefined;
  const globalRaw = process.env[GLOBAL_PERMISSION_TIMEOUT_ENV];

  const selectedRaw = scopedRaw !== undefined && scopedRaw.trim() !== '' ? scopedRaw : globalRaw;

  if (selectedRaw !== undefined && selectedRaw.trim() !== '') {
    const parsed = parsePermissionTimeoutMs(selectedRaw.trim());
    if (parsed !== undefined) {
      return normalizePermissionTimeoutMs(parsed);
    }
  }

  return normalizePermissionTimeoutMs(defaultMs);
}
