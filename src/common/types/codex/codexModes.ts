/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const CODEX_MODE_AUTO_EDIT = 'autoEdit';
export const CODEX_MODE_FULL_AUTO = 'yolo';
export const CODEX_MODE_FULL_AUTO_NO_SANDBOX = 'yoloNoSandbox';

export function isCodexNoSandboxMode(mode?: string | null): boolean {
  return mode === CODEX_MODE_FULL_AUTO_NO_SANDBOX;
}

export function isCodexAutoApproveMode(mode?: string | null): boolean {
  return mode === CODEX_MODE_FULL_AUTO || mode === CODEX_MODE_FULL_AUTO_NO_SANDBOX;
}
