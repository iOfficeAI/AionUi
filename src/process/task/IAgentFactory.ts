/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/process/task/IAgentFactory.ts

import type { TChatConversation } from '@/common/config/storage';
import type { IAgentManager } from './IAgentManager';
import type { BuildConversationOptions, AgentType } from './agentTypes';

export type AgentCreator = (conversation: TChatConversation, options?: BuildConversationOptions) => IAgentManager;

export interface IAgentFactory {
  register(type: AgentType, creator: AgentCreator): void;
  /**
   * @throws {UnknownAgentTypeError} if conversation.type has no registered creator.
   */
  create(conversation: TChatConversation, options?: BuildConversationOptions): IAgentManager;
}

export class UnknownAgentTypeError extends Error {
  constructor(type: string) {
    super(`No agent creator registered for type: ${type}`);
    this.name = 'UnknownAgentTypeError';
  }
}
