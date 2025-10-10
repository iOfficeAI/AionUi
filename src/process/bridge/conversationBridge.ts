/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexAgentManager } from '@/agent/codex';
import type { TChatConversation } from '@/common/storage';
import { ipcBridge } from '../../common';
import { createAcpAgent, createCodexAgent, createGeminiAgent } from '../initAgent';
import { ProcessChat, ProcessChatMessage } from '../initStorage';
import { nextTickToLocalFinish } from '../message';
import type AcpAgentManager from '../task/AcpAgentManager';
import type { GeminiAgentManager } from '../task/GeminiAgentManager';
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
      await ProcessChat.update('chat.history', (history) => {
        const filtered = (history || []).filter((item) => item.id !== conversation.id);
        return Promise.resolve([...filtered, conversation]);
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
    await ProcessChat.update('chat.history', (history) => {
      const filtered = history.filter((item) => item.id !== conversation.id);
      return Promise.resolve([...filtered, conversation]);
    });
    return conversation;
  });

  ipcBridge.conversation.remove.provider(({ id }) => {
    return ProcessChat.update('chat.history', (history) => {
      WorkerManage.kill(id);
      nextTickToLocalFinish(() => ProcessChatMessage.backup(id));
      return Promise.resolve(history.filter((item) => item.id !== id));
    })
      .then(() => true)
      .catch(() => false);
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
    const history = await ProcessChat.get('chat.history');
    const conversation = history.find((item) => item.id === id);
    if (conversation) {
      const task = WorkerManage.getTaskById(id);
      conversation.status = task?.status || 'finished';
    }
    return conversation;
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

/**
 * 构建工作区文件树（通用方法，用于 ACP 和 Codex）
 */
export const buildWorkspaceFileTree = async (conversation_id: string) => {
  try {
    const task = (await WorkerManage.getTaskByIdRollbackBuild(conversation_id)) as AcpAgentManager | CodexAgentManager;
    if (!task) return [];
    const workspace = task.workspace;

    const fs = await import('fs');
    const path = await import('path');

    // 检查目录是否存在
    if (!fs.existsSync(workspace)) {
      return [];
    }

    // 递归构建文件树
    type FileTreeNode = { name: string; path: string; isDir: boolean; isFile: boolean; children?: FileTreeNode[] };
    const buildFileTree = (dirPath: string, basePath: string = dirPath): FileTreeNode[] => {
      const result: FileTreeNode[] = [];
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        // 跳过隐藏文件和系统文件
        if (item.startsWith('.')) continue;
        if (item === 'node_modules') continue;

        const itemPath = path.join(dirPath, item);
        const relativePath = path.relative(basePath, itemPath);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          const children = buildFileTree(itemPath, basePath);
          if (children.length > 0) {
            result.push({
              name: item,
              path: relativePath,
              isDir: true,
              isFile: false,
              children,
            });
          }
        } else {
          result.push({
            name: item,
            path: relativePath,
            isDir: false,
            isFile: true,
          });
        }
      }

      return result.sort((a, b) => {
        // 目录优先，然后按名称排序
        if (a.isDir && b.isFile) return -1;
        if (a.isFile && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
    };

    const files = buildFileTree(workspace);

    // 返回根目录包装的结果
    return [
      {
        name: path.basename(workspace),
        path: workspace,
        isDir: true,
        isFile: false,
        children: files,
      },
    ];
  } catch (error) {
    return [];
  }
};
