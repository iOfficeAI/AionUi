/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import { ipcBridge } from '../../common';
import { createAcpAgent, createGeminiAgent } from '../initAgent';
import { ProcessChat, ProcessChatMessage } from '../initStorage';
import { nextTickToLocalFinish } from '../message';
import type AcpAgentManager from '../task/AcpAgentManager';
import WorkerManage from '../WorkerManage';

export function initConversationBridge(): void {
  ipcBridge.conversation.create.provider(async (params): Promise<TChatConversation> => {
    const { type, extra, name, model, id } = params;
    const buildConversation = async () => {
      if (type === 'gemini') return createGeminiAgent(model, extra.workspace, extra.defaultFiles, extra.webSearchEngine);
      if (type === 'acp') return createAcpAgent(params);
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
        (task as AcpAgentManager).initAgent();
      }
      await ProcessChat.get('chat.history').then((history) => {
        if (!history || !Array.isArray(history)) {
          return ProcessChat.set('chat.history', [conversation]);
        } else {
          //相同工作目录重开一个对话，处理逻辑改为新增一条对话记录
          return ProcessChat.set('chat.history', [...history.filter((h) => h.id !== conversation.id), conversation]);
        }
      });
      return conversation;
    } catch (e) {
      return null;
    }
  });

  ipcBridge.conversation.getAssociateConversation.provider(async ({ conversation_id }) => {
    const history = await ProcessChat.get('chat.history');
    if (!history) return [];
    const currentConversation = history.find((item) => item.id === conversation_id);
    if (!currentConversation || !currentConversation.extra.workspace) return [];
    return history.filter((item) => item.extra.workspace === currentConversation.extra.workspace);
  });

  ipcBridge.conversation.createWithConversation.provider(async ({ conversation }) => {
    conversation.createTime = Date.now();
    conversation.modifyTime = Date.now();
    WorkerManage.buildConversation(conversation);
    ProcessChat.get('chat.history').then((history) => {
      if (!history || !Array.isArray(history)) {
        return ProcessChat.set('chat.history', [conversation]);
      } else {
        return ProcessChat.set('chat.history', [...history.filter((item) => item.id !== conversation.id), conversation]);
      }
    });
    return conversation;
  });

  ipcBridge.conversation.remove.provider(async ({ id }) => {
    return ProcessChat.get('chat.history').then((history) => {
      try {
        WorkerManage.kill(id);
        if (!history) return;
        ProcessChat.set(
          'chat.history',
          history.filter((item) => item.id !== id)
        );
        nextTickToLocalFinish(() => ProcessChatMessage.backup(id));
        return true;
      } catch (e) {
        return false;
      }
    });
  });

  ipcBridge.conversation.reset.provider(async ({ id }) => {
    if (id) {
      WorkerManage.kill(id);
    } else WorkerManage.clear();
  });

  ipcBridge.conversation.get.provider(async ({ id }) => {
    return ProcessChat.get('chat.history')
      .then((history) => {
        return history.find((item) => item.id === id);
      })
      .then((conversation) => {
        if (conversation) {
          const task = WorkerManage.getTaskById(id);
          conversation.status = task?.status || 'finished';
        }
        return conversation;
      });
  });

  ipcBridge.conversation.stop.provider(async ({ conversation_id }) => {
    const task = WorkerManage.getTaskById(conversation_id);
    if (!task) return { success: true, msg: 'conversation not found' };
    if (task.type !== 'gemini' && task.type !== 'acp') return { success: false, msg: 'not support' };
    return task.stop().then(() => ({ success: true }));
  });
}
