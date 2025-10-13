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
import { getDatabase } from '../database/export';
import type AcpAgentManager from '../task/AcpAgentManager';
import type { GeminiAgentManager } from '../task/GeminiAgentManager';
import { readDirectoryRecursive } from '../utils';
import WorkerManage from '../WorkerManage';

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

      // 使用数据库 API 保存对话
      const db = getDatabase();
      const existingResult = db.getConversation(conversation.id);
      if (existingResult.success && existingResult.data) {
        // 更新现有对话
        db.updateConversation(conversation.id, conversation);
      } else {
        // 创建新对话
        db.createConversation(conversation);
      }

      return conversation;
    } catch (e) {
      return null;
    }
  });

  ipcBridge.conversation.getAssociateConversation.provider(async ({ conversation_id }) => {
    const db = getDatabase();
    const result = db.getConversation(conversation_id);
    if (!result.success || !result.data || !result.data.extra.workspace) return [];

    const currentWorkspace = result.data.extra.workspace;
    const allConversations = db.getUserConversations(undefined, 0, 1000);
    if (!allConversations.data) return [];

    return allConversations.data.filter((item) => item.extra.workspace === currentWorkspace);
  });

  ipcBridge.conversation.createWithConversation.provider(async ({ conversation }) => {
    conversation.createTime = Date.now();
    conversation.modifyTime = Date.now();
    WorkerManage.buildConversation(conversation);

    // 使用数据库 API 保存对话
    const db = getDatabase();
    const existingResult = db.getConversation(conversation.id);
    if (existingResult.success && existingResult.data) {
      db.updateConversation(conversation.id, conversation);
    } else {
      db.createConversation(conversation);
    }

    return conversation;
  });

  ipcBridge.conversation.remove.provider(({ id }) => {
    try {
      WorkerManage.kill(id);

      // 使用数据库 API 删除对话
      const db = getDatabase();
      const result = db.deleteConversation(id);

      return Promise.resolve(result.success);
    } catch (error) {
      console.error('[conversationBridge] Error removing conversation:', error);
      return Promise.resolve(false);
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
    const db = getDatabase();
    const result = db.getConversation(id);

    if (result.success && result.data) {
      const conversation = result.data;
      const task = WorkerManage.getTaskById(id);
      conversation.status = task?.status || 'finished';
      return conversation;
    }

    return undefined;
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
