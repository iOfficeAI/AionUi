/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@/agent/acp/AcpDetector';
import { ipcBridge } from '../../common';
import { ProcessChat } from '../initStorage';
import { copyFilesToDirectory, generateHashWithFullName } from '../utils';
import WorkerManage from '../WorkerManage';
import type AcpAgentManager from '../task/AcpAgentManager';
import type { GeminiAgentManager } from '../task/GeminiAgentManager';

export function initAcpBridge(): void {
  // Gemini 专用的 sendMessage provider
  ipcBridge.geminiConversation.sendMessage.provider(async ({ conversation_id, files, ...other }) => {
    const task = WorkerManage.getTaskById(conversation_id) as GeminiAgentManager;
    if (!task) return { success: false, msg: 'conversation not found' };
    if (task.type !== 'gemini') return { success: false, msg: 'unsupported task type for Gemini provider' };
    await copyFilesToDirectory(task.workspace, files);

    // Support Gemini tasks only, ACP has its own provider
    if (task.type === 'gemini') {
      return task
        .sendMessage(other)
        .then(() => ({ success: true }))
        .catch((err) => {
          return { success: false, msg: err };
        });
    }
  });

  // ACP 专用的 sendMessage provider
  ipcBridge.acpConversation.sendMessage.provider(async ({ conversation_id, files, ...other }) => {
    let task = WorkerManage.getTaskById(conversation_id) as AcpAgentManager;
    if (!task) {
      // 任务不存在，尝试重建ACP任务管理器
      const conversation = await ProcessChat.get('chat.history').then((history) => {
        return history?.find((item) => item.id === conversation_id);
      });

      if (!conversation) {
        return { success: false, msg: 'conversation not found' };
      }

      if (conversation.type !== 'acp') {
        return { success: false, msg: 'unsupported conversation type for ACP provider' };
      }

      // 重建ACP任务管理器
      task = WorkerManage.buildConversation(conversation) as AcpAgentManager;
      if (!task) {
        return { success: false, msg: 'failed to rebuild ACP task manager' };
      }

      // 等待ACP连接建立完成，但不阻塞用户消息发送
      try {
        await task.bootstrap;
      } catch (error) {
        return { success: false, msg: 'failed to establish ACP connection' };
      }
    }
    if (task.type !== 'acp') return { success: false, msg: 'unsupported task type for ACP provider' };
    await copyFilesToDirectory(task.workspace, files);
    return task
      .sendMessage({ content: other.input, files, msg_id: other.msg_id })
      .then(() => {
        return { success: true };
      })
      .catch((err) => {
        return { success: false, msg: err?.message || JSON.stringify(err) };
      });
  });

  ipcBridge.geminiConversation.confirmMessage.provider(async ({ confirmKey, msg_id, conversation_id, callId }) => {
    const task = WorkerManage.getTaskById(conversation_id) as GeminiAgentManager;
    if (!task) return { success: false, msg: 'conversation not found' };
    if (task.type !== 'gemini') return { success: false, msg: 'not support' };
    return task
      .confirmMessage({ confirmKey, msg_id, callId })
      .then(() => ({ success: true }))
      .catch((err) => {
        return { success: false, msg: err };
      });
  });

  ipcBridge.acpConversation.confirmMessage.provider(async ({ confirmKey, msg_id, conversation_id, callId }) => {
    const task = WorkerManage.getTaskById(conversation_id) as AcpAgentManager;
    if (!task) {
      return { success: false, msg: 'conversation not found' };
    }

    if (task.type !== 'acp') {
      return { success: false, msg: 'not support' };
    }

    return task
      .confirmMessage({ confirmKey, msg_id, callId })
      .then(() => ({ success: true }))
      .catch((err) => ({ success: false, msg: err }));
  });

  // Debug provider to check environment variables
  ipcBridge.acpConversation.checkEnv.provider(async () => {
    return {
      env: {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '[SET]' : '[NOT SET]',
        GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ? '[SET]' : '[NOT SET]',
        NODE_ENV: process.env.NODE_ENV || '[NOT SET]',
      },
    };
  });

  // 保留旧的detectCliPath接口用于向后兼容，但使用新检测器的结果
  ipcBridge.acpConversation.detectCliPath.provider(async ({ backend }) => {
    const agents = acpDetector.getDetectedAgents();
    const agent = agents.find((a) => a.backend === backend);

    if (agent?.cliPath) {
      return { success: true, data: { path: agent.cliPath } };
    }

    return { success: false, msg: `${backend} CLI not found. Please install it and ensure it's accessible.` };
  });

  ipcBridge.geminiConversation.getWorkspace.provider(async ({ workspace }) => {
    const task = WorkerManage.getTaskById(generateHashWithFullName(workspace));
    if (!task || task.type !== 'gemini') return [];
    return task.postMessagePromise('gemini.get.workspace', {});
  });

  // ACP 的 getWorkspace 实现
  ipcBridge.acpConversation.getWorkspace.provider(async ({ workspace }) => {
    try {
      const fs = await import('fs');
      const path = await import('path');

      // 检查目录是否存在
      if (!fs.existsSync(workspace)) {
        return [];
      }

      // 读取目录内容
      const buildFileTree = (dirPath: string, basePath: string = dirPath): any[] => {
        const result = [];
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

      // 返回的格式需要与 gemini 保持一致
      const result = [
        {
          name: path.basename(workspace),
          path: workspace,
          isDir: true,
          isFile: false,
          children: files,
        },
      ];

      return result;
    } catch (error) {
      return [];
    }
  });

  // 新的ACP检测接口 - 基于全局标记位
  ipcBridge.acpConversation.getAvailableAgents.provider(async () => {
    try {
      const agents = acpDetector.getDetectedAgents();
      return { success: true, data: agents };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}
