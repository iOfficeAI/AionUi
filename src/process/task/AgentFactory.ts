/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { IAgentFactory, AgentCreator } from './IAgentFactory';
import { UnknownAgentTypeError } from './IAgentFactory';
import type { IAgentManager } from './IAgentManager';
import type { BuildConversationOptions, AgentType } from './agentTypes';

export class AgentFactory implements IAgentFactory {
  private creators = new Map<AgentType, AgentCreator>();

  register(type: AgentType, creator: AgentCreator): void {
    this.creators.set(type, creator);
  }

  create(conversation: TChatConversation, options?: BuildConversationOptions): IAgentManager {
    const creator = this.creators.get(conversation.type as AgentType);
    if (!creator) throw new UnknownAgentTypeError(conversation.type);
    return creator(conversation, options);
  }
}
