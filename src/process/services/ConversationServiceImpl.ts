/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationService, CreateConversationParams, MigrateConversationParams } from './IConversationService';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import type { TChatConversation } from '@/common/config/storage';
import { uuid } from '@/common/utils';
import { cronService } from './cron/cronServiceSingleton';
import {
  createGeminiAgent,
  createAcpAgent,
  createCodexAgent,
  createOpenClawAgent,
  createNanobotAgent,
} from '@process/utils/initAgent';

/**
 * Concrete implementation of IConversationService.
 * Delegates persistence to an injected IConversationRepository.
 */
export class ConversationServiceImpl implements IConversationService {
  constructor(private readonly repo: IConversationRepository) {}

  async getConversation(id: string): Promise<TChatConversation | undefined> {
    return this.repo.getConversation(id);
  }

  async listAllConversations(): Promise<TChatConversation[]> {
    return this.repo.listAllConversations();
  }

  async deleteConversation(id: string): Promise<void> {
    try {
      const jobs = await cronService.listJobsByConversation(id);
      for (const job of jobs) {
        await cronService.removeJob(job.id);
      }
    } catch (err) {
      console.warn('[ConversationServiceImpl] Failed to cleanup cron jobs:', err);
    }
    this.repo.deleteConversation(id);
  }

  async updateConversation(id: string, updates: Partial<TChatConversation>, mergeExtra?: boolean): Promise<void> {
    let finalUpdates = updates;
    if (mergeExtra && updates.extra) {
      const existing = this.repo.getConversation(id);
      if (existing) {
        finalUpdates = {
          ...updates,
          extra: { ...existing.extra, ...updates.extra },
        } as Partial<TChatConversation>;
      }
    }
    this.repo.updateConversation(id, finalUpdates);
  }

  async createWithMigration(params: MigrateConversationParams): Promise<TChatConversation> {
    const { conversation, sourceConversationId, migrateCron } = params;
    const conv: TChatConversation = {
      ...conversation,
      createTime: conversation.createTime ?? Date.now(),
      modifyTime: conversation.modifyTime ?? Date.now(),
    };
    this.repo.createConversation(conv);

    if (sourceConversationId) {
      // Copy all messages from source conversation
      const pageSize = 10000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: messages, hasMore: more } = this.repo.getMessages(sourceConversationId, page, pageSize);
        for (const msg of messages) {
          this.repo.insertMessage({
            ...msg,
            id: uuid(),
            conversation_id: conv.id,
          });
        }
        hasMore = more;
        page++;
      }

      // Migrate or delete cron jobs associated with source conversation
      try {
        const jobs = await cronService.listJobsByConversation(sourceConversationId);
        if (migrateCron) {
          for (const job of jobs) {
            await cronService.updateJob(job.id, {
              metadata: {
                ...job.metadata,
                conversationId: conv.id,
                conversationTitle: conv.name,
              },
            });
          }
        } else {
          for (const job of jobs) {
            await cronService.removeJob(job.id);
          }
        }
      } catch (err) {
        console.error('[ConversationServiceImpl] Failed to handle cron jobs during migration:', err);
      }

      // Integrity check: only delete source if message counts match
      const sourceMsgs = this.repo.getMessages(sourceConversationId, 0, 1);
      const newMsgs = this.repo.getMessages(conv.id, 0, 1);
      if (sourceMsgs.total === newMsgs.total) {
        this.repo.deleteConversation(sourceConversationId);
      } else {
        console.error('[ConversationServiceImpl] Migration integrity check failed: message counts do not match.', {
          source: sourceMsgs.total,
          new: newMsgs.total,
        });
      }
    }

    return conv;
  }

  async createConversation(params: CreateConversationParams): Promise<TChatConversation> {
    let conversation: TChatConversation;

    switch (params.type) {
      case 'gemini': {
        conversation = await createGeminiAgent(
          params.model,
          params.extra.workspace,
          params.extra.defaultFiles as string[] | undefined,
          params.extra.webSearchEngine,
          params.extra.customWorkspace,
          params.extra.contextFileName,
          params.extra.presetRules,
          params.extra.enabledSkills as string[] | undefined,
          params.extra.presetAssistantId,
          params.extra.sessionMode,
          params.extra.isHealthCheck
        );
        break;
      }
      case 'acp': {
        conversation = await createAcpAgent(params as any);
        break;
      }
      case 'codex': {
        conversation = await createCodexAgent(params as any);
        break;
      }
      case 'openclaw-gateway': {
        conversation = await createOpenClawAgent(params as any);
        break;
      }
      case 'nanobot': {
        conversation = await createNanobotAgent(params as any);
        break;
      }
      default: {
        throw new Error(`Invalid conversation type: ${(params as any).type}`);
      }
    }

    // Apply optional overrides without mutating the object returned by agent factories
    const overrides: Partial<TChatConversation> = {};
    if (params.id) overrides.id = params.id;
    if (params.name) overrides.name = params.name;
    if (params.source) overrides.source = params.source;
    if (params.channelChatId) overrides.channelChatId = params.channelChatId;
    // The spread preserves the discriminant field (type) from `conversation`;
    // the assertion is safe because `overrides` only contains non-discriminant fields.
    const finalConversation = { ...conversation, ...overrides } as TChatConversation;

    this.repo.createConversation(finalConversation);
    return finalConversation;
  }
}
