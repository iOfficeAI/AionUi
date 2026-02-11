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

/** iFlow CLI: auto-approve all operations (verified via ACP test) */
export const IFLOW_YOLO_SESSION_MODE = 'yolo' as const;

/** Goose: environment variable for auto mode (set before process spawn) */
export const GOOSE_YOLO_ENV_VAR = 'GOOSE_MODE' as const;
export const GOOSE_YOLO_ENV_VALUE = 'auto' as const;

/**
 * OpenCode: AionUi integrates with the TypeScript version (anomalyco/opencode)
 * which has full ACP protocol support via `opencode acp` command.
 *
 * Note: There are two OpenCode projects:
 * - TypeScript version: https://github.com/anomalyco/opencode (actively maintained, recommended)
 * - Go version: https://github.com/opencode-ai/opencode (archived, migrated to Crush by Charm team)
 *
 * Both versions support `opencode acp` command, so the integration is compatible with either.
 * Currently, OpenCode does not support --yolo flag for auto-approve mode.
 *
 * @see https://github.com/iOfficeAI/AionUi/issues/788
 */
