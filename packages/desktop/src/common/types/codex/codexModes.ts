/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const CODEX_MODE_READ_ONLY = 'read-only';
export const CODEX_MODE_NATIVE_DEFAULT = 'auto';
export const CODEX_MODE_NATIVE_FULL_ACCESS = 'full-access';

// Legacy AionUi values kept for backward compatibility with persisted config.
export const CODEX_MODE_AUTO_EDIT = 'autoEdit';
export const CODEX_MODE_FULL_AUTO = 'yolo';
export const CODEX_MODE_FULL_AUTO_NO_SANDBOX = 'yoloNoSandbox';

export function normalizeCodexMode(mode?: string | null): string | undefined {
  if (!mode) return undefined;

  switch (mode) {
    case 'default':
    case CODEX_MODE_AUTO_EDIT:
    case CODEX_MODE_NATIVE_DEFAULT:
      return CODEX_MODE_NATIVE_DEFAULT;
    case CODEX_MODE_FULL_AUTO:
    case CODEX_MODE_FULL_AUTO_NO_SANDBOX:
    case CODEX_MODE_NATIVE_FULL_ACCESS:
      return CODEX_MODE_NATIVE_FULL_ACCESS;
    case CODEX_MODE_READ_ONLY:
      return CODEX_MODE_READ_ONLY;
    default:
      return mode;
  }
}

export function isCodexNoSandboxMode(mode?: string | null): boolean {
  return normalizeCodexMode(mode) === CODEX_MODE_NATIVE_FULL_ACCESS;
}

export function isCodexAutoApproveMode(mode?: string | null): boolean {
  return normalizeCodexMode(mode) === CODEX_MODE_NATIVE_FULL_ACCESS;
}
