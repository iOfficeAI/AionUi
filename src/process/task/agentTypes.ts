/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/process/task/agentTypes.ts
// UI terminology (clt branch): AgentType values correspond to Runtime kinds displayed in Settings > Runtimes.

export type AgentType = 'gemini' | 'acp' | 'openclaw-gateway' | 'nanobot' | 'remote' | 'aionrs';
export type AgentStatus = 'pending' | 'running' | 'finished';

export interface BuildConversationOptions {
  /** Force yolo mode (auto-approve all tool calls) */
  yoloMode?: boolean;
  /** Skip task cache — create a new isolated instance */
  skipCache?: boolean;
}
