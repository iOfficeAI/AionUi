/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/process/task/agentTypes.ts

export type AgentType = 'gemini' | 'acp' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote' | 'aionrs';
export type AgentStatus = 'pending' | 'running' | 'finished';

export interface BuildConversationOptions {
  /** Force yolo mode (auto-approve all tool calls) */
  yoloMode?: boolean;
  /** Skip task cache — create a new isolated instance */
  skipCache?: boolean;
}
