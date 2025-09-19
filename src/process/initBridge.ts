/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@/agent/acp/AcpDetector';
import type { IProvider, TChatConversation } from '@/common/storage';
import { uuid } from '@/common/utils';
import { AuthType, clearCachedCredentialFile, Config, getOauthInfoWithCache, loginWithOauth } from '@office-ai/aioncli-core';
import { logger } from '@office-ai/platform';
import { app, dialog, shell } from 'electron';
import fs from 'fs/promises';
import OpenAI from 'openai';
import path from 'path';
import { ipcBridge } from '../common';
import { createAcpAgent, createCodexAgent, createGeminiAgent } from './initAgent';
import { getSystemDir, ProcessChat, ProcessChatMessage, ProcessConfig, ProcessEnv } from './initStorage';
import { nextTickToLocalFinish } from './message';
import type AcpAgentManager from './task/AcpAgentManager';
import type { GeminiAgentManager } from './task/GeminiAgentManager';
import { copyDirectoryRecursively, copyFilesToDirectory, generateHashWithFullName, readDirectoryRecursive } from './utils';
import WorkerManage from './WorkerManage';

logger.config({ print: true });

ipcBridge.dialog.showOpen.provider((options) => {
  return dialog
    .showOpenDialog({
      defaultPath: options?.defaultPath,
      properties: options?.properties,
    })
    .then((res) => {
      return res.filePaths;
    });
});

ipcBridge.shell.openFile.provider(async (path) => {
  shell.openPath(path);
});

ipcBridge.shell.showItemInFolder.provider(async (path) => {
  shell.showItemInFolder(path);
});
ipcBridge.shell.openExternal.provider(async (url) => {
  return shell.openExternal(url);
});

ipcBridge.fs.getFilesByDir.provider(async ({ dir }) => {
  const tree = await readDirectoryRecursive(dir);
  return tree ? [tree] : [];
});
ipcBridge.fs.getImageBase64.provider(async ({ path: filePath }) => {
  try {
    const ext = (path.extname(filePath) || '').toLowerCase().replace(/^\./, '');
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      tif: 'image/tiff',
      tiff: 'image/tiff',
      avif: 'image/avif',
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    const base64 = await fs.readFile(filePath, { encoding: 'base64' });
    return `data:${mime};base64,${base64}`;
  } catch (error) {
    console.error(`Failed to read image file: ${filePath}`, error);
    // Return a placeholder data URL instead of throwing
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4=';
  }
});

