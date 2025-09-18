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
import WorkerManage from '../WorkerManage';

export function initConversationBridge(): void {
  ipcBridge.conversation.create.provider(async (params): Promise<TChatConversation> => {
    const { type, extra, name, model } = params;
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
      WorkerManage.buildConversation(conversation);
      await ProcessChat.get('chat.history').then((history) => {
        if (!history || !Array.isArray(history)) {
          return ProcessChat.set('chat.history', [conversation]);
        } else {
          if (history.some((h) => h.id === conversation.id)) return;
          return ProcessChat.set('chat.history', [...history, conversation]);
        }
      });
      return conversation;
    } catch (e) {
      return null;
    }
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
          conversation.status = task?.status;
        }
        return conversation;
      });
  });

  ipcBridge.conversation.stop.provider(async ({ conversation_id }) => {
    const manager = WorkerManage.getTaskById(conversation_id);
    if (manager && (manager.type === 'gemini' || manager.type === 'acp')) {
      await manager.stop();
    }
    return { success: true };
  });
}
