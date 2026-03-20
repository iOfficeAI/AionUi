/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared types for the external CLI session history feature.
 * Placed in src/common/ so both main process and renderer can import.
 */

export type ExternalSessionBackend = 'claude' | 'codex' | 'gemini-cli' | 'opencode';

export type ExternalSessionInfo = {
  /** Unique session ID from the external CLI */
  id: string;
  /** Conversation title or summary */
  name: string;
  /** Which CLI backend this session is from */
  backend: ExternalSessionBackend;
  /** Working directory (project path) */
  workspace?: string;
  /** Last update timestamp in milliseconds */
  updatedAt: number;
};

export type ImportSessionResult = {
  success: boolean;
  conversationId?: string;
  messageCount?: number;
  error?: string;
};
