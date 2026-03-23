/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/process/services/IConversationService.ts

import type { TChatConversation, TProviderWithModel, ConversationSource } from '@/common/config/storage';
import type { AcpBackendAll } from '@/common/types/acpTypes';
import type { AgentType } from '@process/task/agentTypes';

export interface CreateConversationParams {
  type: AgentType;
  id?: string;
  name?: string;
  model: TProviderWithModel;
  source?: ConversationSource;
  channelChatId?: string;
  extra: {
    workspace?: string;
    customWorkspace?: boolean;
    defaultFiles?: string[];
    backend?: AcpBackendAll;
    cliPath?: string;
    webSearchEngine?: 'google' | 'default';
    agentName?: string;
    contextFileName?: string;
    presetRules?: string;
    enabledSkills?: string[];
    presetAssistantId?: string;
    sessionMode?: string;
    isHealthCheck?: boolean;
    [key: string]: unknown;
  };
}

export interface MigrateConversationParams {
  conversation: TChatConversation;
  sourceConversationId?: string;
  migrateCron?: boolean;
}

export interface IConversationService {
  createConversation(params: CreateConversationParams): Promise<TChatConversation>;
  deleteConversation(id: string): Promise<void>;
  updateConversation(id: string, updates: Partial<TChatConversation>, mergeExtra?: boolean): Promise<void>;
  getConversation(id: string): Promise<TChatConversation | undefined>;
  createWithMigration(params: MigrateConversationParams): Promise<TChatConversation>;
  /** Returns all conversations without pagination. */
  listAllConversations(): Promise<TChatConversation[]>;
}
