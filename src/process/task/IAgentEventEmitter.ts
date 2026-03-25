/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/process/task/IAgentEventEmitter.ts

import type { IConfirmation } from '@/common/chat/chatLib';

/** Discriminated union of all events an agent can emit to the renderer */
export type AgentMessageEvent =
  | { type: 'text'; data: { content: string; msg_id: string } }
  | { type: 'tool_group'; data: unknown[] }
  | { type: 'status'; data: { status: string } }
  | { type: string; data: unknown }; // agent-specific extensions

export interface IAgentEventEmitter {
  emitConfirmationAdd(conversationId: string, data: IConfirmation): void;
  emitConfirmationUpdate(conversationId: string, data: IConfirmation): void;
  emitConfirmationRemove(conversationId: string, confirmationId: string): void;
  emitMessage(conversationId: string, event: AgentMessageEvent): void;
}
