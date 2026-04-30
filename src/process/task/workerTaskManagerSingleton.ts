/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Singleton WorkerTaskManager wired with all registered agent creators.
 * Extracted to a separate module to avoid circular dependencies with initBridge.ts.
 */

import { AgentFactory } from './AgentFactory';
import { WorkerTaskManager } from './WorkerTaskManager';
import { ipcBridge } from '@/common';
import AcpAgentManager from './AcpAgentManager';
import OpenClawAgentManager from './OpenClawAgentManager';
import NanoBotAgentManager from './NanoBotAgentManager';
import RemoteAgentManager from './RemoteAgentManager';
import { AionrsManager } from './AionrsManager';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';

const agentFactory = new AgentFactory();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('acp', (conv, opts) => {
  const c = conv as any;
  return new AcpAgentManager({
    ...c.extra,
    conversation_id: c.id,
    yoloMode: opts?.yoloMode,
    // ACP backends persist their own CLI model IDs in extra.current_model_id.
    current_model_id: c.extra?.current_model_id,
  }) as unknown as ReturnType<typeof agentFactory.create>;
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('openclaw-gateway', (conv, opts) => {
  const c = conv as any;
  return new OpenClawAgentManager({
    ...c.extra,
    conversation_id: c.id,
    yoloMode: opts?.yoloMode,
  }) as unknown as ReturnType<typeof agentFactory.create>;
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('nanobot', (conv, opts) => {
  const c = conv as any;
  return new NanoBotAgentManager({
    ...c.extra,
    conversation_id: c.id,
    yoloMode: opts?.yoloMode,
  }) as unknown as ReturnType<typeof agentFactory.create>;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('remote', (conv, opts) => {
  const c = conv as any;
  return new RemoteAgentManager({
    ...c.extra,
    conversation_id: c.id,
    yoloMode: opts?.yoloMode,
  }) as unknown as ReturnType<typeof agentFactory.create>;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('aionrs', (conv, opts) => {
  const c = conv as any;
  return new AionrsManager(
    { ...c.extra, conversation_id: c.id, yoloMode: opts?.yoloMode },
    c.model
  ) as unknown as ReturnType<typeof agentFactory.create>;
});

const conversationRepo: IConversationRepository = {
  async getConversation(id) {
    return ipcBridge.conversation.get.invoke({ id });
  },
  async createConversation(conversation) {
    await ipcBridge.conversation.createWithConversation.invoke({ conversation });
  },
  async updateConversation(id, updates) {
    await ipcBridge.conversation.update.invoke({ id, updates });
  },
  async deleteConversation(id) {
    await ipcBridge.conversation.remove.invoke({ id });
  },
  async getMessages(id, page, page_size, order) {
    const result = await ipcBridge.database.getConversationMessages.invoke({
      conversation_id: id,
      page: page + 1,
      page_size,
      order,
    });
    return {
      data: result.items ?? [],
      total: result.total ?? 0,
      has_more: result.has_more ?? false,
    };
  },
  async insertMessage() {
    throw new Error('insertMessage is no longer supported in Electron; backend owns message persistence');
  },
  async getUserConversations(cursor, _offset, limit) {
    const result = await ipcBridge.database.getUserConversations.invoke({ cursor, limit });
    return {
      data: result.items ?? [],
      total: result.total ?? 0,
      has_more: result.has_more ?? false,
    };
  },
  async listAllConversations() {
    const conversations: Awaited<ReturnType<typeof ipcBridge.database.getUserConversations.invoke>>['items'] = [];
    let cursor: string | undefined;
    let hasMore = true;
    while (hasMore) {
      const page = await ipcBridge.database.getUserConversations.invoke({ cursor, limit: 200 });
      conversations.push(...(page.items ?? []));
      hasMore = page.has_more;
      cursor = page.items.at(-1)?.id;
    }
    return conversations;
  },
  async searchMessages(keyword, page, page_size) {
    const result = await ipcBridge.database.searchConversationMessages.invoke({
      keyword,
      page: page + 1,
      page_size,
    });
    return {
      items: result.items,
      total: result.total,
      page: page + 1,
      page_size,
      has_more: result.has_more,
    };
  },
  async getConversationsByCronJob(cron_job_id) {
    return ipcBridge.conversation.listByCronJob.invoke({ cron_job_id });
  },
};
export const workerTaskManager = new WorkerTaskManager(agentFactory, conversationRepo);
