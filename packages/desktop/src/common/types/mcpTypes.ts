/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP source type — ACP backend label (e.g. "claude", "codex") or a built-in
 * sentinel like "aionui" / "aionrs". Kept as `string` because the backend
 * `agent_metadata` table is the source of truth and extensions can register
 * arbitrary new backends at runtime.
 */
export type McpSource = string;
