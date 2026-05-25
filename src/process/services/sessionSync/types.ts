/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend } from '@/common/types/acpTypes';

/**
 * Represents a session discovered from a desktop CLI tool's local storage.
 * Used by SessionScannerService to report found sessions.
 */
export type DiscoveredSession = {
  /** ACP backend type (e.g. 'claude', 'codex') */
  agentType: AcpBackend;
  /** Session ID that can be used to resume via ACP */
  sessionId: string;
  /** Workspace identifier (raw directory name for Claude, cwd for Codex) */
  workspace: string;
  /** Display name for the conversation */
  name: string;
  /** Last modified timestamp (ms) */
  lastModified: number;
  /** Absolute path to source session file, used for dedup */
  sourcePath: string;
  /** Originator of the session (e.g. 'codex_exec', 'Codex Desktop', 'codex_vscode') */
  originator?: string;
};
