/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// ===== UI-facing permission request payloads for Codex =====

export interface CodexPermissionOption {
  optionId: string;
  name: string;
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
  description?: string;
}

export interface CodexToolCallRawInput {
  command?: string | string[];
  cwd?: string;
  description?: string;
}

export interface CodexToolCall {
  title?: string;
  toolCallId: string;
  kind?: 'edit' | 'read' | 'fetch' | 'execute' | string;
  rawInput?: CodexToolCallRawInput;
}

export interface CodexPermissionRequest {
  title?: string;
  description?: string;
  agentType?: 'codex';
  sessionId?: string;
  requestId?: string;
  options: CodexPermissionOption[];
  toolCall?: CodexToolCall;
}
