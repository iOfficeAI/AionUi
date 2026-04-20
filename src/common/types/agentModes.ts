/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CODEX_MODE_FULL_AUTO } from '@/common/types/codex/codexModes';

/**
 * Full-auto (YOLO) mode ID per backend.
 * Shared by renderer (cron task creation) and process (SessionLifecycle).
 */
const FULL_AUTO_MODE: Record<string, string> = {
  claude: 'bypassPermissions',
  qwen: 'yolo',
  opencode: 'build',
  gemini: 'yolo',
  aionrs: 'yolo',
  codex: CODEX_MODE_FULL_AUTO,
  cursor: 'agent',
  snow: 'yolo',
};

/**
 * Get the full-auto mode value for a given backend.
 * Falls back to 'yolo' for unknown backends.
 */
export function getFullAutoMode(backend: string | undefined): string {
  if (!backend) return 'yolo';
  return FULL_AUTO_MODE[backend] || 'yolo';
}
