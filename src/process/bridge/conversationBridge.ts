/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexAgentManager } from '@/agent/codex';
import type { TChatConversation } from '@/common/storage';
import { GeminiAgent } from '@/agent/gemini';
import { ipcBridge } from '../../common';
import { createAcpAgent, createCodexAgent, createGeminiAgent } from '../initAgent';
import { ProcessChat, ProcessChatMessage } from '../initStorage';
import type AcpAgentManager from '../task/AcpAgentManager';
import type { GeminiAgentManager } from '../task/GeminiAgentManager';
import { readDirectoryRecursive } from '../utils';
import WorkerManage from '../WorkerManage';
import { getDatabase } from '@process/database';

/**
 * Migrate a conversation from file storage to database
 * This is a lazy migration - only migrate when needed
 */
async function migrateConversationToDatabase(conversation: TChatConversation): Promise<void> {
  try {
    const db = getDatabase();

    // Check if already in database
    const existing = db.getConversation(conversation.id);
    if (existing.success && existing.data) {
      // Already migrated, just update modifyTime
      db.updateConversation(conversation.id, { modifyTime: Date.now() });
      return;
    }

    // Create conversation in database
    const result = db.createConversation(conversation);
    if (!result.success) {
      console.error('[Migration] Failed to migrate conversation:', result.error);
      return;
    }

    // Migrate messages if they exist in file storage
    try {
      const messages = await ProcessChatMessage.get(conversation.id);
      if (messages && messages.length > 0) {
        console.log(`[Migration] Migrating ${messages.length} messages for conversation ${conversation.id}`);

        // Batch insert messages
        for (const message of messages) {
          const insertResult = db.insertMessage(message);
          if (!insertResult.success) {
            console.error('[Migration] Failed to migrate message:', insertResult.error);
          }
        }

        console.log(`[Migration] Successfully migrated conversation ${conversation.id}`);
      }
    } catch (error) {
      console.warn('[Migration] No messages to migrate or error occurred:', error);
    }
  } catch (error) {
    console.error('[Migration] Failed to migrate conversation:', error);
  }
}

