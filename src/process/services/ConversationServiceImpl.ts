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
  createAcpAgent,
  createOpenClawAgent,
  createNanobotAgent,
  createRemoteAgent,
  createAionrsAgent,
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

  async getConversationsByCronJob(cron_job_id: string): Promise<TChatConversation[]> {
    return this.repo.getConversationsByCronJob(cron_job_id);
  }

  async deleteConversation(id: string): Promise<void> {
    await this.repo.deleteConversation(id);
    // Note: the backend no longer exposes a cleanup endpoint for the former
    // per-conversation materialized skills dir — skills are now symlinked
    // directly from their canonical source paths, so there is nothing to
    // reclaim on conversation deletion.
  }

  async updateConversation(id: string, updates: Partial<TChatConversation>, mergeExtra?: boolean): Promise<void> {
    let finalUpdates = updates;
    if (mergeExtra && updates.extra) {
      const existing = await this.repo.getConversation(id);
      if (existing) {
        finalUpdates = {
          ...updates,
          extra: { ...existing.extra, ...updates.extra },
        } as Partial<TChatConversation>;
      }
    }
    await this.repo.updateConversation(id, finalUpdates);
  }

  async createWithMigration(params: MigrateConversationParams): Promise<TChatConversation> {
    const { conversation, sourceConversationId, migrateCron } = params;
    const conv: TChatConversation = {
      ...conversation,
      created_at: conversation.created_at ?? Date.now(),
      modified_at: conversation.modified_at ?? Date.now(),
    };
    await this.repo.createConversation(conv);

    if (sourceConversationId) {
      // Copy all messages from source conversation
      const page_size = 10000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: messages, has_more: more } = await this.repo.getMessages(sourceConversationId, page, page_size);
        for (const msg of messages) {
          await this.repo.insertMessage({
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
                conversation_id: conv.id,
                conversation_title: conv.name,
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
      const sourceMsgs = await this.repo.getMessages(sourceConversationId, 0, 1);
      const newMsgs = await this.repo.getMessages(conv.id, 0, 1);
      if (sourceMsgs.total === newMsgs.total) {
        await this.repo.deleteConversation(sourceConversationId);
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
      case 'acp': {
        conversation = await createAcpAgent(params as any);
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
      case 'remote': {
        conversation = await createRemoteAgent(params as any);
        break;
      }
      case 'aionrs': {
        conversation = await createAionrsAgent(params as any);
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
    if (params.channel_chat_id) overrides.channel_chat_id = params.channel_chat_id;
    // Merge extra fields from params that the factory didn't consume (e.g. cron_job_id).
    // Factory-produced values take precedence; only novel keys from params.extra are added.
    if (params.extra && conversation.extra) {
      const factoryExtra = conversation.extra as Record<string, unknown>;
      for (const [key, value] of Object.entries(params.extra)) {
        if (value !== undefined && !(key in factoryExtra)) {
          factoryExtra[key] = value;
        }
      }
    }

    // The spread preserves the discriminant field (type) from `conversation`;
    // the assertion is safe because `overrides` only contains non-discriminant fields.
    const finalConversation = {
      ...conversation,
      ...overrides,
    } as TChatConversation;

    await this.repo.createConversation(finalConversation);
    return finalConversation;
  }
}
