/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/process/services/IConversationService.ts

import type { TChatConversation, TProviderWithModel, ConversationSource } from '@/common/config/storage';
import type { AgentBackend } from '@/common/types/acpTypes';
import type { AgentType } from '@process/task/agentTypes';

export interface CreateConversationParams {
  type: AgentType;
  id?: string;
  name?: string;
  model: TProviderWithModel;
  source?: ConversationSource;
  channel_chat_id?: string;
  extra: {
    workspace?: string;
    custom_workspace?: boolean;
    defaultFiles?: string[];
    backend?: AgentBackend;
    cli_path?: string;
    web_search_engine?: 'google' | 'default';
    agent_name?: string;
    context_file_name?: string;
    preset_rules?: string;
    enabled_skills?: string[];
    extraSkillPaths?: string[];
    excludeBuiltinSkills?: string[];
    preset_assistant_id?: string;
    session_mode?: string;
    is_health_check?: boolean;
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
  /** List conversations spawned by a specific cron job. */
  getConversationsByCronJob(cron_job_id: string): Promise<TChatConversation[]>;
}