export function initConversationBridge(): void {
  ipcBridge.conversation.create.provider(async (params): Promise<TChatConversation> => {
    const { type, extra, name, model, id } = params;
    const buildConversation = () => {
      if (type === 'gemini') return createGeminiAgent(model, extra.workspace, extra.defaultFiles, extra.webSearchEngine);
      if (type === 'acp') return createAcpAgent(params);
      if (type === 'codex') return createCodexAgent(params);
      throw new Error('Invalid conversation type');
    };
    try {
      const conversation = await buildConversation();
      if (name) {
        conversation.name = name;
      }
      if (id) {
        conversation.id = id;
      }
      const task = WorkerManage.buildConversation(conversation);
      if (task.type === 'acp') {
        //@todo
        void (task as AcpAgentManager).initAgent();
      }

      // Save to database only
      const db = getDatabase();
      const result = db.createConversation(conversation);
      if (!result.success) {
        console.error('[conversationBridge] Failed to create conversation in database:', result.error);
      }

      return conversation;
    } catch (e) {
      console.error('[conversationBridge] Failed to create conversation:', e);
      return null;
    }
  });

  ipcBridge.conversation.getAssociateConversation.provider(async ({ conversation_id }) => {
    try {
      const db = getDatabase();

      // Try to get current conversation from database
      let currentConversation: TChatConversation | undefined;
      const currentResult = db.getConversation(conversation_id);

      if (currentResult.success && currentResult.data) {
        currentConversation = currentResult.data;
      } else {
        // Not in database, try file storage
        const history = await ProcessChat.get('chat.history');
        currentConversation = history.find((item) => item.id === conversation_id);

        // Lazy migrate in background
        if (currentConversation) {
          void migrateConversationToDatabase(currentConversation);
        }
      }

      if (!currentConversation || !currentConversation.extra?.workspace) {
        return [];
      }

      // Get all conversations from database (get first page with large limit to get all)
      const allResult = db.getUserConversations(undefined, 0, 10000);
      let allConversations: TChatConversation[] = allResult.data || [];

      // If database is empty or doesn't have enough conversations, merge with file storage
      const history = await ProcessChat.get('chat.history');
      if (allConversations.length < (history?.length || 0)) {
        // Database doesn't have all conversations yet, use file storage
        allConversations = history || [];

        // Lazy migrate all conversations in background
        void Promise.all(allConversations.map((conv) => migrateConversationToDatabase(conv)));
      }

      // Filter by workspace
      return allConversations.filter((item) => item.extra?.workspace === currentConversation.extra.workspace);
    } catch (error) {
      console.error('[conversationBridge] Failed to get associate conversations:', error);
      return [];
    }
  });

  ipcBridge.conversation.createWithConversation.provider(({ conversation }) => {
    try {
      conversation.createTime = Date.now();
      conversation.modifyTime = Date.now();
      WorkerManage.buildConversation(conversation);

      // Save to database only
      const db = getDatabase();
      const result = db.createConversation(conversation);
      if (!result.success) {
        console.error('[conversationBridge] Failed to create conversation in database:', result.error);
      }

      return Promise.resolve(conversation);
    } catch (error) {
      console.error('[conversationBridge] Failed to create conversation with conversation:', error);
      return Promise.resolve(conversation);
    }
  });

  ipcBridge.conversation.remove.provider(({ id }) => {
    try {
      // Kill the running task if exists
      WorkerManage.kill(id);

      // Delete from database only
      const db = getDatabase();

      // Delete conversation from database (will cascade delete messages due to foreign key)
      const result = db.deleteConversation(id);
      if (!result.success) {
        console.error('[conversationBridge] Failed to delete conversation from database:', result.error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[conversationBridge] Failed to remove conversation:', error);
      return false;
    }
  });

  ipcBridge.conversation.reset.provider(({ id }) => {
    if (id) {
      WorkerManage.kill(id);
    } else {
      WorkerManage.clear();
    }
    return Promise.resolve();
  });

  ipcBridge.conversation.get.provider(async ({ id }) => {
    try {
      const db = getDatabase();

      // Try to get conversation from database first
      const result = db.getConversation(id);
      if (result.success && result.data) {
        // Found in database, update status and return
        const conversation = result.data;
        const task = WorkerManage.getTaskById(id);
        conversation.status = task?.status || 'finished';
        return conversation;
      }

      // Not in database, try to load from file storage and migrate
      const history = await ProcessChat.get('chat.history');
      const conversation = history.find((item) => item.id === id);
      if (conversation) {
        // Update status from running task
        const task = WorkerManage.getTaskById(id);
        conversation.status = task?.status || 'finished';

        // Lazy migrate this conversation to database in background
        void migrateConversationToDatabase(conversation);

        return conversation;
      }

      return undefined;
    } catch (error) {
      console.error('[conversationBridge] Failed to get conversation:', error);
      return undefined;
    }
  });

  const buildLastAbortController = (() => {
    let lastGetWorkspaceAbortController = new AbortController();
    return () => {
      lastGetWorkspaceAbortController.abort();
      return (lastGetWorkspaceAbortController = new AbortController());
    };
  })();

  ipcBridge.conversation.getWorkspace.provider(async ({ workspace, search, path }) => {
    const fileService = GeminiAgent.buildFileServer(workspace);
    return await readDirectoryRecursive(path, {
      root: workspace,
      fileService,
      abortController: buildLastAbortController(),
      search: {
        text: search,
        onProcess(result) {
          void ipcBridge.conversation.responseSearchWorkSpace.invoke(result);
        },
      },
    }).then((res) => (res ? [res] : []));
  });

  ipcBridge.conversation.stop.provider(async ({ conversation_id }) => {
    const task = WorkerManage.getTaskById(conversation_id);
    if (!task) return { success: true, msg: 'conversation not found' };
    if (task.type !== 'gemini' && task.type !== 'acp' && task.type !== 'codex') {
      return { success: false, msg: 'not support' };
    }
    await task.stop();
    return { success: true };
  });

  // 通用 confirmMessage 实现 - 自动根据 conversation 类型分发
  ipcBridge.conversation.confirmMessage.provider(async ({ confirmKey, msg_id, conversation_id, callId }) => {
    const task = WorkerManage.getTaskById(conversation_id);
    if (!task) return { success: false, msg: 'conversation not found' };

    try {
      // 根据 task 类型调用对应的 confirmMessage 方法
      if (task?.type === 'codex') {
        await (task as CodexAgentManager).confirmMessage({ confirmKey, msg_id, callId });
        return { success: true };
      } else if (task.type === 'gemini') {
        await (task as GeminiAgentManager).confirmMessage({ confirmKey, msg_id, callId });
        return { success: true };
      } else if (task.type === 'acp') {
        await (task as AcpAgentManager).confirmMessage({ confirmKey, msg_id, callId });
        return { success: true };
      } else {
        return { success: false, msg: `Unsupported task type: ${task.type}` };
      }
    } catch (e: unknown) {
      return { success: false, msg: e instanceof Error ? e.message : String(e) };
    }
  });
}
