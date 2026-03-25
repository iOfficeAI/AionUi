/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/process/services/IConversationService.ts

import type { ConversationSource, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import type { ICreateConversationExtra, ConversationType, NonGroupConversationType } from '@/common/adapter/ipcBridge';
import type { AcpBackendAll } from '@/common/types/acpTypes';

export interface CreateConversationParams {
  type: ConversationType;
  id?: string;
  name?: string;
  model: TProviderWithModel;
  source?: ConversationSource;
  channelChatId?: string;
  extra: ICreateConversationExtra & {
    backend?: AcpBackendAll;
  };
}

export type RuntimeConversationCreateParams = CreateConversationParams & {
  type: NonGroupConversationType;
  extra: ICreateConversationExtra & {
    backend?: AcpBackendAll;
  };
};

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