ipcBridge.conversation.create.provider(async (params): Promise<TChatConversation> => {
  const { type, extra, name, model } = params;
  const buildConversation = async () => {
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

ipcBridge.application.restart.provider(async () => {
  // 清理所有工作进程
  WorkerManage.clear();
  // 重启应用 - 使用标准的 Electron 重启方式
  app.relaunch();
  app.exit(0);
});

ipcBridge.application.updateSystemInfo.provider(async ({ cacheDir, workDir }) => {
  try {
    const oldDir = getSystemDir();
    if (oldDir.cacheDir !== cacheDir) {
      await copyDirectoryRecursively(oldDir.cacheDir, cacheDir);
    }
    await ProcessEnv.set('aionui.dir', { cacheDir, workDir });
    return { success: true };
  } catch (e) {
    return { success: false, msg: e.message || e.toString() };
  }
});

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

// Codex 专用的 sendMessage provider
ipcBridge.codexConversation.sendMessage.provider(async ({ conversation_id, files, ...other }) => {
  const task = WorkerManage.getTaskById(conversation_id) as any;
  if (!task) {
    // 尝试从历史重建任务
    const conversation = await ProcessChat.get('chat.history').then((history) => history?.find((item) => item.id === conversation_id));
    if (!conversation || conversation.type !== 'codex') {
      return { success: false, msg: 'conversation not found' };
    }
    const rebuilt = WorkerManage.buildConversation(conversation);
    if (!rebuilt) return { success: false, msg: 'failed to rebuild codex task' };
  }

  const codexTask: any = WorkerManage.getTaskById(conversation_id);
  if (!codexTask || codexTask.type !== 'codex') return { success: false, msg: 'unsupported task type for Codex provider' };

  // 处理文件路径：区分上传文件（绝对路径）和工作空间文件（相对路径）
  if (files && files.length > 0) {
    const processedFiles: string[] = [];
    for (const file of files) {
      if (path.isAbsolute(file)) {
        // 上传的文件，直接使用绝对路径
        processedFiles.push(file);
      } else {
        // 工作空间文件，转换为绝对路径
        const absolutePath = path.join(codexTask.workspace, file);
        try {
          await fs.access(absolutePath); // 检查文件是否存在
          processedFiles.push(absolutePath);
          console.log(`📁 [initBridge] Found workspace file: ${file} -> ${absolutePath}`);
        } catch (error) {
          console.warn(`⚠️ [initBridge] Workspace file not found: ${file}, skipping`);
        }
      }
    }

    // 只复制上传的文件，工作空间文件已经在目标位置
    const uploadedFiles = processedFiles.filter((f) => !f.startsWith(codexTask.workspace));
    if (uploadedFiles.length > 0) {
      await copyFilesToDirectory(codexTask.workspace, uploadedFiles);
      console.log(`📁 [initBridge] Copied ${uploadedFiles.length} uploaded files to workspace`);
    }
  }

  return codexTask
    .sendMessage({ content: other.input, files, msg_id: other.msg_id })
    .then(() => ({ success: true }))
    .catch((err: { message: any }) => ({ success: false, msg: err?.message || String(err) }));
});

// Codex 确认消息（占位实现，用于更新前端状态）
ipcBridge.codexConversation.confirmMessage.provider(async ({ confirmKey, msg_id, conversation_id, callId }) => {
  const task = WorkerManage.getTaskById(conversation_id) as any;
  if (!task) return { success: false, msg: 'conversation not found' };
  if (task.type !== 'codex') return { success: false, msg: 'not support' };
  try {
    await task.confirmMessage({ confirmKey, msg_id, callId });
    return { success: true };
  } catch (e: any) {
    return { success: false, msg: e?.message || String(e) };
  }
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

// Force clear all ACP and Google auth cache - temporarily commented out
/*
// @ts-expect-error - temporary fix for type issue
ipcBridge.acpConversation.clearAllCache?.provider(async () => {
  try {
    // Clear ACP config cache
    await AcpConfigManager.clearAllConfig();
    
    // Clear Google OAuth cache
    const oauthResult = await clearCachedCredentialFile();
    
    return { 
      success: true, 
      msg: 'All cache cleared successfully',
      details: { oauthResult }
    };
  } catch (error) {
    return { 
      success: false, 
      msg: error instanceof Error ? error.message : String(error) 
    };
  }
});
*/

// 保留旧的detectCliPath接口用于向后兼容，但使用新检测器的结果
ipcBridge.acpConversation.detectCliPath.provider(async ({ backend }) => {
  const agents = acpDetector.getDetectedAgents();
  const agent = agents.find((a) => a.backend === backend);

  if (agent?.cliPath) {
    return { success: true, data: { path: agent.cliPath } };
  }

  return { success: false, msg: `${backend} CLI not found. Please install it and ensure it's accessible.` };
});

ipcBridge.conversation.stop.provider(async ({ conversation_id }) => {
  const task = WorkerManage.getTaskById(conversation_id);
  if (!task) return { success: true, msg: 'conversation not found' };
  if (task.type !== 'gemini' && task.type !== 'acp' && task.type !== 'codex') return { success: false, msg: 'not support' };
  return task.stop().then(() => ({ success: true }));
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

// Codex 的 getWorkspace 复用 ACP 的实现
ipcBridge.codexConversation.getWorkspace.provider(async ({ workspace }) => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    if (!fs.existsSync(workspace)) return [] as any[];
    const buildFileTree = (dirPath: string, basePath: string = dirPath): any[] => {
      const result: any[] = [];
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        if (item.startsWith('.')) continue;
        if (item === 'node_modules') continue;
        const itemPath = path.join(dirPath, item);
        const relativePath = path.relative(basePath, itemPath);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          const children = buildFileTree(itemPath, basePath);
          if (children.length > 0) {
            result.push({ name: item, path: relativePath, isDir: true, isFile: false, children });
          }
        } else {
          result.push({ name: item, path: relativePath, isDir: false, isFile: true });
        }
      }
      return result.sort((a, b) => {
        if (a.isDir && b.isFile) return -1;
        if (a.isFile && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
    };
    const files = buildFileTree(workspace);
    return [{ name: path.basename(workspace), path: workspace, isDir: true, isFile: false, children: files }];
  } catch {
    return [] as any[];
  }
});

ipcBridge.googleAuth.status.provider(async ({ proxy }) => {
  try {
    const info = await getOauthInfoWithCache(proxy);

    if (info) return { success: true, data: { account: info.email } };
    return { success: false };
  } catch (e) {
    return { success: false, msg: e.message || e.toString() };
  }
});
ipcBridge.googleAuth.login.provider(async ({ proxy }) => {
  const config = new Config({
    proxy,
    sessionId: '',
    targetDir: '',
    debugMode: false,
    cwd: '',
    model: '',
  });
  const client = await loginWithOauth(AuthType.LOGIN_WITH_GOOGLE, config);

  if (client) {
    // After successful login, get the actual account info
    try {
      const oauthInfo = await getOauthInfoWithCache(proxy);
      if (oauthInfo && oauthInfo.email) {
        return { success: true, data: { account: oauthInfo.email } };
      }
    } catch (_error) {
      // Even if we can't get the email, login was successful
      return { success: true };
    }
    return { success: true, data: { account: '' } };
  }
  return { success: false };
});

ipcBridge.googleAuth.logout.provider(async () => {
  return clearCachedCredentialFile();
});

ipcBridge.mode.fetchModelList.provider(async function fetchModelList({ base_url, api_key, try_fix, platform }): Promise<{ success: boolean; msg?: string; data?: { mode: Array<string>; fix_base_url?: string } }> {
  // 如果是多key（包含逗号或回车），只取第一个key来获取模型列表
  let actualApiKey = api_key;
  if (api_key && (api_key.includes(',') || api_key.includes('\n'))) {
    actualApiKey = api_key.split(/[,\n]/)[0].trim();
  }

  // 如果是 Vertex AI 平台，直接返回 Vertex AI 支持的模型列表
  if (platform?.includes('vertex-ai')) {
    console.log('Using Vertex AI model list');
    const vertexAIModels = ['gemini-2.5-pro', 'gemini-2.5-flash'];
    return { success: true, data: { mode: vertexAIModels } };
  }

  // 如果是 Gemini 平台，使用 Gemini API 协议
  if (platform?.includes('gemini')) {
    try {
      // 使用自定义 base_url 或默认的 Gemini endpoint
      const geminiUrl = base_url ? `${base_url}/models?key=${encodeURIComponent(actualApiKey)}` : `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(actualApiKey)}`;

      const response = await fetch(geminiUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.models || !Array.isArray(data.models)) {
        throw new Error('Invalid response format');
      }

      // 提取模型名称，移除 "models/" 前缀
      const modelList = data.models.map((model: { name: string }) => {
        const name = model.name;
        return name.startsWith('models/') ? name.substring(7) : name;
      });

      return { success: true, data: { mode: modelList } };
    } catch (e: any) {
      // 对于 Gemini 平台，API 调用失败时回退到默认模型列表
      if (platform?.includes('gemini')) {
        console.warn('Failed to fetch Gemini models via API, falling back to default list:', e.message);
        // 导入默认的 Gemini 模型列表
        const defaultGeminiModels = ['gemini-2.5-pro', 'gemini-2.5-flash'];
        return { success: true, data: { mode: defaultGeminiModels } };
      }
      return { success: false, msg: e.message || e.toString() };
    }
  }

  const openai = new OpenAI({
    baseURL: base_url,
    apiKey: actualApiKey,
  });

  try {
    const res = await openai.models.list();
    // 检查返回的数据是否有效 lms 获取失败时仍然会返回有效空数据
    if (res.data?.length === 0) {
      throw new Error('Invalid response: empty data');
    }
    return { success: true, data: { mode: res.data.map((v) => v.id) } };
  } catch (e) {
    const errRes = { success: false, msg: e.message || e.toString() };

    if (!try_fix) return errRes;

    // 如果是API key问题，直接返回错误，不尝试修复URL
    if (e.status === 401 || e.message?.includes('401') || e.message?.includes('Unauthorized') || e.message?.includes('Invalid API key')) {
      return errRes;
    }

    const url = new URL(base_url);
    const fixedBaseUrl = `${url.protocol}//${url.host}/v1`;

    if (fixedBaseUrl === base_url) return errRes;

    const retryRes = await fetchModelList({ base_url: fixedBaseUrl, api_key: api_key, try_fix: false });
    if (retryRes.success) {
      return { ...retryRes, data: { mode: retryRes.data.mode, fix_base_url: fixedBaseUrl } };
    }
    return retryRes;
  }
});

ipcBridge.mode.saveModelConfig.provider((models) => {
  return ProcessConfig.set('model.config', models)
    .then(() => {
      return { success: true };
    })
    .catch((e) => {
      return { success: false, msg: e.message || e.toString() };
    });
});

ipcBridge.mode.getModelConfig.provider(async () => {
  return ProcessConfig.get('model.config')
    .then((data) => {
      if (!data) return [];

      // Handle migration from old IModel format to new IProvider format
      return data.map((v: any, _index: number) => {
        // Check if this is old format (has 'selectedModel' field) vs new format (has 'useModel')
        if ('selectedModel' in v && !('useModel' in v)) {
          // Migrate from old format
          return {
            ...v,
            useModel: v.selectedModel, // Rename selectedModel to useModel
            id: v.id || uuid(),
            capabilities: v.capabilities || [], // Add missing capabilities field
            contextLimit: v.contextLimit, // Keep existing contextLimit if present
          };
          // Note: we don't delete selectedModel here as this is read-only migration
        }

        // Already in new format or unknown format, just ensure ID exists
        return {
          ...v,
          id: v.id || uuid(),
          useModel: v.useModel || v.selectedModel || '', // Fallback for edge cases
        };
      });
    })
    .catch(() => {
      return [] as IProvider[];
    });
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

// 初始化ACP检测器
export async function initializeAcpDetector(): Promise<void> {
  try {
    await acpDetector.initialize();
  } catch (error) {
    console.error('[ACP] Failed to initialize detector:', error);
  }
}
