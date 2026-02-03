/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Session mode constants for different ACP backends
// These are used with session/set_mode to enable YOLO (auto-approve) mode

/** Claude Code: bypass all permission checks */
export const CLAUDE_YOLO_SESSION_MODE = 'bypassPermissions' as const;

/** Qwen Code: auto-approve all operations */
export const QWEN_YOLO_SESSION_MODE = 'yolo' as const;

/** Goose: environment variable for auto mode (set before process spawn) */
export const GOOSE_YOLO_ENV_VAR = 'GOOSE_MODE' as const;
export const GOOSE_YOLO_ENV_VALUE = 'auto' as const;

/**
 * OpenCode: v1.1.39 does not support --yolo flag
 * Note: OpenCode has been archived and migrated to Crush (by Charm team)
 * Crush supports --yolo flag, but OpenCode does not
 * OpenCode's ACP mode behavior needs further testing to determine if permissions are auto-approved
 */
